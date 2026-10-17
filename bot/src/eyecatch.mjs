// コラムのアイキャッチ(統一デザイン)
//   背景・バッジ・タイトル・吹き出し・「DX職人 COLUMN」は HTML テンプレートで正確に組む(文字化け・誤字が出ない)。
//   右側のイラストだけ gpt-image で透過PNGを作って載せる(イラストには文字を入れない)。
// 見本: 初期の4本(見積書・日報・計画届・AIに入力してよい情報)のデザイン。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import OpenAI from 'openai';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { env, BOT_DIR } from './config.mjs';

export const W = 1600, H = 900;
const FONT_DIR = path.join(BOT_DIR, 'assets', 'fonts');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 【】で囲んだ部分を緑で強調
const emph = (s) => esc(s).replace(/【(.+?)】/g, '<em>$1</em>');

let openai;
const ILLUST_STYLE = [
  'Flat vector illustration with soft gradients, isolated objects on a plain pure white (#ffffff) background with no shadows on the ground.',
  'Every object has a clear thin navy outline that fully encloses it.',
  'Every object has SOLID, OPAQUE fills (white paper, white robot body, light blue phone screen) so it stands out clearly on a dark navy page; no hollow outline-only shapes.',
  'Clean modern Japanese SaaS / infographic style, rounded shapes, thin navy outlines.',
  'Palette: white, very light blue (#dbeafe), sky blue (#93c5fd), bright green (#22c55e) accents, navy (#0b1f3f) details.',
  'Documents, phones and screens show only gray placeholder lines and simple icons, never readable text.',
  'If a robot appears: a cute round white robot head with a dark navy visor showing a happy green face, small antenna, and a green square badge on its body.',
  'Keep every object completely inside the canvas with wide empty margins (about 10% on each side); nothing may touch or cross the edges.',
  'Absolutely no text, no letters, no numbers, no logos, no watermark, no frame, no border lines.',
].join(' ');

/** 右側のイラスト(透過PNG)を作る */
export async function makeIllustration(prompt, outPng) {
  openai ??= new OpenAI();
  const res = await openai.images.generate({
    model: env.imageModel,
    prompt: `${prompt}\n\n${ILLUST_STYLE}`,
    size: '1536x1024',
    quality: env.imageQuality,
    background: 'opaque',
    output_format: 'png',
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('イラストが返ってきませんでした');
  await cleanIllustration(Buffer.from(b64, 'base64'), outPng);
  return outPng;
}

// 白背景のうち「外側につながっている白」だけを透明にする(書類やロボットの中の白は残る)。
// 輪郭のまわりは白っぽさに応じて半透明にして、紺の背景になじませる。最後に余白を詰める。
export async function cleanIllustration(input, outPng) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const lum = (p) => Math.min(data[p], data[p + 1], data[p + 2]);
  const BG = 232;     // これ以上白ければ背景とみなす
  const EDGE = 200;   // 背景に接するこの範囲の明るさは半透明にする
  const seen = new Uint8Array(w * h);
  const stack = [];
  const pushIf = (x, y) => { const k = y * w + x; if (!seen[k] && lum(k * 4) >= BG) { seen[k] = 1; stack.push(k); } };
  for (let x = 0; x < w; x++) { pushIf(x, 0); pushIf(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIf(0, y); pushIf(w - 1, y); }
  while (stack.length) {
    const k = stack.pop(); const x = k % w, y = (k - x) / w;
    data[k * 4 + 3] = 0;
    if (x > 0) pushIf(x - 1, y); if (x < w - 1) pushIf(x + 1, y);
    if (y > 0) pushIf(x, y - 1); if (y < h - 1) pushIf(x, y + 1);
  }
  // 背景に接している明るめの輪郭画素を半透明に(白いフチが残らないように)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (seen[k]) continue;
      if (!(seen[k - 1] || seen[k + 1] || seen[k - w] || seen[k + w])) continue;
      const l = lum(k * 4);
      if (l > EDGE) data[k * 4 + 3] = Math.max(0, Math.min(255, Math.round(255 * (BG - l) / (BG - EDGE))));
    }
  }
  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .png().toFile(outPng);
  return outPng;
}

function html({ badge, lines, sub, bubbles = [], illustration }) {
  const font = (f) => pathToFileURL(path.join(FONT_DIR, f)).href;
  const [b1, b2] = bubbles;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: R; font-weight: 800; src: url("${font('MPLUSRounded1c-ExtraBold.ttf')}"); }
