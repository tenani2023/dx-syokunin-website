// OpenAI(Responses API)で構造化出力を得る共通処理
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { env } from './config.mjs';

let client;

/**
 * @param {{system: string, user: string, schema: import('zod').ZodTypeAny, name: string, maxTokens?: number}} p
 * @returns {Promise<{data: any, usage: object}>}
 */
export async function structured({ system, user, schema, name, maxTokens = 32000 }) {
  client ??= new OpenAI();
  const res = await client.responses.parse({
    model: env.textModel,
    instructions: system,
    input: user,
    reasoning: { effort: env.reasoningEffort },
    text: { format: zodTextFormat(schema, name), verbosity: 'medium' },
    max_output_tokens: maxTokens,
  });
  if (res.status === 'incomplete') throw new Error(`出力が途中で終わりました(${res.incomplete_details?.reason || ''})`);
  const refusal = res.output?.flatMap((o) => o.content || []).find((c) => c.type === 'refusal');
  if (refusal) throw new Error(`生成が拒否されました: ${refusal.refusal}`);
  if (!res.output_parsed) throw new Error('構造化出力が得られませんでした');
  return { data: res.output_parsed, usage: res.usage };
}
