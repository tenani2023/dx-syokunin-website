// 記事の保存・ビルド・git push
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env, site } from './config.mjs';
import { generateImage } from './images.mjs';
import { makeIllustration, renderEyecatch } from './eyecatch.mjs';

// アイキャッチのファイル名(旧: hero.jpg。名前を変えてブラウザの古いキャッシュを避ける)
const EYECATCH = 'eyecatch.jpg';

/** 統一デザインのアイキャッチを dir/eyecatch.jpg に作る。イラストに失敗しても文字だけで作る */
export async function makeEyecatch(spec, dir) {
  const illust = path.join(dir, '_illust.png');
  let illustration;
  try { illustration = await makeIllustration(spec.illustrationPrompt, illust); }
  catch (e) { console.error('イラストの生成に失敗(文字だけで作ります):', e.message); }
  const bubbles = (spec.bubbles || []).slice(0, 2).map((b) => b.replace(/\\n/g, '\n'));
  await renderEyecatch({ badge: spec.badge, lines: spec.lines.slice(0, 4), sub: spec.sub || '', bubbles, illustration }, path.join(dir, EYECATCH));
  fs.rmSync(illust, { force: true });
  return path.join(dir, EYECATCH);
}

const run = promisify(execFile);
const POSTS = path.join(env.repoDir, 'column', 'posts');
const ASSETS = path.join(env.repoDir, 'assets', 'column');

const git = (...args) => run('git', args, { cwd: env.repoDir, env: { ...process.env, GIT_AUTHOR_NAME: env.gitName, GIT_AUTHOR_EMAIL: env.gitEmail, GIT_COMMITTER_NAME: env.gitName, GIT_COMMITTER_EMAIL: env.gitEmail } });

// origin(GitHub)の最新を取り込む。
// - 作業ツリーの未コミット分は「ビルドで作り直したファイル」だけなので捨てる(このあと再ビルドする)。
//   ※ VPS 上のファイルを手で直接編集しないこと。
// - VPS にだけあるコミット(push 前の記事)は、GitHub の最新の上に積み直す(rebase)。
export async function syncRepo() {
  if (env.localMode) return;
  await git('fetch', '-q', 'origin', env.branch);
  await git('checkout', '-q', env.branch);
  await git('reset', '-q', '--hard', 'HEAD');
  try {
    await git('rebase', '-q', `origin/${env.branch}`);
  } catch (e) {
    await git('rebase', '--abort').catch(() => {});
    throw new Error(`GitHub の内容と VPS の内容が衝突しました。VPS で git status を確認してください (${e.stderr?.trim() || e.message})`);
  }
}

export async function buildSite() {
  await run('node', ['tools/build.mjs'], { cwd: env.repoDir });
}

// GitHub に push されたあとにサイトを最新化する(取り込み → ビルド → 作り直したファイルをコミットして push)
export async function deploySite() {
  if (env.localMode) return buildSite();
  await syncRepo();
  await buildSite();
  await commitAndPush('サイトを再生成', { bot: false });
}

