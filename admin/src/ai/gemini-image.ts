import { config } from '../config';
import { publisherModelUrl, vertexPost } from '../lib/vertex';
import { saveBase64, toBase64 } from '../lib/files';

export interface GeminiImageOptions {
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  /** Imágenes de referencia (canon) para mantener al personaje consistente. */
  refImagePaths?: string[];
}

function extractImage(res: any): string | undefined {
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  return parts.find((p: any) => p.inlineData?.data)?.inlineData?.data;
}

async function buildParts(prompt: string, refs?: string[]) {
  const parts: any[] = [];
  // Las imágenes de referencia van primero; Gemini las usa para mantener consistencia.
  for (const p of (refs ?? []).slice(0, 6)) {
    parts.push({ inlineData: { mimeType: 'image/png', data: await toBase64(p) } });
  }
  parts.push({ text: prompt });
  return parts;
}

/**
 * Genera una imagen con Gemini (modelo de imagen, p.ej. gemini-2.5-flash-image).
 * Si se pasan refImagePaths, las usa como referencia para mantener el personaje
 * consistente — esta es la base del "canon de personajes".
 */
export async function geminiImage(
  prompt: string,
  outPath: string,
  opts: GeminiImageOptions = {},
): Promise<string> {
  const url = publisherModelUrl(config.models.geminiImage, 'generateContent', 'global');

  // A veces el modelo responde NO_IMAGE (no genera). Reintentamos reforzando la orden.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const extra = attempt === 1 ? '' : ' Generate a single illustrated image now. Do not reply with text.';
    const parts = await buildParts(prompt + extra, opts.refImagePaths);
    const generationConfig: any = { responseModalities: ['IMAGE'] };
    if (opts.aspectRatio) generationConfig.imageConfig = { aspectRatio: opts.aspectRatio };

    let res: any;
    try {
      res = await vertexPost(url, { contents: [{ role: 'user', parts }], generationConfig });
    } catch (e) {
      if (opts.aspectRatio && /imageConfig|aspectRatio|INVALID_ARGUMENT|400/i.test((e as Error).message)) {
        res = await vertexPost(url, { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'] } });
      } else {
        throw e;
      }
    }

    const b64 = extractImage(res);
    if (b64) {
      await saveBase64(outPath, b64);
      return outPath;
    }
    // NO_IMAGE → siguiente intento
  }
  throw new Error('Gemini no devolvió imagen tras 3 intentos (NO_IMAGE)');
}
