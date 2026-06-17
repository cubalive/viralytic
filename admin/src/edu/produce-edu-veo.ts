import path from 'node:path';
import fsp from 'node:fs/promises';
import { geminiImage } from '../ai/gemini-image';
import { generateVideo } from '../ai/veo';
import { tts, buildCaptionsSrt } from '../ai/elevenlabs';
import { getMoodTrack } from '../audio/soundbank';
import { mixAll } from '../audio/mix';
import { concatClips } from '../stages/render';
import { burnCaptionsAndAudio } from './captions';
import { translateVoz } from './translate';
import { buildTopicSfx, type SceneSfx } from './sfx';
import { ff, probeDuration } from '../lib/ffmpeg';
import { ensureDir, exists, readJson, loadManifest } from '../lib/files';
import { OUTPUT_DIR } from '../config';
import { log } from '../lib/log';
import type { SeleccionEdu } from '../formats/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LANG_NAME: Record<string, string> = { es: 'Spanish', en: 'English', it: 'Italian', zh: 'Mandarin Chinese' };

// Aspecto del render. EDU_ASPECT=16:9 → video horizontal nativo (SabiKids para TV/tablet).
// Por defecto 9:16 (no rompe el backlog/Shorts existente). El 16:9 va a carpeta aparte.
const ASPECT: '9:16' | '16:9' = process.env.EDU_ASPECT === '16:9' ? '16:9' : '9:16';
const SIXTEEN9 = ASPECT === '16:9';
const STYLE =
  `Children cartoon, ${SIXTEEN9 ? 'horizontal 16:9 widescreen, full-frame composition' : 'vertical 9:16, full-frame'}, featuring the same teal-and-yellow robot Sabi ` +
  'consistent with the reference, clean colorful background. ' +
  'IMPORTANT: absolutely NO text, no letters, no words, no captions, no signs, no numbers in the image.';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export function reelDir(topic: string, formatSlug: string) {
  return path.join(OUTPUT_DIR, 'reels', SIXTEEN9 ? 'edu-veo-16x9' : 'edu-veo', `${slugify(topic)}__${formatSlug}`);
}

/** Divide la narración en N partes (una por escena) para que Veo mueva la boca diciéndola. */
function splitNarration(text: string, n: number): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const src = sentences.length >= n ? sentences : text.trim().split(/\s+/);
  const per = Math.ceil(src.length / n);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(src.slice(i * per, (i + 1) * per).join(' ').trim());
  return parts;
}

async function extractLastFrame(video: string, out: string): Promise<string> {
  await ff(['-sseof', '-0.12', '-i', video, '-frames:v', '1', '-q:v', '2', out]);
  return out;
}

/**
 * Construye el VIDEO con movimiento (keyframe + escenas Veo encadenadas, Sabi hablando).
 * Es independiente del idioma (la boca dice el guion base en español) y se REUSA entre idiomas.
 */
