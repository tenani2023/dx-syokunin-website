// OpenAI gpt-image で画像を作り、JPEGに整えて保存する
import OpenAI from 'openai';
import sharp from 'sharp';
import { env } from './config.mjs';

const openai = new OpenAI();

const STYLE = 'Flat vector illustration, clean and simple, navy blue (#0b1f3f) and green (#06c755) accent palette with soft light-gray background, Japanese construction and real-estate workplace, people with Japanese appearance, no text, no letters, no logos, no watermark.';

/** 画像を生成して JPEG で保存。ratio は 'hero'(16:9) か 'section'(3:2) */
export async function generateImage(prompt, outFile, ratio = 'section') {
  const res = await openai.images.generate({
    model: env.imageModel,
    prompt: `${prompt}\n\n${STYLE}`,
    size: '1536x1024',
    quality: env.imageQuality,
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('画像が返ってきませんでした');
  let img = sharp(Buffer.from(b64, 'base64'));
  if (ratio === 'hero') img = img.resize({ width: 1536, height: 864, fit: 'cover', position: 'centre' });
  await img.jpeg({ quality: 82, mozjpeg: true }).toFile(outFile);
  return outFile;
}
