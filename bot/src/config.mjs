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
  lineSecret: need('LINE_CHANNEL_SECRET'),
  lineToken: need('LINE_CHANNEL_ACCESS_TOKEN'),
  allowed: (process.env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  imageQuality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
  maxSectionImages: Number(process.env.MAX_SECTION_IMAGES || 6),
  repoDir: path.resolve(need('REPO_DIR')),
  branch: process.env.GIT_BRANCH || 'main',
  gitName: process.env.GIT_AUTHOR_NAME || 'dx-syokunin-bot',
  gitEmail: process.env.GIT_AUTHOR_EMAIL || 'bot@example.com',
  port: Number(process.env.PORT || 3000),
  // LOCAL_MODE=1: git の同期・commit・push をしない(手元の作業ツリーで試すとき)
  localMode: process.env.LOCAL_MODE === '1',
};

export const site = JSON.parse(fs.readFileSync(path.join(env.repoDir, 'site.config.json'), 'utf8'));
export const systemPrompt = fs.readFileSync(path.join(BOT_DIR, 'prompts', 'article.md'), 'utf8');
export const keywords = JSON.parse(fs.readFileSync(path.join(BOT_DIR, 'data', 'keywords.json'), 'utf8'));
