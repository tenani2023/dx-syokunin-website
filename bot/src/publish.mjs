// 記事の保存・ビルド・git push
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env, site } from './config.mjs';
import { generateImage } from './images.mjs';

const run = promisify(execFile);
const POSTS = path.join(env.repoDir, 'column', 'posts');
const ASSETS = path.join(env.repoDir, 'assets', 'column');

const git = (...args) => run('git', args, { cwd: env.repoDir, env: { ...process.env, GIT_AUTHOR_NAME: env.gitName, GIT_AUTHOR_EMAIL: env.gitEmail, GIT_COMMITTER_NAME: env.gitName, GIT_COMMITTER_EMAIL: env.gitEmail } });

// origin の最新を取り込む(fast-forward のみ。VPS側だけにあるコミットは消さない)
export async function syncRepo() {
  if (env.localMode) return;
  await git('fetch', '-q', 'origin', env.branch);
  await git('checkout', '-q', env.branch);
  try {
    await git('merge', '-q', '--ff-only', `origin/${env.branch}`);
  } catch (e) {
    throw new Error(`origin/${env.branch} と履歴が食い違っています。VPSで git status を確認してください (${e.stderr?.trim() || e.message})`);
  }
}

export async function buildSite() {
  await run('node', ['tools/build.mjs'], { cwd: env.repoDir });
}

// GitHub への push や手動更新のあとにサイトを最新化する(同期 → ビルド)
export async function deploySite() {
  await syncRepo();
  await buildSite();
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
    `image: ${a.slug}/hero.jpg`,
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

  onProgress('画像を作成中(ヒーロー)');
  await generateImage(article.heroImagePrompt, path.join(dir, 'hero.jpg'), 'hero');
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

async function commitAndPush(message) {
  if (env.localMode) { console.log(`[LOCAL_MODE] commit/push を省略: ${message}`); return; }
  await git('add', '-A', 'column', 'assets/column', 'sitemap.xml');
  const { stdout } = await git('status', '--porcelain');
  if (!stdout.trim()) return;
  await git('commit', '-q', '-m', `${message}\n\n(LINEボットから投稿)`);
  if (!env.gitPush) { console.log(`[GIT_PUSH=0] GitHub への push を省略: ${message}`); return; }
  await git('push', '-q', 'origin', env.branch);
}
