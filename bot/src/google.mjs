// Google 連携: Search Console(検索クエリ)、GA4(閲覧数)、スプレッドシート(記録)
// どれも環境変数が無ければ null / 何もしない で動く
import { google } from 'googleapis';
import { env } from './config.mjs';

let authP = null;
function auth() {
  if (!env.googleKeyFile) return null;
  authP ??= new google.auth.GoogleAuth({
    keyFile: env.googleKeyFile,
    scopes: [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });
  return authP;
}

const ymd = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };

/** Search Console: 直近 days 日の クエリ×ページ(上位 rows 件) と ページ別合計 */
export async function fetchSearchConsole(days = 28, rows = 300) {
  const a = auth();
  if (!a || !env.gscSiteUrl) return null;
  const sc = google.searchconsole({ version: 'v1', auth: a });
  const base = { startDate: ymd(daysAgo(days + 2)), endDate: ymd(daysAgo(2)) }; // GSCは2日遅れ
  const q = await sc.searchanalytics.query({ siteUrl: env.gscSiteUrl, requestBody: { ...base, dimensions: ['query', 'page'], rowLimit: rows, orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }] } }).catch((e) => { console.error('GSC(query)失敗:', e.message); return null; });
  const p = await sc.searchanalytics.query({ siteUrl: env.gscSiteUrl, requestBody: { ...base, dimensions: ['page'], rowLimit: 500 } }).catch(() => null);
  const row = (r) => ({ clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 });
  return {
    period: base,
    queries: (q?.data.rows || []).map((r) => ({ query: r.keys[0], page: r.keys[1], ...row(r) })),
    pages: (p?.data.rows || []).map((r) => ({ page: r.keys[0], ...row(r) })),
  };
}

/** GA4: 直近 days 日の ページ別 閲覧数・平均滞在(秒) */
export async function fetchGA4(days = 28) {
  const a = auth();
  if (!a || !env.ga4PropertyId) return null;
  const ga = google.analyticsdata({ version: 'v1beta', auth: a });
  const res = await ga.properties.runReport({
    property: `properties/${env.ga4PropertyId}`,
    requestBody: {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'userEngagementDuration' }, { name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 300,
    },
  }).catch((e) => { console.error('GA4失敗:', e.message); return null; });
  return (res?.data.rows || []).map((r) => {
    const views = Number(r.metricValues[0].value), eng = Number(r.metricValues[1].value), sess = Number(r.metricValues[2].value);
    return { path: r.dimensionValues[0].value, views, sessions: sess, avgEngageSec: sess ? Math.round(eng / sess) : 0 };
  });
}

// ---------- スプレッドシート ----------
const TABS = {
  articles: { name: '記事', header: ['slug', 'タイトル', 'カテゴリ', '公開日', 'URL', 'キーワード', 'クリック(28日)', '表示回数(28日)', 'CTR%', '平均順位', '閲覧数(GA4)', '更新日時'] },
  queries: { name: '検索クエリ', header: ['クエリ', 'ページ', 'クリック', '表示回数', 'CTR%', '平均順位', '取得日'] },
  candidates: { name: '候補', header: ['提案日', 'ID', 'ラベル', 'テーマ', '狙う語', '種類', '理由', '状態', 'slug/URL'] },
  log: { name: 'ログ', header: ['日時', '内容'] },
  staff: { name: 'スタッフ', header: ['名前', '状態', 'LINEユーザーID', 'LINE表示名', '申請日時', '承認/却下日時', '処理した管理者'] },
};

async function sheetsClient() {
  const a = auth();
  if (!a || !env.sheetId) return null;
  const sheets = google.sheets({ version: 'v4', auth: a });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.sheetId }).catch((e) => { console.error('Sheets失敗:', e.message); return null; });
  if (!meta) return null;
  const existing = new Set(meta.data.sheets.map((s) => s.properties.title));
  const missing = Object.values(TABS).filter((t) => !existing.has(t.name));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: env.sheetId, requestBody: { requests: missing.map((t) => ({ addSheet: { properties: { title: t.name } } })) } });
    for (const t of missing) await sheets.spreadsheets.values.update({ spreadsheetId: env.sheetId, range: `'${t.name}'!A1`, valueInputOption: 'RAW', requestBody: { values: [t.header] } });
  }
  return sheets;
}

/** タブの中身をヘッダー以外すべて置き換える */
export async function replaceTab(key, rows) {
  const sheets = await sheetsClient();
  if (!sheets) return;
  const t = TABS[key];
  await sheets.spreadsheets.values.clear({ spreadsheetId: env.sheetId, range: `'${t.name}'!A2:Z` });
  if (rows.length) await sheets.spreadsheets.values.update({ spreadsheetId: env.sheetId, range: `'${t.name}'!A2`, valueInputOption: 'RAW', requestBody: { values: rows } });
}

export async function appendRows(key, rows) {
  const sheets = await sheetsClient();
  if (!sheets || !rows.length) return;
  await sheets.spreadsheets.values.append({ spreadsheetId: env.sheetId, range: `'${TABS[key].name}'!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: rows } });
}

/** 候補タブの「状態」を更新する(IDで探す) */
export async function updateCandidateStatus(id, status, slugOrUrl = '') {
  const sheets = await sheetsClient();
  if (!sheets) return;
  const t = TABS.candidates.name;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.sheetId, range: `'${t}'!A2:I` }).catch(() => null);
  const rows = res?.data.values || [];
  const i = rows.findIndex((r) => r[1] === id);
  if (i < 0) return;
  await sheets.spreadsheets.values.update({ spreadsheetId: env.sheetId, range: `'${t}'!H${i + 2}:I${i + 2}`, valueInputOption: 'RAW', requestBody: { values: [[status, slugOrUrl]] } });
}

export const now = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
export const log = (text) => appendRows('log', [[now(), text]]).catch(() => {});
