import path from 'node:path';
import fsp from 'node:fs/promises';
import { config } from '../config';
import { geminiJson } from '../ai/gemini';
import { ensureDir, exists, readJson, writeJson } from '../lib/files';
import { log } from '../lib/log';
import type { SeleccionEdu } from '../formats/types';

export interface SceneSfx { scene: number; prompt: string; label: string; path?: string }

const SCHEMA = {
  type: 'object',
  properties: {
    sounds: {
      type: 'array',
      items: {
        type: 'object',
        properties: { scene: { type: 'integer' }, prompt: { type: 'string' }, label: { type: 'string' } },
        required: ['scene', 'prompt', 'label'],
      },
    },
  },
  required: ['sounds'],
};

/** Gemini asigna a cada escena un sonido (del animal/objeto, o ambiente del lugar si es mudo). */
async function extractSceneSfx(sel: SeleccionEdu, n: number, topic: string): Promise<SceneSfx[]> {
  const beats = sel.brief.guion_por_beat.slice(0, n).map((b, i) => `Escena ${i}: ${b.accion}`).join('\n');
  const system =
    'Eres diseñador de sonido para videos infantiles. META: que cada escena se sienta REAL con un efecto de sonido. ' +
    'Para CADA escena propone un sonido corto y limpio (prompt EN INGLÉS): ' +
    '(a) el sonido característico del animal/objeto si lo tiene (vaca→"a cow mooing", elefante→"an elephant trumpeting", ' +
    'perro→"a dog barking", león→"a lion roaring", carro→"a car horn beeping"); ' +
    '(b) si el sujeto es SILENCIOSO (pulpo, pez) usa un AMBIENTE del lugar ' +
    '(mar→"gentle underwater bubbles", selva→"soft jungle ambience with birds", granja→"farm ambience"); ' +
    '(c) para temas ABSTRACTOS (números, colores, formas, frutas, emociones) usa un sonido de caricatura alegre que ' +
    'acompañe la acción (aparecer→"a cheerful cartoon pop", revelar color→"a magical sparkle chime", contar→"playful pop sounds", ' +
    'acierto→"a happy ding", fruta→"a juicy bite crunch"). ' +
    'CASI TODA escena debe llevar un sonido. Devuelve SOLO JSON.';
  const prompt =
    `Tema: ${topic}\nNarración: ${sel.brief.generadores.voz}\n\nEscenas (0-${n - 1}):\n${beats}\n\n` +
    `Devuelve {sounds:[{scene, prompt, label}]}.`;
  const out = await geminiJson<{ sounds: SceneSfx[] }>(prompt, SCHEMA, system);
  return (out.sounds || []).filter((s) => s.scene >= 0 && s.scene < n);
}

async function generateSfx(prompt: string, outPath: string, duration = 2): Promise<string> {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': config.elevenlabs.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt, duration_seconds: duration }),
  });
  if (!res.ok) throw new Error(`SFX ${res.status}: ${(await res.text()).slice(0, 200)}`);
  await ensureDir(path.dirname(outPath));
  await fsp.writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}

/** Genera (una vez por tema) los efectos de sonido por escena. Cacheado en sfx.json. */
export async function buildTopicSfx(sel: SeleccionEdu, dir: string, n: number, topic: string): Promise<SceneSfx[]> {
  const jsonPath = path.join(dir, 'sfx.json');
  if (exists(jsonPath)) return readJson<SceneSfx[]>(jsonPath, []);

  let list: SceneSfx[] = [];
  try {
    list = await extractSceneSfx(sel, n, topic);
  } catch (e) {
    log.warn(`SFX extract falló: ${(e as Error).message.slice(0, 60)}`);
  }
  for (const s of list) {
    const p = path.join(dir, `sfx_${s.scene}.mp3`);
    try {
      await generateSfx(s.prompt, p, 2.5);
      s.path = p;
      log.ok(`SFX escena ${s.scene}: ${s.label}`);
    } catch (e) {
      log.warn(`SFX "${s.label}" falló: ${(e as Error).message.slice(0, 60)}`);
    }
  }
  list = list.filter((s) => s.path);
  await writeJson(jsonPath, list);
  return list;
}
