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
import { isAdmin, canPost, getStaff, listStaff, request as requestStaff, decide, stop as stopStaff } from './staff.mjs';
import { linkStaffMenu, unlinkStaffMenu } from './richmenu.mjs';

for (const k of ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'OPENAI_API_KEY']) if (!process.env[k]) { console.error(`環境変数 ${k} がありません(.env を確認)`); process.exit(1); }
const line = new messagingApi.MessagingApiClient({ channelAccessToken: env.lineToken });
const app = express();

const HELP = [
  '【DX職人 コラム投稿】',
  'メニューの「コラム投稿」を押すと、検索データと既存記事から「次に書くべき4本」をボタンで提案します。タップすると記事と画像を作って公開します(3〜6分)。',
  '',
  'コマンド:',
  '候補 … おすすめテーマを4つ提案(ボタン)',
  '下書き候補 … 同じ提案だが、下書きで作る',
  'テーマ <内容> … 自分で決めたテーマで1本作る',
  '下書き <内容> … 同じく下書きで作る',
  '一覧 … 最近の記事10本',
  '公開 <slug> … 下書きを公開',
  '削除 <slug> … 記事を削除',
  'ヘルプ … この説明',
].join('\n');

const ADMIN_HELP = [
  '',
  '管理者用:',
  'スタッフ一覧 … 登録状況',
  'スタッフ停止 <名前> … 投稿できないようにする',
].join('\n');

const helpFor = (uid) => HELP + (isAdmin(uid) ? '\n' + ADMIN_HELP : '');

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
    items.push({ type: 'action', action: { type: 'postback', label: '自分で入力', data: `manual=1&draft=${draft ? 1 : 0}`, displayText: '自分で入力する' } });
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
  // 「自分で入力」の直後なら、その文章をテーマとして扱う
  if (waitingTheme.has(userId)) {
    const { draft, at } = waitingTheme.get(userId);
    waitingTheme.delete(userId);
    if (Date.now() - at < 30 * 60 * 1000 && !/^(ヘルプ|help|候補|下書き候補|一覧|キャンセル|やめる)$/i.test(t)) return enqueue(() => createAndPublish(userId, t, { draft }));
    if (/^(キャンセル|やめる)$/.test(t)) return push(userId, 'やめました。');
  }
  if (/^(ヘルプ|help|\?)$/i.test(t)) return push(userId, helpFor(userId));
  if (isAdmin(userId) && t === 'スタッフ一覧') {
    const all = listStaff();
    return push(userId, all.length ? all.map((s) => `${s.status} ${s.name}${s.displayName ? `(LINE: ${s.displayName})` : ''} ${s.requestedAt}`).join('\n') : 'スタッフはまだいません。');
  }
  if (isAdmin(userId) && t.startsWith('スタッフ停止')) {
    const name = t.replace(/^スタッフ停止\s*/, '');
    const hit = listStaff().filter((s) => s.name === name && s.status === 'スタッフ');
    if (hit.length !== 1) return push(userId, hit.length ? `「${name}」が複数います。スプレッドシートの「スタッフ」タブで確認してください。` : `「${name}」というスタッフはいません。「スタッフ一覧」で名前を確認してください。`);
    stopStaff(hit[0].userId);
    await unlinkStaffMenu(hit[0].userId);
    await log(`スタッフ停止: ${name}`);
    return push(userId, `${name} さんを停止しました(投稿できなくなり、メニューも外しました)。`);
  }
  if (/^(候補|おすすめ|次|提案)$/.test(t)) return suggest(userId);
  if (/^下書き候補$/.test(t)) return suggest(userId, { draft: true });

  if (t === '一覧') {
    const posts = listPosts().slice(0, 10);
    return push(userId, posts.length ? posts.map((p) => `${p.draft ? '[下書き] ' : ''}${p.date} ${p.title}\n  slug: ${p.slug}`).join('\n') : '記事がありません');
  }
  let m;
  if ((m = t.match(/^下書き\s+([\s\S]+)/))) return enqueue(() => createAndPublish(userId, m[1].trim(), { draft: true }));
  if ((m = t.match(/^テーマ\s+([\s\S]+)/))) return enqueue(() => createAndPublish(userId, m[1].trim()));
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
  // それ以外の文章では記事を作らない(公式アカウントでの普段のやりとりで誤って公開しないため)
  return push(userId, 'メニューの「コラム投稿」を押すか、「テーマ 〇〇」と送ってください。\n「ヘルプ」で使い方を表示します。');
}

// 「自分で入力」を押した人 → 次の文章をテーマとして扱う
const waitingTheme = new Map(); // userId → { draft, at }

