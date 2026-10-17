// OpenAI(Responses API)で構造化出力を得る共通処理
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { env } from './config.mjs';

let client;

/**
 * @param {{system: string, user: string, schema: import('zod').ZodTypeAny, name: string, maxTokens?: number}} p
 * @returns {Promise<{data: any, usage: object}>}
 */
export async function structured({ system, user, schema, name, maxTokens = 64000 }) {
  client ??= new OpenAI();
  const call = (effort) => client.responses.parse({
    model: env.textModel,
    instructions: system,
    input: user,
    reasoning: { effort },
    text: { format: zodTextFormat(schema, name), verbosity: 'medium' },
    max_output_tokens: maxTokens,
  });
  let res = await call(env.reasoningEffort);
  // 考えすぎて上限に達したときは、推論を軽くして1回だけやり直す
  if (res.status === 'incomplete' && res.incomplete_details?.reason === 'max_output_tokens' && env.reasoningEffort !== 'low') {
    console.error(`出力が上限で途中終了(${name})。推論を軽くしてやり直します`);
    res = await call(env.reasoningEffort === 'high' ? 'medium' : 'low');
  }
  if (res.status === 'incomplete') throw new Error(`出力が途中で終わりました(${res.incomplete_details?.reason || ''})`);
  const refusal = res.output?.flatMap((o) => o.content || []).find((c) => c.type === 'refusal');
  if (refusal) throw new Error(`生成が拒否されました: ${refusal.refusal}`);
  if (!res.output_parsed) throw new Error('構造化出力が得られませんでした');
  return { data: res.output_parsed, usage: res.usage };
}
