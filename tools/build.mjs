// コラムのビルド: column/posts/*.md → column/*.html, 一覧, カテゴリ, sitemap.xml, feed.xml
//
//   npm run build            すべて生成
//   npm run build -- --check 生成せず、記事の不備(必須項目・画像の有無)だけ確認
//
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { ROOT, config, esc, absUrl, fmtDate, imageSize, header, footer, head, publisher, breadcrumb } from './lib/site.mjs';

const POSTS_DIR = path.join(ROOT, 'column', 'posts');
const OUT_DIR = path.join(ROOT, 'column');
const ASSETS = 'assets/column';
const CHECK = process.argv.includes('--check');

// ---------- Markdown の読み込み ----------
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error('frontmatter(--- ... ---)がありません');
  return { meta: yaml.load(m[1]) || {}, body: m[2] };
}

function loadPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const posts = [];
  const errors = [];
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    try {
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8'));
      const p = normalize(slug, meta, body);
      posts.push(p);
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
    }
  }
  if (errors.length) { console.error('記事にエラーがあります:\n  ' + errors.join('\n  ')); process.exit(1); }
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? 1 : -1));
  return posts;
}

function normalize(slug, m, body) {
  for (const k of ['title', 'date', 'category', 'description']) if (!m[k]) throw new Error(`${k} がありません`);
  if (!config.categories[m.category]) throw new Error(`category "${m.category}" は site.config.json にありません`);
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('ファイル名は英小文字・数字・ハイフンのみ');
  const date = String(m.date).slice(0, 10);
  const updated = m.updated ? String(m.updated).slice(0, 10) : date;
  const image = m.image || `${slug}.jpg`;
  const imgFile = path.join(ROOT, ASSETS, image);
  if (!fs.existsSync(imgFile)) throw new Error(`画像がありません: ${ASSETS}/${image}`);
  return {
    slug, title: m.title, seoTitle: m.seoTitle || m.title, date, updated, category: m.category,
    description: m.description, lead: m.lead || m.description,
    keywords: m.keywords || [], points: m.points || [], faq: m.faq || [], refs: m.refs || [],
    image, imageAlt: m.imageAlt || m.title, imageSize: imageSize(imgFile),
    draft: !!m.draft, body,
    url: `column/${slug}.html`,
  };
}

// ---------- 本文 Markdown → HTML ----------
function renderBody(post) {
  const toc = [];
  let h2 = 0;
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = renderer.parser.parseInline(tokens);
    if (depth === 2) { h2 += 1; const id = `s${h2}`; toc.push({ id, text }); return `<h2 id="${id}">${text}</h2>\n`; }
    return `<h${depth}>${text}</h${depth}>\n`;
  };
  renderer.image = ({ href, text, title }) => {
    const file = path.join(ROOT, ASSETS, href);
    const sz = fs.existsSync(file) ? imageSize(file) : { width: 1536, height: 1024 };
    if (!fs.existsSync(file)) post.warnings.push(`本文の画像がありません: ${ASSETS}/${href}`);
    const cap = title ? `<figcaption>${esc(title)}</figcaption>` : '';
    return `<figure class="post__fig"><img src="../${ASSETS}/${href}" width="${sz.width}" height="${sz.height}" loading="lazy" alt="${esc(text)}">${cap}</figure>`;
  };
  renderer.paragraph = ({ tokens }) => {
    const inner = renderer.parser.parseInline(tokens);
    if (/^<figure /.test(inner)) return inner + '\n';
    return `<p>${inner}</p>\n`;
  };
  renderer.list = function ({ ordered, items }) {
    const body = items.map((it) => `<li>${this.parser.parse(it.tokens, !!it.loose).replace(/^<p>([\s\S]*)<\/p>\n?$/, '$1').trim()}</li>`).join('\n');
    return ordered ? `<ol class="post__steps">\n${body}\n</ol>\n` : `<ul class="post__list">\n${body}\n</ul>\n`;
  };
  renderer.table = function ({ header: hd, rows }) {
    const cell = (c, tag) => `<${tag}${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</${tag}>`;
    const thead = `<thead><tr>${hd.map((c) => cell(c, 'th')).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')}</tbody>`;
    return `<div class="post__table"><table>${thead}${tbody}</table></div>\n`;
  };
  renderer.blockquote = function ({ tokens }) { return `<blockquote class="post__quote">${this.parser.parse(tokens)}</blockquote>\n`; };
  renderer.link = function ({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const ext = /^https?:\/\//.test(href) && !href.startsWith(config.url);
    const t = title ? ` title="${esc(title)}"` : '';
    return ext
      ? `<a href="${href}"${t} target="_blank" rel="noopener">${text}</a>`
      : `<a href="${href}"${t}>${text}</a>`;
  };
  post.warnings = post.warnings || [];
  let html = marked.parse(post.body, { renderer, gfm: true, breaks: false });

  // 2つ目の見出しの終わり(3つ目の見出しの前)に中間CTAを入れる
  if (toc.length >= 3) {
    const marker = `<h2 id="s3">`;
    html = html.replace(marker, midCta() + marker);
  }
  return { html, toc };
}