// ---------- ボタン(postback) ----------
async function handlePostback(userId, data) {
  const p = new URLSearchParams(data);
  const draft = p.get('draft') === '1';
  if (p.get('menu') === 'column') return suggest(userId);
  if (p.get('more')) return suggest(userId, { draft, more: true });
  if (p.get('manual')) {
    waitingTheme.set(userId, { draft, at: Date.now() });
    return push(userId, `書きたいテーマを文章で送ってください。${draft ? '(下書きで作ります)' : ''}\n例) IT導入補助金 LINE 見積システム\nやめるときは「キャンセル」。`);
  }
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

// ---------- スタッフ登録(登録外の人) ----------
// 公式アカウントはお客さまとのチャットと共用。登録外の人には、下の合言葉以外は一切反応しない。
const REGISTER_WORD = 'スタッフ登録';
const ID_WORD = 'コラム登録'; // 管理者の初期設定用: 自分のIDを返すだけ
const waitingName = new Map(); // userId → 申請開始時刻

// お客さま向け(友だち追加時)。HPを見て来た人が多いので説明は短く、送りやすさだけを用意する
const GREETING = [
  '友だち追加ありがとうございます。DX職人です。',
  '',
  '助成金・補助金を使ったLINEのAIシステム導入や、見積・請求・日報の手間を減らすご相談を、このトークで受け付けています。',
  '',
  '下のボタンを押すだけで送れます。もちろん、そのまま文章で送っていただいても大丈夫です。',
].join('\n');

// [ボタン名(20文字以内), 送られる文章]
const QUICK_ASK = [
  ['無料で相談したい', '無料で相談したいです。'],
  ['助成金が使えるか', 'うちの会社で助成金・補助金が使えるか知りたいです。'],
  ['費用を知りたい', '費用の目安を知りたいです。'],
  ['LINEのAIシステム', 'LINEで使えるAIシステムについて聞きたいです。'],
  ['話を聞きたい', '電話かオンラインで話を聞きたいです。'],
];

const ASK_DETAIL = [
  'ありがとうございます。担当者からこのトークでご連絡します。',
  '',
  '差し支えなければ、次も送っていただくとスムーズです。',
  '・会社名とお名前',
  '・業種(建設・リフォーム・不動産など)',
  '・いま手間がかかっている作業',
].join('\n');

const reply = (ev, text, quickReply) => ev.replyToken
  ? line.replyMessage({ replyToken: ev.replyToken, messages: [{ type: 'text', text, ...(quickReply ? { quickReply } : {}) }] }).catch((e) => console.error('reply失敗', e.message))
  : push(ev.source.userId, text, quickReply);

async function handleGuest(ev, userId) {
  const text = ev.type === 'message' && ev.message?.type === 'text' ? ev.message.text.trim() : '';
  const data = ev.type === 'postback' ? new URLSearchParams(ev.postback.data) : null;

  if (text === ID_WORD) { console.log('ID確認:', userId); return reply(ev, `登録用IDです。\n${userId}`); }

  if (text === REGISTER_WORD) {
    const s = getStaff(userId);
    if (s?.status === '承認待ち') return reply(ev, `「${s.name}」で申請済みです。管理者の承認をお待ちください。`);
    if (s?.status === '停止') return reply(ev, 'このアカウントは停止中です。管理者にお問い合わせください。');
    waitingName.set(userId, Date.now());
    return reply(ev, 'コラム投稿スタッフの登録をします。\nお名前(フルネーム)を送ってください。\nやめるときは「キャンセル」。');
  }

  // 名前入力待ち
  if (waitingName.has(userId) && Date.now() - waitingName.get(userId) < 30 * 60 * 1000) {
    if (data?.get('reg') === 'yes') {
      const name = data.get('name');
      waitingName.delete(userId);
      const profile = await line.getProfile(userId).catch(() => null);
      requestStaff(userId, name, profile?.displayName || '');
      await log(`スタッフ申請: ${name}`);
      await notifyAdmins(userId, name, profile?.displayName || '');
      return reply(ev, `「${name}」で申請しました。管理者が承認すると、ここにお知らせが届きます。`);
    }
    if (data?.get('reg') === 'no') return reply(ev, 'お名前をもう一度送ってください。');
    if (/^(キャンセル|やめる)$/.test(text)) { waitingName.delete(userId); return reply(ev, '登録をやめました。'); }
    if (text) {
      const name = text.slice(0, 20);
      return reply(ev, `「${name}」で申請します。よろしいですか？`, { items: [
        { type: 'action', action: { type: 'postback', label: 'はい', data: `reg=yes&name=${encodeURIComponent(name)}`, displayText: 'はい' } },
        { type: 'action', action: { type: 'postback', label: '修正する', data: 'reg=no', displayText: '修正する' } },
      ] });
    }
  }
  // お客さまが友だち追加したとき: あいさつ + タップで送れるボタン
  if (ev.type === 'follow') return reply(ev, GREETING, { items: QUICK_ASK.map(([label, text]) => ({ type: 'action', action: { type: 'message', label, text } })) });

  // ボタンで送られた相談 → 受け取ったことと、書いてほしいことだけ返す(返事は担当者がチャットで)
  if (QUICK_ASK.some(([, t]) => t === text)) return reply(ev, ASK_DETAIL);

  // それ以外(お客さまのメッセージなど)は何もしない。担当者が LINE Official Account Manager で返信する
}

async function notifyAdmins(userId, name, displayName) {
  const textBody = `スタッフ登録の申請\n名前: ${name}${displayName ? `\nLINE名: ${displayName}` : ''}`.slice(0, 160);
  for (const admin of env.admins) {
    await line.pushMessage({ to: admin, messages: [{
      type: 'template',
      altText: `スタッフ登録の申請: ${name}`,
      template: {
        type: 'buttons',
        text: textBody,
        actions: [
          { type: 'postback', label: '承認', data: `staff=approve&uid=${userId}`, displayText: `${name} さんを承認` },
          { type: 'postback', label: '却下', data: `staff=reject&uid=${userId}`, displayText: `${name} さんを却下` },
        ],
      },
    }] }).catch((e) => console.error('申請通知失敗', e.message));
  }
}

async function handleStaffDecision(adminId, p) {
  const uid = p.get('uid');
  const approve = p.get('staff') === 'approve';
  const profile = await line.getProfile(adminId).catch(() => null);
  const s = decide(uid, approve, profile?.displayName || adminId);
  if (!s) {
    const cur = getStaff(uid);
    return push(adminId, cur ? `この申請はすでに処理済みです(${cur.name}: ${cur.status})。` : '申請が見つかりません。');
  }
  await log(`スタッフ${approve ? '承認' : '却下'}: ${s.name}`);
  if (approve) {
    const linked = await linkStaffMenu(uid).catch((e) => { console.error('メニューのリンク失敗', e.message); return false; });
    await push(uid, `${s.name} さん、スタッフ登録が承認されました。\n\n` + HELP + (linked ? '' : '\n\n(メニューは準備中です。「候補」と送れば同じことができます)'));
    // 他の管理者にも結果を共有
    for (const a of env.admins) await push(a, `${s.name} さんを承認しました。`);
  } else {
    await push(uid, 'スタッフ登録は承認されませんでした。');
    for (const a of env.admins) await push(a, `${s.name} さんを却下しました。`);
  }
}

// ---------- Webhook ----------
app.get('/', (_req, res) => res.send('ok'));
app.post('/webhook', middleware({ channelSecret: env.lineSecret }), (req, res) => {
  res.status(200).end(); // LINE には先に返す
  for (const ev of req.body.events || []) {
    const userId = ev.source?.userId;
    if (!userId || ev.source?.type !== 'user') continue;
    // 管理者の承認/却下ボタン
    if (ev.type === 'postback' && isAdmin(userId)) {
      const p = new URLSearchParams(ev.postback.data);
      if (p.get('staff')) { handleStaffDecision(userId, p).catch((e) => console.error(e)); continue; }
    }
    if (!canPost(userId)) { handleGuest(ev, userId).catch((e) => console.error(e)); continue; }
    if (ev.type === 'follow') { push(userId, helpFor(userId)); continue; }
    if (ev.type === 'message' && ev.message?.type === 'text') {
      if (ev.message.text.trim() === REGISTER_WORD) { push(userId, isAdmin(userId) ? '管理者として登録済みです。' : 'スタッフとして登録済みです。'); continue; }
      handleText(userId, ev.message.text).catch((e) => console.error(e));
    } else if (ev.type === 'postback') handlePostback(userId, ev.postback.data).catch((e) => console.error(e));
  }
});

// ---------- 定期提案(例: 毎週月曜 8:00)。管理者にだけ届く ----------
if (env.suggestCron && env.admins.length) {
  if (!cron.validate(env.suggestCron)) console.error('SUGGEST_CRON の形式が不正です:', env.suggestCron);
  else cron.schedule(env.suggestCron, () => { for (const uid of env.admins) suggest(uid); }, { timezone: 'Asia/Tokyo' });
}

// 署名不正などは 401 で静かに返す(スタックトレースを出さない)
app.use((err, _req, res, _next) => {
  if (err?.name === 'SignatureValidationFailed' || err?.name === 'JSONParseError') return res.status(401).end();
  console.error(err);
  res.status(500).end();
});

app.listen(env.port, () => console.log(`DX職人 コラムボット: http://localhost:${env.port}/webhook`));
