import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BOT_DIR = path.resolve(here, '..');

const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`環境変数 ${k} がありません(.env を確認)`);
  return v;
};

export const env = {
  // LINE(サーバー起動時にだけ必須。CLI では不要)
  lineSecret: process.env.LINE_CHANNEL_SECRET || '',
  lineToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  // 管理者(スタッフ申請の承認・却下ができる)。カンマ区切り
  admins: (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // 追加で投稿を許可するユーザー(旧設定。通常はスタッフ登録を使う)
  allowed: (process.env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // 文章生成(OpenAI Responses API)
  textModel: process.env.OPENAI_TEXT_MODEL || 'gpt-5.5',
  reasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'high',
  imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  imageQuality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
  maxSectionImages: Number(process.env.MAX_SECTION_IMAGES || 6),
  repoDir: path.resolve(need('REPO_DIR')),
  branch: process.env.GIT_BRANCH || 'main',
  gitName: process.env.GIT_AUTHOR_NAME || 'dx-syokunin-bot',
  gitEmail: process.env.GIT_AUTHOR_EMAIL || 'bot@example.com',
  port: Number(process.env.PORT || 3200),
  // GitHub の Webhook(push → サイト再生成)の署名検証用シークレット。空なら /deploy は無効
  deploySecret: process.env.DEPLOY_SECRET || '',
  // LOCAL_MODE=1: git の同期・commit・push をしない(手元の作業ツリーで試すとき)
  localMode: process.env.LOCAL_MODE === '1',
  // Google 連携(任意)
  googleKeyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS) : '',
  gscSiteUrl: process.env.GSC_SITE_URL || '',
  ga4PropertyId: process.env.GA4_PROPERTY_ID || '',
  sheetId: process.env.SHEET_ID || '',
  // 定期提案(cron 形式、JST)。空なら提案しない
  suggestCron: process.env.SUGGEST_CRON || '',
};

export const site = JSON.parse(fs.readFileSync(path.join(env.repoDir, 'site.config.json'), 'utf8'));
export const systemPrompt = fs.readFileSync(path.join(BOT_DIR, 'prompts', 'article.md'), 'utf8');
export const keywords = JSON.parse(fs.readFileSync(path.join(BOT_DIR, 'data', 'keywords.json'), 'utf8'));