function midCta() {
  const c = config.ctaMid;
  return `<aside class="post__mid" aria-label="ご案内">
  <p class="post__mid-label">DX職人のご案内</p>
  <p class="post__mid-heading">${esc(c.heading)}</p>
  <p class="post__mid-text">${esc(c.text)}</p>
  <a class="cta small" href="../${c.href}">${esc(c.button)}<svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
</aside>
`;
}

// ---------- 記事ページ ----------
function related(post, posts) {
  const pub = posts.filter((p) => !p.draft && p.slug !== post.slug);
  const same = pub.filter((p) => p.category === post.category);
  const rest = pub.filter((p) => p.category !== post.category);
  return [...same, ...rest].slice(0, 3);
}

function cardHtml(p, rel = '') {
  const cat = config.categories[p.category].name;
  const excerpt = p.description.length > 80 ? p.description.slice(0, 80) + '…' : p.description;
  return `      <article class="post-card">
        <a class="post-card__img" href="${rel}${p.slug}.html"><img src="${rel}../${ASSETS}/${p.image}" width="${p.imageSize.width}" height="${p.imageSize.height}" loading="lazy" alt="${esc(p.imageAlt)}"></a>
        <div class="post-card__body">
          <div class="post-card__meta"><a class="post-card__cat" href="${rel}category/${p.category}/">${esc(cat)}</a><time datetime="${p.date}">${fmtDate(p.date)}</time></div>
          <h2><a href="${rel}${p.slug}.html">${esc(p.title)}</a></h2>
          <p>${esc(excerpt)}</p>
          <a class="text-link" href="${rel}${p.slug}.html">続きを読む<svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
        </div>
      </article>`;
}

