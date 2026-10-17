// OpenAI で記事を生成する(構造化出力)
import { z } from 'zod';
import { site, systemPrompt } from './config.mjs';
import { structured } from './llm.mjs';

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
 * @param {string|object} brief テーマの文字列、または企画(候補)オブジェクト
 * @param {{existingTitles: string[], today: string, rewrite?: {slug:string, body:string, title:string}}} ctx
 */
export async function generateArticle(brief, ctx) {
  const themeBlock = typeof brief === 'string'
    ? [brief]
    : [
      brief.theme,
      `- 狙う検索語: ${(brief.targetKeywords || []).join(', ')}`,
      `- 検索意図: ${brief.searchIntent || ''}`,
      `- 切り口: ${brief.angle || ''}`,
      `- カテゴリ: ${brief.category || ''}`,
    ];
  const rewriteBlock = ctx.rewrite
    ? [``, `# 改稿`, `これは既存記事「${ctx.rewrite.title}」(slug: ${ctx.rewrite.slug})の全面改稿です。URLとslugは変えません。`,
      `狙う検索語で上位を取れるよう、構成と内容を作り直してください。使える部分は活かして構いません。`, `## 既存記事の本文`, ctx.rewrite.body]
    : [];
  const user = [
    `# テーマ`,
    ...themeBlock,
    ...rewriteBlock,
    ``,
    `# 条件`,
    `- 今日の日付: ${ctx.today}`,
    `- サイトのカテゴリ: ${Object.entries(site.categories).map(([k, c]) => `${k}=${c.name}`).join(', ')}`,
    `- すでにある記事(重複しない切り口にする。内部リンク先もここから選ぶ):`,
    ...(ctx.existingPosts?.length
      ? ctx.existingPosts.slice(0, 60).map((p) => `  - ${p.title}(slug: ${p.slug})`)
      : (ctx.existingTitles || []).slice(0, 40).map((t) => `  - ${t}`)),
    ``,
    `執筆ルールに従って、記事を1本、JSONで出力してください。`,
  ].join('\n');

  const { data: article, usage } = await structured({ system: systemPrompt, user, schema: Article, name: 'article', maxTokens: 32000 });

  // slug の正規化(英小文字・数字・ハイフンのみ)
  article.slug = article.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `post-${Date.now()}`;
  return { article, usage };
}
