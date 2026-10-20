// お客さまへの「担当者から連絡します」を送ったかどうかの記録
//   担当者の返信(LINE Official Account Manager のチャット)は Webhook に来ないので、
//   最初の1回だけ返し、やりとりが ACK_GAP 止まっていたらもう一度返す。記録は bot/var/guests.json
import fs from 'node:fs';
import path from 'node:path';
import { BOT_DIR } from './config.mjs';

const FILE = path.join(BOT_DIR, 'var', 'guests.json');
const ACK_GAP = 30 * 24 * 3600 * 1000;

/** @type {Record<string, {ackedAt:number, lastAt:number}>} */
let guests = {};
try { guests = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* 初回は空 */ }

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(guests, null, 2));
}

/** お客さまからメッセージが来たとき。案内を返すべきなら true(返した扱いにして記録する) */
export function shouldAck(uid) {
  const g = guests[uid];
  const t = Date.now();
  const ack = !g?.ackedAt || t - g.lastAt > ACK_GAP;
  guests[uid] = { ackedAt: ack ? t : g.ackedAt, lastAt: t };
  save();
  return ack;
}

/** ボタンの案内を返したときなど、返した扱いにする */
export function markAcked(uid) {
  const t = Date.now();
  guests[uid] = { ackedAt: t, lastAt: t };
  save();
}

/** 友だち追加(し直し)のときは記録を消して、次のメッセージで案内を返す */
export function resetGuest(uid) {
  if (!guests[uid]) return;
  delete guests[uid];
  save();
}