function postPage(post, posts) {
  const rel = '../';
  const url = absUrl(post.url);
  const cat = config.categories[post.category];
  const { html, toc } = renderBody(post);
  const pageTitle = post.seoTitle.includes(config.name) ? post.seoTitle : `${post.seoTitle}｜${config.name}`;

  const graph = [
    {
      '@type': 'Article',
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      headline: post.title, description: post.description,
      image: { '@type': 'ImageObject', url: absUrl(`${ASSETS}/${post.image}`), width: post.imageSize.width, height: post.imageSize.height },
      datePublished: post.date, dateModified: post.updated,
      author: { '@type': 'Organization', name: config.name, url: absUrl('') },
      publisher: publisher(), inLanguage: 'ja', articleSection: cat.name,
      ...(post.keywords.length ? { keywords: post.keywords.join(',') } : {}),
    },
    breadcrumb([
      { name: config.name, url: absUrl('') }, { name: 'コラム', url: absUrl('column/') },
      { name: cat.name, url: absUrl(`column/category/${post.category}/`) }, { name: post.title, url },
    ]),
  ];
  if (post.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: post.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }

  const pointsHtml = post.points.length
    ? `      <div class="post__points"><h2>この記事の要点</h2><ul>${post.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>\n`
    : '';
  const tocHtml = toc.length >= 3
    ? `      <nav class="post__toc" aria-label="目次"><h2>目次</h2><ol>${toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join('')}</ol></nav>\n`
    : '';
  const faqHtml = post.faq.length
    ? `      <section class="post__faq" aria-labelledby="faq-title">
        <h2 id="faq-title">よくある質問</h2>
        <div class="faq-list">
${post.faq.map((f) => `          <details>\n            <summary>${esc(f.q)}</summary>\n            <p>${esc(f.a)}</p>\n          </details>`).join('\n')}
        </div>
      </section>\n`
    : '';
  const refsHtml = post.refs.length
    ? `      <div class="post__refs"><h2>参考資料</h2><ul>${post.refs.map((r) => `<li><a href="${r.url}" target="_blank" rel="noopener">${esc(r.title)}<svg class="icon" aria-hidden="true"><use href="#i-external-link"/></svg></a></li>`).join('')}</ul></div>\n`
    : '';
  const cta = config.cta;
  const rel3 = related(post, posts);
  const relatedHtml = rel3.length
    ? `      <aside class="post__others">
        <h2>あわせて読みたい</h2>
        <div class="post-grid post-grid--3">
${rel3.map((p) => cardHtml(p, '')).join('\n')}
        </div>
        <a class="text-link" href="./">コラム一覧へ<svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
      </aside>\n`
    : '';
  const pages = config.relatedPages.map((r) => `          <li><a href="${rel}${r.href}">${esc(r.name)}</a></li>`).join('\n');
  const updatedHtml = post.updated !== post.date ? `<time datetime="${post.updated}">${fmtDate(post.updated)} 更新</time>` : '';

  return head({
    rel, title: pageTitle, description: post.description, canonical: url, ogType: 'article',
    image: `${ASSETS}/${post.image}`, imageSize: post.imageSize, noindex: post.draft,
    jsonld: { '@context': 'https://schema.org', '@graph': graph },
    extra: `\n<meta property="article:published_time" content="${post.date}">\n<meta property="article:modified_time" content="${post.updated}">\n<meta property="article:section" content="${esc(cat.name)}">`,
  }) + `
${header(rel, 'column')}

<main id="main">

<article class="post">
  <header class="page-head">
    <div class="wrap">
      <nav class="crumb" aria-label="現在の位置"><ol><li><a href="../">${config.name}</a></li><li><a href="./">コラム</a></li><li><a href="category/${post.category}/">${esc(cat.name)}</a></li><li aria-current="page">${esc(post.title)}</li></ol></nav>
      <div class="post-card__meta"><a class="post-card__cat" href="category/${post.category}/">${esc(cat.name)}</a><time datetime="${post.date}">${fmtDate(post.date)} 公開</time>${updatedHtml}</div>
      <h1 class="page-title">${esc(post.title)}</h1>
      <p class="intro">${esc(post.lead)}</p>
    </div>
  </header>
  <div class="wrap post__hero"><img src="../${ASSETS}/${post.image}" width="${post.imageSize.width}" height="${post.imageSize.height}" alt="${esc(post.imageAlt)}" fetchpriority="high"></div>
  <div class="wrap post__body">
${pointsHtml}${tocHtml}${html}${faqHtml}${refsHtml}      <div class="post__cta">
        <p class="section-label">${esc(cta.label)}</p>
        <h2>${esc(cta.heading)}</h2>
        <p>${esc(cta.text)}</p>
        <a class="cta" href="${rel}${cta.href}">${esc(cta.button)}<svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
      </div>
      <nav class="post__related" aria-label="関連ページ">
        <h2>関連ページ</h2>
        <ul>
${pages}
        </ul>
      </nav>
${relatedHtml}  </div>
</article>

</main>

${footer(rel)}
</body>
</html>
`;
}

