// 一度だけ使う移行スクリプト: 手書きの column/*.html を column/posts/*.md に変換する
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ROOT } from './lib/site.mjs';

const CAT = { 'AI活用': 'genba', '情報の扱い': 'genba', '助成金': 'joseikin' };
const dir = path.join(ROOT, 'column');
const un = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
const pick = (re, s) => { const m = s.match(re); return m ? un(m[1]) : ''; };

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html')) {
  const slug = f.replace(/\.html$/, '');
  const out = path.join(dir, 'posts', `${slug}.md`);
  if (fs.existsSync(out)) { console.log(`skip ${slug} (すでにあります)`); continue; }
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const title = pick(/<h1 class="page-title">([\s\S]*?)<\/h1>/, html);
  const seoTitle = pick(/<title>([\s\S]*?)<\/title>/, html).replace(/｜DX職人$/, '');
  const meta = {
    title,
    ...(seoTitle && seoTitle !== title ? { seoTitle } : {}),
    date: pick(/<time datetime="([^"]+)"/, html),
    category: CAT[pick(/<span class="post-card__cat">([^<]*)</, html)] || 'genba',
    description: pick(/<meta name="description" content="([^"]*)"/, html),
    lead: pick(/<p class="intro">([\s\S]*?)<\/p>/, html),
    image: `${slug}.jpg`,
  };
  const body = html.match(/<div class="wrap post__body">([\s\S]*?)<div class="post__cta">/)[1];
  const points = [...(body.match(/<div class="post__points">[\s\S]*?<\/div>/)?.[0] || '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => un(m[1]));
  if (points.length) meta.points = points;
  const refs = [...(body.match(/<div class="post__refs">[\s\S]*?<\/div>/)?.[0] || '').matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<svg/g)].map((m) => ({ title: un(m[2]), url: m[1] }));
  if (refs.length) meta.refs = refs;

  const main = body.replace(/<div class="post__points">[\s\S]*?<\/div>/, '').replace(/<div class="post__refs">[\s\S]*?<\/div>/, '');
  const lines = [];
  let inSteps = false;
  for (const m of main.matchAll(/<(h2|p)([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, tag, attrs, inner] = m;
    const text = un(inner);
    if (tag === 'h2') { inSteps = false; lines.push('', `## ${text}`, ''); continue; }
    if (/post__step/.test(attrs)) { inSteps = true; lines.push(text.replace(/^(\d+)\.\s*/, '$1. ')); continue; }
    if (inSteps) { inSteps = false; lines.push(''); }
    lines.push(text, '');
  }
  const md = `---\n${yaml.dump(meta, { lineWidth: -1, quotingType: '"' })}---\n${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  fs.writeFileSync(out, md);
  console.log(`wrote ${out}`);
}
