// サイト共通: 設定の読み込み、HTMLエスケープ、画像サイズ、ヘッダー/フッター
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
export const ICONS = fs.readFileSync(path.join(ROOT, 'tools', 'partials', 'icons.html'), 'utf8').trimEnd();

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const absUrl = (p = '') => `${config.url.replace(/\/$/, '')}/${String(p).replace(/^\//, '')}`;

export const fmtDate = (d) => String(d).slice(0, 10).replace(/-/g, '.');

// JPEG / PNG / WebP の幅と高さをヘッダーから読む(width/height属性のため)
export function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (t === 'VP8L') { const bits = b.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
    if (t === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  return { width: 1600, height: 900 };
}

// rel: ページからサイトルートへの相対パス("../" など)
export function header(rel, current) {
  const nav = [
    ['#change', 'DX職人でできること'], ['#program', '研修内容'], ['#subsidy', '費用・助成金'],
    ['#system', 'システム提供'], ['#faq', 'よくある質問'], ['column/', 'コラム'],
  ].map(([h, t]) => {
    const cur = current === 'column' && h === 'column/' ? ' aria-current="true"' : '';
    return `    <a href="${rel}${h}"${cur}>${t}</a>`;
  }).join('\n');
  return `<a class="skip-link" href="#main">本文へスキップ</a>

<header class="site-header" id="header">
  <a class="brand" href="${rel}" aria-label="${config.name} トップへ">
    <img class="brand__img" src="${rel}assets/brand/logo-h.png" width="720" height="211" alt="${config.name} ${config.tagline}">
  </a>
  <nav class="nav" id="nav" aria-label="メインメニュー">
${nav}
  </nav>
  <a class="cta small" href="${rel}${config.cta.href}">${esc(config.cta.button)}<svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
  <button class="menu-btn" type="button" id="menuBtn" aria-expanded="false" aria-controls="nav" aria-label="メニューを開く">
    <svg class="icon icon--open" aria-hidden="true"><use href="#i-menu"/></svg>
    <svg class="icon icon--close" aria-hidden="true"><use href="#i-x"/></svg>
  </button>
</header>`;
}

export function footer(rel) {
  const c = config.company;
  return `<footer class="site-footer">
  <div class="wrap site-footer__inner">
    <div>
      <img class="site-footer__logo" src="${rel}assets/brand/logo-h.png" width="720" height="211" alt="${config.name}"><p>現場の技に、AIの力を。<br>${config.tagline}</p>
    </div>
    <div>
      <strong>${esc(c.name)}</strong>
      <span>${esc(c.address)}</span>
      <a href="${c.url}" target="_blank" rel="noopener">${c.url.replace(/^https?:\/\//, '')}</a>
      <a href="mailto:${c.email}">${c.email}</a>
      <a href="${config.product.url}" target="_blank" rel="noopener">${esc(config.product.name)}(${config.product.url.replace(/^https?:\/\//, '').replace(/\/$/, '')})</a>
      <a href="${rel}column/">コラム</a>
      <a href="${rel}contact/">お問い合わせ</a>
    </div>
    <div class="site-footer__right">
      <small>© ${esc(c.name)}</small>
    </div>
  </div>
</footer>

<div class="mobile-cta" id="mobileCta">
  <a class="cta" href="${rel}${config.cta.href}">${esc(config.cta.button)}</a>
</div>

<script src="${rel}script.js?v=${config.assetVersion}" defer></script>`;
}

export function head({ rel, title, description, canonical, ogType = 'website', image, imageSize: sz, jsonld, noindex = false, extra = '' }) {
  const img = image ? absUrl(image) : absUrl(config.column.defaultOgImage);
  const dim = sz ? `\n<meta property="og:image:width" content="${sz.width}">\n<meta property="og:image:height" content="${sz.height}">` : '';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">${noindex ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
<meta name="theme-color" content="#0b1f3f">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${config.name}">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}">${dim}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
<link rel="alternate" type="application/rss+xml" title="${config.name} コラム" href="${absUrl('column/feed.xml')}">
<link rel="icon" type="image/png" sizes="32x32" href="${rel}assets/brand/favicon-32.png">
<link rel="icon" type="image/png" sizes="64x64" href="${rel}assets/brand/favicon-64.png">
<link rel="icon" type="image/png" sizes="192x192" href="${rel}assets/brand/icon-192.png">
<link rel="apple-touch-icon" href="${rel}assets/brand/apple-touch-icon.png">
<link rel="stylesheet" href="${rel}style.css?v=${config.assetVersion}">
<script>document.documentElement.classList.add('has-js');</script>${extra}
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>

${ICONS}
`;
}

export const publisher = () => ({
  '@type': 'Organization', name: config.company.name, url: config.company.url,
  logo: { '@type': 'ImageObject', url: absUrl('assets/brand/icon-512.png') },
});

export const breadcrumb = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
});