// ---------- 一覧・カテゴリ ----------
function listPage({ posts, allCount, title, description, heading, intro, canonicalPath, crumbs, activeCat, page, totalPages, pagePath, rel }) {
  const col = config.column;
  const tabs = [['', 'すべて', allCount], ...Object.entries(config.categories).map(([k, c]) => [k, c.name, c.count])]
    .map(([k, name, n]) => {
      const href = k ? `${rel}category/${k}/` : `${rel}`;
      const cur = (activeCat || '') === k ? ' aria-current="page"' : '';
      return `        <li><a href="${href}"${cur}>${esc(name)}<span>${n}</span></a></li>`;
    }).join('\n');
  const pager = totalPages > 1
    ? `    <nav class="pager" aria-label="ページ送り"><ol>${Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => `<li><a href="${pagePath(n)}"${n === page ? ' aria-current="page"' : ''}>${n}</a></li>`).join('')}</ol></nav>\n`
    : '';
  const siteRel = rel + '../';
  const graph = [
    {
      '@type': 'CollectionPage', '@id': absUrl(canonicalPath), name: title, description, url: absUrl(canonicalPath), inLanguage: 'ja', publisher: publisher(),
      mainEntity: { '@type': 'ItemList', itemListElement: posts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absUrl(p.url), name: p.title })) },
    },
    breadcrumb(crumbs),
  ];
  const h = Array.isArray(heading) ? `<span class="ph">${esc(heading[0])}</span><br><span class="accent ph">${esc(heading[1])}</span>` : esc(heading);
  const crumbHtml = crumbs.map((c, i) => i === crumbs.length - 1 ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${c.href}">${esc(c.name)}</a></li>`).join('');
  return head({ rel: siteRel, title, description, canonical: absUrl(canonicalPath), image: col.defaultOgImage, jsonld: { '@context': 'https://schema.org', '@graph': graph } }) + `
${header(siteRel, 'column')}

<main id="main">

<section class="page-head">
  <div class="wrap">
    <nav class="crumb" aria-label="現在の位置"><ol>${crumbHtml}</ol></nav>
    <p class="section-label">COLUMN</p>
    <h1 class="page-title">${h}</h1>
    <p class="intro">${esc(intro)}</p>
  </div>
</section>
<section class="section column-page" aria-label="コラム一覧">
  <div class="wrap">
    <nav class="cat-tabs" aria-label="カテゴリ">
      <ul>
${tabs}
      </ul>
    </nav>
    <div class="post-grid post-grid--3">
${posts.map((p) => cardHtml(p, rel)).join('\n')}
    </div>
${pager}  </div>
</section>

</main>

${footer(siteRel)}
</body>
</html>
`;
}

// ---------- sitemap / feed ----------
function sitemap(posts) {
  const rows = [];
  for (const s of config.staticPages) rows.push({ loc: absUrl(s.path), lastmod: latest(posts), changefreq: s.changefreq, priority: s.priority });
  rows.push({ loc: absUrl('column/'), lastmod: latest(posts), changefreq: 'weekly', priority: '0.8' });
  for (const [k, c] of Object.entries(config.categories)) if (c.count) rows.push({ loc: absUrl(`column/category/${k}/`), lastmod: latest(posts.filter((p) => p.category === k)), changefreq: 'weekly', priority: '0.6' });
  for (const p of posts) rows.push({ loc: absUrl(p.url), lastmod: p.updated, changefreq: 'monthly', priority: '0.7' });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map((r) => `  <url><loc>${r.loc}</loc><lastmod>${r.lastmod}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
}
const latest = (posts) => posts.reduce((m, p) => (p.updated > m ? p.updated : m), '2026-10-08');

function feed(posts) {
  const items = posts.slice(0, 20).map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${absUrl(p.url)}</link>
      <guid isPermaLink="true">${absUrl(p.url)}</guid>
      <pubDate>${new Date(p.date + 'T09:00:00+09:00').toUTCString()}</pubDate>
      <category>${esc(config.categories[p.category].name)}</category>
      <description>${esc(p.description)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(config.name)} コラム</title>
    <link>${absUrl('column/')}</link>
    <atom:link href="${absUrl('column/feed.xml')}" rel="self" type="application/rss+xml"/>
    <description>${esc(config.column.description)}</description>
    <language>ja</language>
${items}
  </channel>
</rss>
`;
}

// ---------- 実行 ----------
function write(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); }

const posts = loadPosts();
const published = posts.filter((p) => !p.draft);
for (const [k, c] of Object.entries(config.categories)) c.count = published.filter((p) => p.category === k).length;

if (CHECK) {
  for (const p of posts) renderBody(p);
  const warn = posts.flatMap((p) => p.warnings.map((w) => `${p.slug}: ${w}`));
  console.log(`記事 ${posts.length} 本(公開 ${published.length}、下書き ${posts.length - published.length})`);
  if (warn.length) { console.log('注意:\n  ' + warn.join('\n  ')); process.exit(1); }
  process.exit(0);
}