export async function buildMotion(sel: SeleccionEdu, opts: { topic: string; maxScenes?: number }): Promise<{ motion: string; dir: string }> {
  const beats = sel.brief.guion_por_beat.slice(0, opts.maxScenes ?? 3);
  const N = beats.length;
  const dir = reelDir(opts.topic, sel.slug);
  await ensureDir(dir);
  const motion = path.join(dir, 'motion.mp4');
  if (exists(motion)) { log.info('motion ya existe (reuso)'); return { motion, dir }; }

  const manifest = await loadManifest();
  const refs = manifest.characters['sabi']?.canonImages ?? [];
  const refs3 = refs.slice(0, 3);
  const fallback = refs.find((r) => r.includes('neutral')) ?? refs[0];

  log.step(`Motion: "${opts.topic}" · ${sel.slug} · ${N} escenas`);

  // 1) Keyframe inicial limpio
  const startKey = path.join(dir, 'frame_0.png');
  if (!exists(startKey)) {
    try {
      await geminiImage(`${beats[0].accion}. ${STYLE}`, startKey, { aspectRatio: ASPECT, refImagePaths: refs3.length ? refs3 : undefined });
    } catch (e) {
      if (!fallback) throw e;
      await fsp.copyFile(fallback, startKey);
      log.warn(`keyframe respaldo (${(e as Error).message.slice(0, 40)})`);
    }
  }
  // gpt-image devuelve 3:2 (1536x1024) → Veo lo mete en 16:9 con barras laterales.
  // Recorta el keyframe a 16:9 EXACTO (1920x1080) para que Veo llene la pantalla.
  if (SIXTEEN9 && exists(startKey)) {
    const fixed = path.join(dir, '_kf16x9.png');
    await ff(['-y', '-i', startKey, '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080', fixed]);
    await fsp.rename(fixed, startKey);
  }

  // 2) Escenas Veo encadenadas, Sabi HABLANDO su parte (boca en movimiento)
  const dialog = splitNarration(sel.brief.generadores.voz, N);
  let startFrame = startKey;
  const scaled: string[] = [];
  for (let i = 0; i < N; i++) {
    const clip = path.join(dir, `scene_${i + 1}.mp4`);
    if (!exists(clip)) {
      const linea = dialog[i] || beats[i].accion;
      await generateVideo(
        `${beats[i].accion}. Sabi looks friendly and speaks, its mouth clearly opening and moving ` +
          `as it cheerfully talks saying: "${linea}". ${STYLE}`,
        clip,
        { firstFrame: startFrame, aspectRatio: ASPECT, generateAudio: true },
      );
      log.ok(`escena ${i + 1}/${N}`);
    }
    const s = path.join(dir, `scaled_${i + 1}.mp4`);
    await ff(['-i', clip, '-vf', `scale=${SIXTEEN9 ? '1920:1080' : '1080:1920'}:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', s]);
    scaled.push(s);
    if (i < N - 1) {
      const lf = path.join(dir, `frame_${i + 1}.png`);
      if (!exists(lf)) await extractLastFrame(clip, lf);
      startFrame = lf;
      await sleep(1500);
    }
  }
  await concatClips(scaled, motion);
  return { motion, dir };
}

/** Renderiza el reel final para un idioma (voz traducida + captions + música) reusando el motion. */
export async function renderLang(motion: string, sel: SeleccionEdu, dir: string, lang: string, mood: string, opts: { vozEs?: string; suffix?: string } = {}): Promise<string> {
  const suf = opts.suffix ?? '';
  const reel = path.join(dir, `reel_${lang}${suf}.mp4`);
  if (exists(reel)) { log.info(`reel ${lang}${suf} ya existe`); return reel; }

  log.step(`Render ${lang.toUpperCase()}${suf}`);
  const N = Math.min(3, sel.brief.guion_por_beat.length);
  const voicePath = path.join(dir, `voz_${lang}${suf}.mp3`);
  let voice = voicePath;
  if (!(exists(voicePath) && exists(`${voicePath}.timestamps.json`))) {
    const baseVoz = opts.vozEs ?? sel.brief.generadores.voz;
    const voz = lang === 'es' ? baseVoz : await translateVoz(baseVoz, lang);
    voice = await tts(voz, voicePath, { lang });
  } else {
    log.info(`voz ${lang}${suf} reusada`);
  }
  const srt = await buildCaptionsSrt(`${voice}.timestamps.json`, path.join(dir, `captions_${lang}${suf}.srt`));
  const vlen = await probeDuration(motion);

  const music = path.join(dir, 'music.mp3');
  if (!exists(music)) await getMoodTrack(mood, music);

  // Efectos de sonido por escena (animal, vehículo…) ubicados en su segundo.
  const sfxList = await readJson<SceneSfx[]>(path.join(dir, 'sfx.json'), []);
  const sceneDur = vlen / N;
  const items = sfxList
    .filter((s) => s.path && exists(s.path))
    .map((s) => ({ path: s.path!, atSec: s.scene * sceneDur + 1.0, gain: 0.3 }));

  const audio = await mixAll(voice, music, items, path.join(dir, `audio_${lang}${suf}.mp3`), { targetDuration: vlen });
  await burnCaptionsAndAudio(motion, audio, srt, lang, reel);
  log.ok(`reel ${lang}${suf} → ${reel}`);
  return reel;
}

export interface VeoProduceOpts { topic: string; lang?: string; mood?: string; maxScenes?: number }

/** Un reel en un idioma. */
export async function produceEduReelVeo(sel: SeleccionEdu, opts: VeoProduceOpts): Promise<string> {
  const { motion, dir } = await buildMotion(sel, { topic: opts.topic, maxScenes: opts.maxScenes });
  await buildTopicSfx(sel, dir, Math.min(3, sel.brief.guion_por_beat.length), opts.topic);
  return renderLang(motion, sel, dir, opts.lang ?? 'es', opts.mood ?? 'esperanzador');
}

/** El mismo tema en varios idiomas (reusa el motion una sola vez). */
export async function produceAllLangs(sel: SeleccionEdu, opts: { topic: string; mood?: string; langs?: string[] }): Promise<Record<string, string>> {
  const { motion, dir } = await buildMotion(sel, { topic: opts.topic });
  await buildTopicSfx(sel, dir, Math.min(3, sel.brief.guion_por_beat.length), opts.topic);
  const langs = opts.langs ?? ['es', 'en', 'it', 'zh'];
  const out: Record<string, string> = {};
  for (const l of langs) out[l] = await renderLang(motion, sel, dir, l, opts.mood ?? 'esperanzador');
  return out;
}
