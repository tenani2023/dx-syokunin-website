// LINE Webhook サーバー
import crypto from 'node:crypto';
import express from 'express';
import cron from 'node-cron';
import { middleware, messagingApi } from '@line/bot-sdk';
import { env, keywords } from './config.mjs';
import { generateArticle } from './generate.mjs';
import { publishArticle, setDraft, deletePost, listPosts, readPost, syncRepo, deploySite } from './publish.mjs';
import { planCandidates, getCandidate } from './planner.mjs';
import { updateCandidateStatus, log } from './google.mjs';

const line = new messagingApi.MessagingApiClient({ channelAccessToken: env.lineToken });
const app = express();

const HELP = [
  '【DX職人 コラム投稿ボット】',
  '「候補」と送ると、検索データと既存記事から「次に書くべき4本」をボタンで提案します。タップすると記事と画像を作って公開します(3〜6分)。',
  '',
  'コマンド:',
  '候補 … おすすめテーマを4つ提案(ボタン)',
  '下書き候補 … 同じ提案だが、下書きで作る',
  '一覧 … 最近の記事10本',
  '公開 <slug> … 下書きを公開',
  '削除 <slug> … 記事を削除',
  'ヘルプ … この説明',
  '',
  'テーマを文章で送っても、その内容で1本作ります。',
  '例) IT導入補助金 LINE 見積システム',
].join('\n');

// 1件ずつ順番に処理する
let queue = Promise.resolve();
const enqueue = (job) => { queue = queue.then(job, job); return queue; };

const push = (to, text, quickReply) => line.pushMessage({ to, messages: [{ type: 'text', text, ...(quickReply ? { quickReply } : {}) }] }).catch((e) => console.error('push失敗', e.message));
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ---------- 候補の提案(クイックリプライ) ----------
const lastProposed = new Map(); // userId → 直近に提案したテーマ(「別の候補」で除外する)

async function suggest(userId, { draft = false, more = false } = {}) {
  await push(userId, more ? '別の候補を探しています…' : '検索データと既存記事を見て、次に書くべきテーマを選んでいます(1分ほど)…');
  try {
    const exclude = more ? (lastProposed.get(userId) || []) : [];
    const { summary, candidates, hasSearchData } = await planCandidates({ exclude });
    lastProposed.set(userId, [...exclude, ...candidates.map((c) => c.theme)].slice(-12));
    const body = [
      hasSearchData ? '直近28日の検索データをもとに選びました。' : '(Search Console 未接続のため、既存記事とキーワード表から選びました)',
      summary,
      '',
      ...candidates.map((c, i) => `${i + 1}. ${c.theme}${c.type === 'rewrite' ? `(改稿: ${c.rewriteSlug})` : ''}\n   狙う語: ${c.targetKeywords.join(', ')}\n   理由: ${c.reason}`),
      '',
      `下のボタンをタップすると、その記事を${draft ? '下書きで' : ''}作ります。`,
    ].join('\n');
    const items = candidates.map((c, i) => ({
      type: 'action',
      action: { type: 'postback', label: `${i + 1} ${c.label}`.slice(0, 20), data: `pick=${c.id}&draft=${draft ? 1 : 0}`, displayText: `${i + 1}. ${c.theme} を${draft ? '下書きで' : ''}作る` },
    }));
    items.push({ type: 'action', action: { type: 'postback', label: '別の候補', data: `more=1&draft=${draft ? 1 : 0}`, displayText: '別の候補' } });
    items.push({ type: 'action', action: { type: 'postback', label: '自分で入力', data: 'manual=1', displayText: '自分で入力する' } });
    await push(userId, body, { items });
    await log(`候補を提案: ${candidates.map((c) => c.label).join(' / ')}`);
  } catch (e) {
    console.error(e);
    await push(userId, `候補の作成に失敗しました: ${e.message}`);
  }
}

// ---------- 記事の作成・公開 ----------
async function createAndPublish(userId, brief, { draft = false, slugHint, candidateId } = {}) {
  const theme = typeof brief === 'string' ? brief : brief.theme;
  const rewriteSlug = typeof brief === 'object' && brief.type === 'rewrite' ? brief.rewriteSlug : '';
  await push(userId, `${rewriteSlug ? '改稿' : draft ? '下書き' : '記事'}を作り始めました。\nテーマ: ${theme}\n(3〜6分ほどかかります)`);
  try {
    await syncRepo();
    const existing = listPosts().filter((p) => p.slug !== rewriteSlug).map((p) => p.title);
    let rewrite;
    if (rewriteSlug) {
      const old = readPost(rewriteSlug);
      rewrite = { slug: rewriteSlug, title: old.title, body: old.body };
    }
    const { article } = await generateArticle(brief, { existingTitles: existing, today: today(), rewrite });
    if (slugHint && !rewriteSlug) article.slug = slugHint;
    let last = 0;
    const url = await publishArticle(article, {
      draft, overwriteSlug: rewriteSlug,
      onProgress: (s) => { if (Date.now() - last > 60000) { last = Date.now(); push(userId, s + '…'); } },
    });
    await push(userId, [
      `${draft ? '下書きができました' : '公開しました'}。`,
      '',
      article.title,
      url,
      '',
      ...(draft ? [`公開するには「公開 ${article.slug}」と送ってください。`] : ['反映まで1〜2分かかることがあります。']),
    ].join('\n'));
    if (candidateId) await updateCandidateStatus(candidateId, draft ? '下書き' : '公開', url).catch(() => {});
    await log(`${draft ? '下書き' : '公開'}: ${article.title} ${url}`);
  } catch (e) {
    console.error(e);
    await push(userId, `失敗しました: ${e.message}`);
    await log(`失敗: ${theme} / ${e.message}`);
  }
}

