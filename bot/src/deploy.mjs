// 手動用: 動いているボットに「GitHub の最新を取り込んでサイトを作り直す」よう頼む
// (ボットの処理の列に並ぶので、記事作成中の git 操作と重ならない)
//   cd bot && npm run deploy
import { env } from './config.mjs';

const res = await fetch(`http://127.0.0.1:${env.port}/internal/deploy`, { method: 'POST' }).catch((e) => ({ ok: false, statusText: e.message }));
console.log(res.ok ? '更新を依頼しました(結果は pm2 logs dx-syokunin-bot で確認)' : `依頼に失敗しました: ${res.status ?? ''} ${res.statusText}`);
if (!res.ok) process.exit(1);