for (const p of posts) write(path.join(OUT_DIR, `${p.slug}.html`), postPage(p, posts));

const col = config.column;
const per = col.perPage;
const totalPages = Math.max(1, Math.ceil(published.length / per));
const pagePath = (n) => (n === 1 ? './' : `page/${n}/`);
for (let n = 1; n <= totalPages; n++) {
  const slice = published.slice((n - 1) * per, n * per);
  const rel = n === 1 ? '' : '../../';
  const suffix = n === 1 ? '' : `(${n}ページ目)`;
  const html = listPage({
    posts: slice, allCount: published.length, title: n === 1 ? col.title : `${col.title}${suffix}`, description: col.description,
    heading: col.heading, intro: col.intro, canonicalPath: n === 1 ? 'column/' : `column/page/${n}/`,
    crumbs: [{ name: config.name, href: rel + '../', url: absUrl('') }, { name: 'コラム', href: rel, url: absUrl('column/') }],
    activeCat: '', page: n, totalPages, pagePath: (k) => rel + pagePath(k), rel,
  });
  write(path.join(OUT_DIR, n === 1 ? 'index.html' : `page/${n}/index.html`), html);
}
// 使われなくなったページ送りを消す
if (fs.existsSync(path.join(OUT_DIR, 'page'))) for (const d of fs.readdirSync(path.join(OUT_DIR, 'page'))) if (Number(d) > totalPages) fs.rmSync(path.join(OUT_DIR, 'page', d), { recursive: true });

for (const [k, c] of Object.entries(config.categories)) {
  const rel = '../../';
  const html = listPage({
    posts: published.filter((p) => p.category === k), allCount: published.length,
    title: `${c.name}のコラム｜${config.name}`, description: c.description, heading: c.name, intro: c.description,
    canonicalPath: `column/category/${k}/`,
    crumbs: [{ name: config.name, href: rel + '../', url: absUrl('') }, { name: 'コラム', href: rel, url: absUrl('column/') }, { name: c.name, href: './', url: absUrl(`column/category/${k}/`) }],
    activeCat: k, page: 1, totalPages: 1, pagePath: () => './', rel,
  });
  write(path.join(OUT_DIR, 'category', k, 'index.html'), html);
}

write(path.join(ROOT, 'sitemap.xml'), sitemap(published));
write(path.join(OUT_DIR, 'feed.xml'), feed(published));

// 404 ページ(どの階層でも出るので、リンクは / からの絶対パス)
{
  const recent = published.slice(0, 3);
  const html = head({
    rel: '/', title: `ページが見つかりません｜${config.name}`, description: 'お探しのページは移動または削除された可能性があります。', canonical: absUrl('404.html'),
    noindex: true, jsonld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'ページが見つかりません' },
  }) + header('/', '') + `
<main id="main">
  <section class="section">
    <div class="wrap" style="text-align:center;padding-top:40px">
      <span class="section-label">404 NOT FOUND</span>
      <h1>ページが見つかりません</h1>
      <p style="margin:16px 0 28px">お探しのページは、移動または削除された可能性があります。</p>
      <p><a class="cta" href="/">トップへ戻る</a> <a class="cta small" href="/column/" style="margin-left:8px">コラム一覧</a></p>
    </div>
    ${recent.length ? `<div class="wrap"><h2 style="text-align:center;margin-top:48px">よく読まれているコラム</h2><div class="post-grid post-grid--3">${recent.map((p) => cardHtml(p, '/')).join('')}</div></div>` : ''}
  </section>
</main>
` + footer('/');
  write(path.join(ROOT, '404.html'), html);
}

const warn = posts.flatMap((p) => p.warnings.map((w) => `${p.slug}: ${w}`));
console.log(`生成しました: 記事 ${posts.length} 本(公開 ${published.length}、下書き ${posts.length - published.length})、一覧 ${totalPages} ページ、カテゴリ ${Object.keys(config.categories).length}`);
if (warn.length) console.log('注意:\n  ' + warn.join('\n  '));
