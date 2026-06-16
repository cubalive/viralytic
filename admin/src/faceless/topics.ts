// Genera temas FRESCOS e infinitos por canal (nunca repite). Persiste los usados.
import path from 'node:path';
import { geminiJson } from '../ai/gemini';
import { readJson, writeJson } from '../lib/files';
import { ROOT } from '../config';

const SCHEMA = { type: 'object', properties: { topics: { type: 'array', items: { type: 'string' } } }, required: ['topics'] };

export interface Niche { system: string; ask: string }

/** Devuelve n temas nuevos para el canal, evitando seed + ya usados. Los persiste. */
export async function freshTopics(slotId: string, niche: Niche, n: number, seed: string[] = []): Promise<string[]> {
  const file = path.join(ROOT, 'data', 'youtube', `used_topics_${slotId}.json`);
  const used = await readJson<string[]>(file, []);
  const avoid = [...new Set([...seed, ...used])];
  const avoidTxt = avoid.length ? `\n\nAVOID these already-used topics — return COMPLETELY DIFFERENT ones:\n- ${avoid.slice(-140).join('\n- ')}` : '';
  let fresh: string[] = [];
  for (let attempt = 0; attempt < 3 && fresh.length < n; attempt++) {
    const out = await geminiJson<{ topics: string[] }>(`${niche.ask} Generate EXACTLY ${n} fresh, distinct, scroll-stopping topics.${avoidTxt}`, SCHEMA, niche.system);
    for (const t of out.topics || []) {
      const tt = (t || '').trim();
      if (tt && !avoid.includes(tt) && !fresh.includes(tt)) fresh.push(tt);
    }
  }
  fresh = fresh.slice(0, n);
  await writeJson(file, [...used, ...fresh]);
  return fresh;
}
