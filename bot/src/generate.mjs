// Claude で記事を生成する(構造化出力)
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env, site, systemPrompt } from './config.mjs';

const client = new Anthropic();

const Article = z.object({
  title: z.string(),
  seoTitle: z.string(),
  slug: z.string(),
  category: z.enum(Object.keys(site.categories)),
  description: z.string(),
  lead: z.string(),
  keywords: z.array(z.string()),
  points: z.array(z.string()),
  heroImagePrompt: z.string(),
  heroImageAlt: z.string(),
  sections: z.array(z.object({
    heading: z.string(),
    body: z.string(),
    imagePrompt: z.string(),
    imageAlt: z.string(),
  })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  refs: z.array(z.object({ title: z.string(), url: z.string() })),
});

/**
 * @param {string} theme ユーザーが送ったテーマ(キーワードや一言)
 * @param {{existingTitles: string[], today: string}} ctx
 */
export async function generateArticle(theme, ctx) {
  const user = [
    `# テーマ`,
    theme,
    ``,
    `# 条件`,
    `- 今日の日付: ${ctx.today}`,
    `- サイトのカテゴリ: ${Object.entries(site.categories).map(([k, c]) => `${k}=${c.name}`).join(', ')}`,
    `- すでにある記事(重複しない切り口にする): ${ctx.existingTitles.slice(0, 40).join(' / ') || 'なし'}`,
    ``,
    `執筆ルールに従って、記事を1本、JSONで出力してください。`,
  ].join('\n');

  const stream = client.messages.stream({
    model: env.anthropicModel,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: zodOutputFormat(Article) },
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error(`生成が拒否されました: ${msg.stop_details?.explanation || ''}`);
  if (msg.stop_reason === 'max_tokens') throw new Error('出力が長すぎて途中で切れました');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const article = Article.parse(JSON.parse(text));

  // slug の正規化(英小文字・数字・ハイフンのみ)
  article.slug = article.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `post-${Date.now()}`;
  return { article, usage: msg.usage };
}
