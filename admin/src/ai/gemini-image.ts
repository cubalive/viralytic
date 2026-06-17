// Image generation — now backed by OpenAI gpt-image-1 (switched from Gemini's
// image model per request). Export name `geminiImage` kept so callers don't
// change. Reference images (canon) use images.edit; plain prompts use
// images.generate. aspectRatio maps to the nearest gpt-image-1 size.
import fs from 'node:fs';
import OpenAI from 'openai';
import { saveBase64 } from '../lib/files';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';

export interface GeminiImageOptions {
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  /** Imágenes de referencia (canon) para mantener al personaje consistente. */
  refImagePaths?: string[];
}

type ImgSize = '1024x1024' | '1536x1024' | '1024x1536';
function sizeFor(ar?: string): ImgSize {
  if (ar === '16:9' || ar === '4:3') return '1536x1024'; // landscape
  if (ar === '9:16' || ar === '3:4') return '1024x1536'; // portrait
  return '1024x1024';
}

/**
 * Genera una imagen con gpt-image-1. Si se pasan refImagePaths, las usa como
 * referencia (images.edit) para mantener el personaje consistente — la base del
 * "canon de personajes".
 */
export async function geminiImage(
  prompt: string,
  outPath: string,
  opts: GeminiImageOptions = {},
): Promise<string> {
  const size = sizeFor(opts.aspectRatio);
  const refs = (opts.refImagePaths ?? []).slice(0, 4);

  let b64: string | undefined;
  if (refs.length) {
    const files = await Promise.all(
      refs.map((p, i) => OpenAI.toFile(fs.readFileSync(p), `ref_${i}.png`, { type: 'image/png' })),
    );
    const result = await openai.images.edit({ model: IMAGE_MODEL, image: files, prompt, size });
    b64 = result.data?.[0]?.b64_json;
  } else {
    const result = await openai.images.generate({ model: IMAGE_MODEL, prompt, size });
    b64 = result.data?.[0]?.b64_json;
  }

  if (!b64) throw new Error('gpt-image-1 no devolvió imagen');
  await saveBase64(outPath, b64);
  return outPath;
}
