// LINE Webhook サーバー
import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import { env, keywords } from './config.mjs';
import { generateArticle } from './generate.mjs';
import { publishArticle, setDraft, deletePost, listPosts, syncRepo } from './publish.mjs';

const line = new messagingApi.MessagingApiClient({ channelAccessToken: env.lineToken });
const app = express();

const HELP = [
  '【DX職人 コラム投稿ボット】',
  'テーマを送ると、記事と画像を作ってサイトに公開します(3〜6分)。',
  '',
  '例) IT導入補助金 LINE 見積システム',
  '',
  'コマンド:',
  '次 … キーワード表の次のテーマで1本公開',
  '候補 … 次に書くテーマを5つ表示',
  '下書き <テーマ> … 公開せず下書きで作る(URLで確認できる)',
  '公開 <slug> … 下書きを公開',
  '削除 <slug> … 記事を削除',
  '一覧 … 最近の記事10本',
  'ヘルプ … この説明',
].join('\n');

// 1件ずつ順番に処理する
let queue = Promise.resolve();
const enqueue = (job) => { queue = queue.then(job, job); return queue; };

const push = (to, text) => line.pushMessage({ to, messages: [{ type: 'text', text }] }).catch((e) => console.error('push失敗', e.message));

function nextKeywords(count = 5) {
  const done = new Set(listPosts().map((p) => p.slug));
  return keywords.filter((k) => !done.has(k.slug) && ![...done].some((s) => s.startsWith(k.slug + '-'))).slice(0, count);
}

async function createAndPublish(userId, theme, { draft = false, slugHint } = {}) {
  await push(userId, `${draft ? '下書き' : '記事'}を作り始めました。\nテーマ: ${theme}\n(3〜6分ほどかかります)`);
  try {
    await syncRepo();
    const existing = listPosts().map((p) => p.title);
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const { article } = await generateArticle(theme, { existingTitles: existing, today });
    if (slugHint) article.slug = slugHint;
    let last = 0;
    const url = await publishArticle(article, {
      draft,
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
  } catch (e) {
    console.error(e);
    await push(userId, `失敗しました: ${e.message}`);
  }
}

async function handleText(userId, text) {
  const t = text.trim();
  if (!t) return;
  if (/^(ヘルプ|help|\?)$/i.test(t)) return push(userId, HELP);

  if (t === '一覧') {
    const posts = listPosts().slice(0, 10);
    return push(userId, posts.length ? posts.map((p) => `${p.draft ? '[下書き] ' : ''}${p.date} ${p.title}\n  slug: ${p.slug}`).join('\n') : '記事がありません');
  }
  if (t === '候補') {
    const ks = nextKeywords(5);
    return push(userId, ks.length ? '次に書くテーマ:\n' + ks.map((k, i) => `${i + 1}. ${k.theme}`).join('\n') + '\n\n「次」と送ると1番を作ります。' : 'キーワード表のテーマはすべて書き終えました。');
  }
  if (t === '次') {
    const [k] = nextKeywords(1);
    if (!k) return push(userId, 'キーワード表のテーマはすべて書き終えました。テーマを直接送ってください。');
    return enqueue(() => createAndPublish(userId, k.theme, { slugHint: k.slug }));
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
  return enqueue(() => createAndPublish(userId, t));
}

app.get('/', (_req, res) => res.send('ok'));
app.post('/webhook', middleware({ channelSecret: env.lineSecret }), (req, res) => {
  res.status(200).end(); // LINE には先に返す
  for (const ev of req.body.events || []) {
    if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
    const userId = ev.source?.userId;
    if (!userId) continue;
    if (!env.allowed.includes(userId)) {
      console.log('未許可のユーザー:', userId);
      line.replyMessage({ replyToken: ev.replyToken, messages: [{ type: 'text', text: `このアカウントは登録されていません。\n管理者に次のIDを伝えてください:\n${userId}` }] }).catch(() => {});
      continue;
    }
    handleText(userId, ev.message.text).catch((e) => console.error(e));
  }
});

app.listen(env.port, () => console.log(`DX職人 コラムボット: http://localhost:${env.port}/webhook`));
