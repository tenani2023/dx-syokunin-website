// スタッフ用リッチメニュー
//   画像: bot/assets/richmenu-staff.png(デスクトップ/開発環境/canva-rich/generate_dx_syokunin_staff_richmenu.js で生成)
//   公式アカウントはお客さまとのチャットと共用なので、デフォルトにはせず管理者・スタッフに個別リンクする。
//   作成したメニューの ID は bot/var/richmenu.json に保存。
import fs from 'node:fs';
import path from 'node:path';
import { messagingApi } from '@line/bot-sdk';
import { env, BOT_DIR } from './config.mjs';

const IMAGE = path.join(BOT_DIR, 'assets', 'richmenu-staff.png');
const STATE = path.join(BOT_DIR, 'var', 'richmenu.json');

const client = () => new messagingApi.MessagingApiClient({ channelAccessToken: env.lineToken });
const blob = () => new messagingApi.MessagingApiBlobClient({ channelAccessToken: env.lineToken });

export function staffMenuId() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')).staff || ''; } catch { return ''; }
}

/** メニューを作り直す(前回作ったものは削除)。新しい ID を返す */
export async function createStaffMenu() {
  const c = client();
  const old = staffMenuId();
  const { richMenuId } = await c.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'DX職人 スタッフ(コラム投稿)',
    chatBarText: 'コラム投稿',
    areas: [
      { bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'postback', data: 'menu=column', displayText: 'コラム投稿' } },
    ],
  });
  await blob().setRichMenuImage(richMenuId, new Blob([fs.readFileSync(IMAGE)], { type: 'image/png' }));
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ staff: richMenuId, createdAt: new Date().toISOString() }, null, 2));
  if (old && old !== richMenuId) await c.deleteRichMenu(old).catch(() => {});
  return richMenuId;
}

export async function linkStaffMenu(userId) {
  const id = staffMenuId();
  if (!id) return false;
  await client().linkRichMenuIdToUser(userId, id);
  return true;
}

export async function unlinkStaffMenu(userId) {
  await client().unlinkRichMenuIdFromUser(userId).catch(() => {});
}
