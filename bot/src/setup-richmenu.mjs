// スタッフ用リッチメニューを作成(作り直し)し、管理者・スタッフ全員にリンクする
//   cd bot && npm run richmenu
import { createStaffMenu, linkStaffMenu } from './richmenu.mjs';
import { menuTargets } from './staff.mjs';

const id = await createStaffMenu();
console.log('リッチメニューを作成:', id);
for (const uid of menuTargets()) {
  try { await linkStaffMenu(uid); console.log('リンク:', uid); }
  catch (e) { console.error('リンク失敗:', uid, e.message); }
}
