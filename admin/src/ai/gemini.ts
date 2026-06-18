// Text/JSON/vision generation — now backed by OpenAI ChatGPT (switched from
// Gemini/Vertex per request). The exported names (geminiText/geminiJson/
// geminiVision) are kept so the ~20 callers don't change; only the engine did.
import OpenAI from 'openai';
import { toBase64 } from '../lib/files';

// timeout 2min + 2 reintentos automáticos → una llamada colgada no congela el cron diario.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 2 });
const TEXT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? TEXT_MODEL;

export async function geminiText(prompt: string, system?: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      { role: 'user' as const, content: prompt },
    ],
  });
  return res.choices[0]?.message?.content ?? '';
}

export async function geminiJson<T>(prompt: string, schema: unknown, system?: string): Promise<T> {
  // OpenAI json_object mode + the schema as an explicit instruction (the word
  // "JSON" must appear in the messages, which the schema hint guarantees).
  const schemaHint = schema
    ? `\n\nReturn ONLY valid JSON matching this schema (no prose):\n${JSON.stringify(schema)}`
    : '\n\nReturn ONLY valid JSON.';
  const res = await openai.chat.completions.create({
    model: TEXT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      { role: 'user' as const, content: prompt + schemaHint },
    ],
  });
  return JSON.parse(res.choices[0]?.message?.content ?? '{}') as T;
}

export async function geminiVision(
  prompt: string,
  imagePaths: string[],
  opts: { json?: boolean; schema?: unknown } = {},
): Promise<string> {
  const hint = opts.json
    ? `\n\nReturn ONLY valid JSON${opts.schema ? ` matching: ${JSON.stringify(opts.schema)}` : '.'}`
    : '';
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: prompt + hint }];
  for (const p of imagePaths) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${await toBase64(p)}` } });
  }
  const res = await openai.chat.completions.create({
    model: VISION_MODEL,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [{ role: 'user', content }],
  });
  return res.choices[0]?.message?.content ?? '';
}