export function listPosts() {
  if (!fs.existsSync(POSTS)) return [];
  return fs.readdirSync(POSTS).filter((f) => f.endsWith('.md')).map((f) => {
    const src = fs.readFileSync(path.join(POSTS, f), 'utf8');
    const get = (k) => (src.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, 'm')) || [])[1] || '';
    return { slug: f.replace(/\.md$/, ''), title: get('title'), date: get('date'), draft: get('draft') === 'true' };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** 記事の中身(企画・改稿の材料に使う) */
export function readPost(slug) {
  const src = fs.readFileSync(path.join(POSTS, `${slug}.md`), 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const fm = m ? m[1] : '';
  const body = m ? m[2] : src;
  const get = (k) => (fm.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, 'm')) || [])[1] || '';
  const kw = (fm.match(/^keywords:\s*\[(.*)\]\s*$/m) || [])[1] || '';
  return {
    slug, title: get('title'), date: get('date'), category: get('category'), description: get('description'),
    keywords: kw ? kw.split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean) : [],
    headings: [...body.matchAll(/^## (.+)$/gm)].map((x) => x[1]),
    body,
  };
}

const yq = (s) => JSON.stringify(String(s)); // YAML の値として安全な文字列(JSON互換)

function toMarkdown(a, images, today, draft, originalDate) {
  const fm = [
    '---',
    `title: ${yq(a.title)}`,
    `seoTitle: ${yq(a.seoTitle)}`,
    `date: "${originalDate || today}"`,
    ...(originalDate ? [`updated: "${today}"`] : []),
    `category: ${a.category}`,
    `description: ${yq(a.description)}`,
    `lead: ${yq(a.lead)}`,
    `image: ${a.slug}/${EYECATCH}`,
    `imageAlt: ${yq(a.heroImageAlt)}`,
    `keywords: [${a.keywords.map(yq).join(', ')}]`,
    'points:',
    ...a.points.map((p) => `  - ${yq(p)}`),
    ...(a.faq.length ? ['faq:', ...a.faq.flatMap((f) => [`  - q: ${yq(f.q)}`, `    a: ${yq(f.a)}`])] : []),
    ...(a.refs.length ? ['refs:', ...a.refs.flatMap((r) => [`  - title: ${yq(r.title)}`, `    url: ${yq(r.url)}`])] : []),
    ...(draft ? ['draft: true'] : []),
    '---',
  ];
  const body = a.sections.map((s, i) => {
    const img = images[i] ? `![${s.imageAlt.replace(/[\[\]]/g, '')}](${a.slug}/${images[i]})\n\n` : '';
    return `## ${s.heading}\n\n${img}${s.body.trim()}\n`;
  });
  return fm.join('\n') + '\n' + body.join('\n') + '\n';
}

/** 記事と画像を保存し、ビルドして push する。戻り値は公開URL */
export async function publishArticle(article, { draft = false, overwriteSlug = '', onProgress = () => {} } = {}) {
  await syncRepo();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // JST
  let slug = article.slug;
  let originalDate = '';
  if (overwriteSlug) {
    // 改稿: 同じURLを保ち、公開日は元のまま、更新日を今日にする
    slug = overwriteSlug;
    originalDate = readPost(slug).date || today;
    fs.rmSync(path.join(ASSETS, slug), { recursive: true, force: true });
  } else if (fs.existsSync(path.join(POSTS, `${slug}.md`))) {
    slug = `${slug}-${today.replace(/-/g, '')}`;
  }
  article.slug = slug;

  const dir = path.join(ASSETS, slug);
  fs.mkdirSync(dir, { recursive: true });

  onProgress('アイキャッチを作成中');
  await makeEyecatch(article.eyecatch, dir);
  const images = [];
  const n = Math.min(article.sections.length, env.maxSectionImages);
  for (let i = 0; i < n; i++) {
    onProgress(`画像を作成中(${i + 1}/${n})`);
    const name = `s${i + 1}.jpg`;
    try {
      await generateImage(article.sections[i].imagePrompt, path.join(dir, name), 'section');
      images[i] = name;
    } catch (e) {
      console.error(`画像 ${name} の生成に失敗:`, e.message);
    }
  }

  fs.writeFileSync(path.join(POSTS, `${slug}.md`), toMarkdown(article, images, today, draft, originalDate));
  onProgress('ページを生成中');
  await buildSite();
  await commitAndPush(`${overwriteSlug ? '改稿' : draft ? '下書き' : 'コラム'}: ${article.title}`);
  return `${site.url.replace(/\/$/, '')}/column/${slug}.html`;
}

export async function setDraft(slug, draft) {
  await syncRepo();
  const file = path.join(POSTS, `${slug}.md`);
  if (!fs.existsSync(file)) throw new Error(`記事 ${slug} がありません`);
  let src = fs.readFileSync(file, 'utf8').replace(/^draft:.*\n/m, '');
  if (draft) src = src.replace(/^---\n([\s\S]*?)\n---/, (m, fm) => `---\n${fm}\ndraft: true\n---`);
  fs.writeFileSync(file, src);
  await buildSite();
  await commitAndPush(`${draft ? '下書きに戻す' : '公開'}: ${slug}`);
  return `${site.url.replace(/\/$/, '')}/column/${slug}.html`;
}

export async function deletePost(slug) {
  await syncRepo();
  const file = path.join(POSTS, `${slug}.md`);
  if (!fs.existsSync(file)) throw new Error(`記事 ${slug} がありません`);
  fs.rmSync(file);
  fs.rmSync(path.join(env.repoDir, 'column', `${slug}.html`), { force: true });
  fs.rmSync(path.join(ASSETS, slug), { recursive: true, force: true });
  fs.rmSync(path.join(ASSETS, `${slug}.jpg`), { force: true });
  await buildSite();
  await commitAndPush(`削除: ${slug}`);
}

// ボットが書く・作り直すファイル
const OUTPUTS = ['column', 'assets/column', 'sitemap.xml', '404.html'];

async function commitIfChanged(message) {
  await git('add', '-A', ...OUTPUTS);
  const { stdout } = await git('diff', '--cached', '--name-only');
  if (!stdout.trim()) return false;
  await git('commit', '-q', '-m', message);
  return true;
}

async function commitAndPush(message, { bot = true } = {}) {
  if (env.localMode) { console.log(`[LOCAL_MODE] commit/push を省略: ${message}`); return; }
  await commitIfChanged(bot ? `${message}\n\n(LINEボットから投稿)` : message);
  if (!env.gitPush) { console.log(`[GIT_PUSH=0] GitHub への push を省略: ${message}`); return; }
  const { stdout: ahead } = await git('rev-list', '--count', `origin/${env.branch}..HEAD`);
  if (Number(ahead.trim()) === 0) return;
  // 他のメンバーが先に push していたら、取り込んで作り直してから push し直す
  for (let i = 0; ; i++) {
    try { await git('push', '-q', 'origin', env.branch); return; }
    catch (e) {
      if (i >= 2) throw new Error(`GitHub への push に失敗しました (${e.stderr?.trim() || e.message})`);
      await syncRepo();
      await buildSite();
      await commitIfChanged('サイトを再生成');
    }
  }
}
