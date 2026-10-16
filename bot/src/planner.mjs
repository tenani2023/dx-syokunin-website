// 次に書く記事の候補を、検索データ・既存記事・キーワード表から Claude に選ばせる
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { structured } from './llm.mjs';
import { env, site, keywords, BOT_DIR } from './config.mjs';
import { listPosts, readPost } from './publish.mjs';
import { fetchSearchConsole, fetchGA4, replaceTab, appendRows, now } from './google.mjs';

const plannerPrompt = fs.readFileSync(path.join(BOT_DIR, 'prompts', 'planner.md'), 'utf8');

const Plan = z.object({
  summary: z.string(),
  candidates: z.array(z.object({
    label: z.string(),
    theme: z.string(),
    targetKeywords: z.array(z.string()),
    searchIntent: z.string(),
    angle: z.string(),
    reason: z.string(),
    type: z.enum(['new', 'rewrite']),
    rewriteSlug: z.string().nullable(),
    category: z.enum(Object.keys(site.categories)),
  })),
});

// 提案した候補はしばらく覚えておく(ボタンのタップに対応するため)
const store = new Map();
export const getCandidate = (id) => store.get(id);

/** データを集め、候補を4本作って返す */
export async function planCandidates({ exclude = [] } = {}) {
  const posts = listPosts().filter((p) => !p.draft);
  const details = posts.map((p) => {
    const d = readPost(p.slug);
    return { slug: p.slug, title: p.title, category: d.category, date: p.date, description: d.description, keywords: d.keywords, headings: d.headings };
  });
  const [gsc, ga] = await Promise.all([fetchSearchConsole(28, 300), fetchGA4(28)]);
  const siteBase = site.url.replace(/\/$/, '');

  // 記事ごとに成果をひも付ける
  const perf = details.map((d) => {
    const url = `${siteBase}/column/${d.slug}.html`;
    const g = gsc?.pages.find((r) => r.page === url);
    const a = ga?.find((r) => r.path.endsWith(`/column/${d.slug}.html`));
    return { ...d, clicks: g?.clicks ?? 0, impressions: g?.impressions ?? 0, ctr: g?.ctr ?? 0, position: g?.position ?? null, views: a?.views ?? 0 };
  });
  const written = new Set(posts.map((p) => p.slug));
  const unwritten = keywords.filter((k) => !written.has(k.slug));

  // スプレッドシートへ記録(設定があれば)
  const stamp = now();
  await replaceTab('articles', perf.map((p) => [p.slug, p.title, site.categories[p.category]?.name || p.category, p.date, `${siteBase}/column/${p.slug}.html`, (p.keywords || []).join(', '), p.clicks, p.impressions, p.ctr, p.position ?? '', p.views, stamp])).catch(() => {});
  if (gsc) await replaceTab('queries', gsc.queries.map((q) => [q.query, q.page, q.clicks, q.impressions, q.ctr, q.position, stamp])).catch(() => {});

  const data = [
    `# 今日: ${stamp.slice(0, 10)}`,
    `# 既存記事(${perf.length}本)と直近28日の成果`,
    ...perf.map((p) => `- [${p.slug}] ${p.title} / ${p.category} / ${p.date} / クリック${p.clicks} 表示${p.impressions} CTR${p.ctr}% 順位${p.position ?? '-'} 閲覧${p.views}\n  説明: ${p.description}\n  見出し: ${p.headings.join(' | ')}`),
    '',
    gsc ? `# 検索クエリ(直近28日、表示回数順、上位${gsc.queries.length}件)\n` + gsc.queries.slice(0, 150).map((q) => `- "${q.query}" → ${q.page.replace(siteBase, '')} / クリック${q.clicks} 表示${q.impressions} CTR${q.ctr}% 順位${q.position}`).join('\n') : '# 検索クエリ: まだデータなし(Search Console 未接続か、計測が始まったばかり)',
    '',
    `# キーワード表の未執筆テーマ(${unwritten.length}件)`,
    ...unwritten.map((k) => `- [${k.category}] ${k.theme}`),
    '',
    exclude.length ? `# 今回は除外するテーマ(すでに提案して選ばれなかった)\n${exclude.map((t) => `- ${t}`).join('\n')}` : '',
    '',
    `カテゴリ: ${Object.entries(site.categories).map(([k, c]) => `${k}=${c.name}`).join(', ')}`,
    '上の優先順位に従って、次に書く記事を4本選んでください。',
  ].join('\n');

  const { data: plan } = await structured({ system: plannerPrompt, user: data, schema: Plan, name: 'plan', maxTokens: 16000 });

  const out = plan.candidates.slice(0, 4).map((c) => {
    const id = crypto.randomBytes(3).toString('hex');
    const cand = { id, ...c, label: c.label.slice(0, 20), proposedAt: stamp };
    store.set(id, cand);
    return cand;
  });
  // 古い候補は捨てる(直近40件まで)
  while (store.size > 40) store.delete(store.keys().next().value);
  await appendRows('candidates', out.map((c) => [stamp, c.id, c.label, c.theme, c.targetKeywords.join(', '), c.type === 'rewrite' ? `改稿(${c.rewriteSlug})` : '新規', c.reason, '提案', ''])).catch(() => {});
  return { summary: plan.summary, candidates: out, hasSearchData: !!gsc };
}