@font-face { font-family: R; font-weight: 900; src: url("${font('MPLUSRounded1c-Black.ttf')}"); }
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; overflow:hidden; }
body { position:relative; font-family:R, sans-serif; color:#fff;
  background: radial-gradient(1200px 700px at 30% 40%, #0f2d66 0%, #0b2152 45%, #081a42 100%); }
/* 背景の飾り: 方眼・大きな円・四隅の緑・ドット */
.grid { position:absolute; inset:0; opacity:.07;
  background-image: linear-gradient(#9cc3ff 1px, transparent 1px), linear-gradient(90deg, #9cc3ff 1px, transparent 1px);
  background-size: 48px 48px; }
.circle { position:absolute; border-radius:50%; background:#163a7a; opacity:.55; }
.c1 { width:620px; height:620px; left:720px; top:-380px; }
.c2 { width:900px; height:900px; left:640px; top:560px; opacity:.35; }
.blob { position:absolute; border-radius:50%; filter: blur(.5px); }
.g1 { width:360px; height:300px; left:-180px; top:-170px; background: radial-gradient(circle at 70% 70%, #22e07a, #0fb36b 60%, transparent 61%); }
.g2 { width:420px; height:360px; right:-180px; bottom:-200px; background: radial-gradient(circle at 30% 30%, #22e07a, #0fb36b 60%, transparent 61%); }
.dots { position:absolute; width:96px; height:72px; opacity:.45;
  background-image: radial-gradient(#7fa7e6 4px, transparent 4.5px); background-size:24px 24px; }
.d1 { right:56px; top:46px; } .d2 { right:220px; bottom:30px; }

/* 左: 文字 */
.left { position:absolute; left:80px; top:70px; width:760px; height:720px; display:flex; flex-direction:column; justify-content:center; }
.badge { align-self:flex-start; background:#22e07a; color:#0b2152; font-weight:900; font-size:44px; line-height:1;
  padding:18px 40px 20px; border-radius:999px; margin-bottom:26px; letter-spacing:.02em; }
.title { font-weight:900; line-height:1.12; letter-spacing:-.01em; text-shadow: 0 4px 0 rgba(4,14,40,.35); }
.title div { white-space:nowrap; }
.title em { font-style:normal; color:#2ee88a; }
.sub { align-self:flex-start; margin-top:26px; background:#fff; color:#0b2152; font-weight:900; font-size:50px; line-height:1;
  padding:18px 40px 20px; border-radius:999px; white-space:nowrap; }
.sub em { font-style:normal; color:#16c46b; }
.brand { position:absolute; left:84px; bottom:36px; font-weight:800; font-size:28px; letter-spacing:.18em; color:#9db7e3; }

/* 右: イラストと吹き出し */
.illust { position:absolute; left:830px; top:210px; width:700px; height:480px; object-fit:contain;
  filter: drop-shadow(0 18px 30px rgba(0,0,0,.28)); }
.bubble { position:absolute; background:#a9d2fb; color:#0b2152; font-weight:800; font-size:32px; line-height:1.3;
  padding:20px 34px; border-radius:40px; text-align:center; white-space:pre-line; box-shadow:0 10px 24px rgba(0,0,0,.18); }
.bubble::after { content:""; position:absolute; width:34px; height:34px; background:#a9d2fb; border-radius:4px; }
.b1 { right:110px; top:96px; }
.b1::after { left:52px; bottom:-14px; transform: skewX(28deg) rotate(45deg); }
.b2 { left:870px; bottom:96px; }
.b2::after { right:52px; top:-14px; transform: skewX(28deg) rotate(45deg); }
</style></head><body>
<div class="grid"></div>
<div class="circle c1"></div><div class="circle c2"></div>
<div class="blob g1"></div><div class="blob g2"></div>
<div class="dots d1"></div><div class="dots d2"></div>
${illustration ? `<img class="illust" src="${pathToFileURL(illustration).href}">` : ''}
${b1 ? `<div class="bubble b1">${esc(b1)}</div>` : ''}
${b2 ? `<div class="bubble b2">${esc(b2)}</div>` : ''}
<div class="left">
  ${badge ? `<div class="badge">${esc(badge)}</div>` : ''}
  <div class="title" id="title">${lines.map((l) => `<div>${emph(l)}</div>`).join('')}</div>
  ${sub ? `<div class="sub">${emph(sub)}</div>` : ''}
</div>
<div class="brand">DX職人 COLUMN</div>
<script>
  // タイトルの文字サイズを、左の枠に収まる最大にする
  (async () => {
    await document.fonts.ready;
    const t = document.getElementById('title'), box = document.querySelector('.left');
    const others = [...box.children].filter((e) => e !== t).reduce((s, e) => s + e.offsetHeight + 26, 0);
    let size = 168;
    const fits = () => [...t.children].every((d) => d.scrollWidth <= box.clientWidth) && t.offsetHeight + others <= box.clientHeight;
    t.style.fontSize = size + 'px';
    while (!fits() && size > 56) { size -= 2; t.style.fontSize = size + 'px'; }
    document.body.dataset.ready = '1';
  })();
</script>
</body></html>`;
}

/**
 * アイキャッチを JPEG で書き出す
 * @param {{badge:string, lines:string[], sub?:string, bubbles?:string[], illustration?:string}} spec
 *   lines: タイトルを行ごとに(【】で囲むと緑)。sub: 下の白い帯(任意)。bubbles: 吹き出し2つ(改行は \n)
 */
export async function renderEyecatch(spec, outFile) {
  const tmp = path.join(os.tmpdir(), `eyecatch-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, html(spec));
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
    await page.screenshot({ path: outFile, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: W, height: H } });
  } finally {
    await browser.close();
    fs.rmSync(tmp, { force: true });
  }
  return outFile;
}