// ---------- テキストコマンド ----------
async function handleText(userId, text) {
  const t = text.trim();
  if (!t) return;
  if (/^(ヘルプ|help|\?)$/i.test(t)) return push(userId, HELP);
  if (/^(候補|おすすめ|次|提案)$/.test(t)) return suggest(userId);
  if (/^下書き候補$/.test(t)) return suggest(userId, { draft: true });

  if (t === '一覧') {
    const posts = listPosts().slice(0, 10);
    return push(userId, posts.length ? posts.map((p) => `${p.draft ? '[下書き] ' : ''}${p.date} ${p.title}\n  slug: ${p.slug}`).join('\n') : '記事がありません');
  }
  let m;
  if ((m = t.match(/^下書き\s+([\s\S]+)/))) return enqueue(() => createAndPublish(userId, m[1].trim(), { draft: true }));
  if ((m = t.match(/^公開\s+([a-z0-9-]+)$/))) {
    return enqueue(async () => {
      try { const url = await setDraft(m[1], false); await push(userId, `公開しました。\n${url}`); }
      catch (e) { await push(userId, `失敗しました: ${e.message}`); }
    });
  }
  if ((m = t.match(/^削除\s+([a-z0-9-]+)$/))) {
    return enqueue(async () => {
      try { await deletePost(m[1]); await push(userId, `削除しました: ${m[1]}`); }
      catch (e) { await push(userId, `失敗しました: ${e.message}`); }
    });
  }
  // 1〜4 の数字だけなら、直近の候補の番号として扱う
  return enqueue(() => createAndPublish(userId, t));
}

// ---------- ボタン(postback) ----------
async function handlePostback(userId, data) {
  const p = new URLSearchParams(data);
  const draft = p.get('draft') === '1';
  if (p.get('more')) return suggest(userId, { draft, more: true });
  if (p.get('manual')) return push(userId, 'テーマを文章で送ってください。\n例) IT導入補助金 LINE 見積システム\n下書きにするなら「下書き テーマ」と送ります。');
  const id = p.get('pick');
  if (id) {
    const c = getCandidate(id);
    if (!c) return push(userId, 'この候補は古くなっています。「候補」と送って、もう一度選んでください。');
    const hint = keywords.find((k) => k.theme === c.theme)?.slug;
    return enqueue(() => createAndPublish(userId, c, { draft, slugHint: hint, candidateId: id }));
  }
}

// ---------- GitHub からの push を受けてサイトを再生成(リポジトリ > Settings > Webhooks) ----------
app.post('/deploy', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  if (!env.deploySecret) return res.status(404).end();
  const sig = String(req.get('x-hub-signature-256') || '');
  const want = 'sha256=' + crypto.createHmac('sha256', env.deploySecret).update(req.body).digest('hex');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.status(401).end();
  res.status(202).send('deploying');
  enqueue(() => deploySite().then(() => console.log('deploy 完了'), (e) => console.error('deploy 失敗', e.message)));
});

// ---------- Webhook ----------
app.get('/', (_req, res) => res.send('ok'));
app.post('/webhook', middleware({ channelSecret: env.lineSecret }), (req, res) => {
  res.status(200).end(); // LINE には先に返す
  for (const ev of req.body.events || []) {
    const userId = ev.source?.userId;
    if (!userId) continue;
    if (!env.allowed.includes(userId)) {
      console.log('未許可のユーザー:', userId);
      if (ev.replyToken) line.replyMessage({ replyToken: ev.replyToken, messages: [{ type: 'text', text: `このアカウントは登録されていません。\n管理者に次のIDを伝えてください:\n${userId}` }] }).catch(() => {});
      continue;
    }
    if (ev.type === 'message' && ev.message?.type === 'text') handleText(userId, ev.message.text).catch((e) => console.error(e));
    else if (ev.type === 'postback') handlePostback(userId, ev.postback.data).catch((e) => console.error(e));
    else if (ev.type === 'follow') push(userId, HELP);
  }
});

// ---------- 定期提案(例: 毎週月曜 8:00) ----------
if (env.suggestCron && env.allowed.length) {
  if (!cron.validate(env.suggestCron)) console.error('SUGGEST_CRON の形式が不正です:', env.suggestCron);
  else cron.schedule(env.suggestCron, () => { for (const uid of env.allowed) suggest(uid); }, { timezone: 'Asia/Tokyo' });
}

app.listen(env.port, () => console.log(`DX職人 コラムボット: http://localhost:${env.port}/webhook`));
