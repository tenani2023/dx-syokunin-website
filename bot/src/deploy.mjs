// 手動・cron 用: origin の最新を取り込んでサイトを再生成する
//   cd bot && npm run deploy
import { deploySite } from './publish.mjs';

try {
  await deploySite();
  console.log('deploy 完了');
} catch (e) {
  console.error('deploy 失敗:', e.message);
  process.exit(1);
}
