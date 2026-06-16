import { publisherModelUrl, vertexPost } from '../src/lib/vertex';

const MODELS = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-2.0-flash-preview-image-generation'];

for (const m of MODELS) {
  try {
    const url = publisherModelUrl(m, 'generateContent', 'global');
    const res = await vertexPost(url, {
      contents: [{ role: 'user', parts: [{ text: 'A simple red apple, cartoon style, white background' }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    });
    const parts = res?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p: any) => p.inlineData);
    console.log(`${m}: ${img ? 'IMAGE OK (~' + img.inlineData.data.length + ' b64 chars)' : 'NO IMAGE → ' + JSON.stringify(res).slice(0, 200)}`);
  } catch (e) {
    console.log(`${m}: ERROR ${(e as Error).message.slice(0, 160)}`);
  }
}
