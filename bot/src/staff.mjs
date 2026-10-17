// 管理者・スタッフの管理
//   管理者: .env の ADMIN_USER_IDS(固定)
//   スタッフ: 「スタッフ登録」→ 名前 → 管理者が承認/却下。記録は bot/var/staff.json(正)と
//            スプレッドシートの「スタッフ」タブ(閲覧用の写し)
import fs from 'node:fs';
import path from 'node:path';
import { env, BOT_DIR } from './config.mjs';
import { replaceTab, now } from './google.mjs';

const FILE = path.join(BOT_DIR, 'var', 'staff.json');

/** @type {Record<string, {userId:string, name:string, displayName:string, status:'承認待ち'|'スタッフ'|'却下'|'停止', requestedAt:string, decidedAt:string, decidedBy:string}>} */
let staff = {};
try { staff = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* 初回は空 */ }

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(staff, null, 2));
  // シートの写しは失敗しても止めない
  replaceTab('staff', Object.values(staff).map((s) => [s.name, s.status, s.userId, s.displayName, s.requestedAt, s.decidedAt, s.decidedBy])).catch((e) => console.error('スタッフ表の更新失敗', e.message));
}

export const isAdmin = (uid) => env.admins.includes(uid);
export const isStaff = (uid) => staff[uid]?.status === 'スタッフ';
/** 投稿できる人(管理者・スタッフ・旧設定の ALLOWED_USER_IDS) */
export const canPost = (uid) => isAdmin(uid) || isStaff(uid) || env.allowed.includes(uid);
export const getStaff = (uid) => staff[uid];
export const listStaff = () => Object.values(staff);

export function request(uid, name, displayName = '') {
  staff[uid] = { userId: uid, name, displayName, status: '承認待ち', requestedAt: now(), decidedAt: '', decidedBy: '' };
  save();
  return staff[uid];
}

/** 承認/却下。すでに処理済みなら null。byName は処理した管理者の表示名 */
export function decide(uid, approve, byName) {
  const s = staff[uid];
  if (!s || s.status !== '承認待ち') return null;
  s.status = approve ? 'スタッフ' : '却下';
  s.decidedAt = now();
  s.decidedBy = byName;
  save();
  return s;
}

export function stop(uid) {
  const s = staff[uid];
  if (!s) return null;
  s.status = '停止';
  s.decidedAt = now();
  save();
  return s;
}

/** リッチメニューを付ける相手(管理者+スタッフ) */
export const menuTargets = () => [...new Set([...env.admins, ...env.allowed, ...listStaff().filter((s) => s.status === 'スタッフ').map((s) => s.userId)])];
