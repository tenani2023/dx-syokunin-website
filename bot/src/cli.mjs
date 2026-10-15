// LINEを使わずに手元で1本作る: npm run gen -- "テーマ" [--draft] [--no-push]
import { generateArticle } from './generate.mjs';
import { publishArticle, listPosts, syncRepo } from './publish.mjs';

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const theme = args.filter((a) => !a.startsWith('--')).join(' ');
if (!theme) { console.error('使い方: npm run gen -- "テーマ" [--draft]'); process.exit(1); }

await syncRepo();
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
console.log('生成中:', theme);
const { article, usage } = await generateArticle(theme, { existingTitles: listPosts().map((p) => p.title), today });
console.log(`タイトル: ${article.title}\nトークン: in ${usage.input_tokens} / out ${usage.output_tokens}`);
const url = await publishArticle(article, { draft, onProgress: (s) => console.log(s) });
console.log('公開:', url);
