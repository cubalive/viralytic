import { config } from '../config';
import { publisherModelUrl, vertexPost } from '../lib/vertex';
import { toBase64 } from '../lib/files';

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function generate(
  model: string,
  parts: Part[],
  opts: { json?: boolean; schema?: unknown; system?: string } = {},
): Promise<string> {
  const body: any = { contents: [{ role: 'user', parts }], generationConfig: {} };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.json) {
    body.generationConfig.responseMimeType = 'application/json';
    if (opts.schema) body.generationConfig.responseSchema = opts.schema;
  }
  // Gemini responde en la región 'global' (verificado).
  const url = publisherModelUrl(model, 'generateContent', 'global');
  const res = await vertexPost(url, body);
  const parts2 = res?.candidates?.[0]?.content?.parts ?? [];
  return parts2.map((p: any) => p.text ?? '').join('');
}

export function geminiText(prompt: string, system?: string) {
  return generate(config.models.gemini, [{ text: prompt }], { system });
}

export async function geminiJson<T>(prompt: string, schema: unknown, system?: string): Promise<T> {
  const out = await generate(config.models.gemini, [{ text: prompt }], { json: true, schema, system });
  return JSON.parse(out) as T;
}

export async function geminiVision(
  prompt: string,
  imagePaths: string[],
  opts: { json?: boolean; schema?: unknown } = {},
): Promise<string> {
  const parts: Part[] = [{ text: prompt }];
  for (const p of imagePaths) {
    parts.push({ inlineData: { mimeType: 'image/png', data: await toBase64(p) } });
  }
  return generate(config.models.geminiVision, parts, opts);
}
