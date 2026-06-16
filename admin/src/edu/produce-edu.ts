import path from 'node:path';
import fsp from 'node:fs/promises';
import { geminiImage } from '../ai/gemini-image';
import { tts, buildCaptionsSrt } from '../ai/elevenlabs';
import { getMoodTrack } from '../audio/soundbank';
import { mixVoiceMusic } from '../audio/mix';
import { makeBeatClip } from './textcard';
import { concatClips } from '../stages/render';
import { ff, probeDuration } from '../lib/ffmpeg';
import { ensureDir, exists, loadManifest } from '../lib/files';
import { OUTPUT_DIR, config } from '../config';
import { log } from '../lib/log';
import type { SeleccionEdu } from '../formats/types';

const STYLE =
  'Bright friendly children educational cartoon, vertical 9:16 full-frame composition, clean, ' +
  'featuring the same teal-and-yellow robot host Sabi, consistent with the reference.';

export interface EduProduceOpts {
  topic: string;
  lang?: string;   // 'es' | 'en' | 'it' | 'zh'
  mood?: string;   // mood de la librería de música
}

/**
 * Convierte un brief educativo (un formato) en un reel vertical real.
 * Versión económica: imágenes fijas + Ken Burns (sin Veo todavía).
 */
export async function produceEduReel(sel: SeleccionEdu, opts: EduProduceOpts): Promise<string> {
  const lang = opts.lang ?? 'es';
  const mood = opts.mood ?? 'esperanzador';
  const brief = sel.brief;
  const beats = brief.guion_por_beat;

  const slug = opts.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const dir = path.join(OUTPUT_DIR, 'reels', 'edu', `${slug}__${sel.slug}`);
  await ensureDir(dir);

  const manifest = await loadManifest();
  const refs = manifest.characters['sabi']?.canonImages ?? [];

  log.step(`Reel educativo: "${opts.topic}" · formato ${sel.slug} · ${lang}`);
  if (!refs.length) log.warn('Sin canon de Sabi en el manifest — las imágenes saldrán sin referencia.');

  // 1) Imágenes por beat (Sabi consistente vía canon). Pocas referencias = menos cuota.
  log.step(`1/4 Imágenes (${beats.length} beats)`);
  const refs3 = refs.slice(0, 3);
  const fallback = refs.find((r) => r.includes('neutral')) ?? refs[0];
  const images: string[] = [];
  for (let i = 0; i < beats.length; i++) {
    const out = path.join(dir, `beat_${String(i + 1).padStart(2, '0')}.png`);
    if (exists(out)) { images.push(out); log.info(`Imagen ${i + 1} (ya existe)`); continue; }
    try {
      await geminiImage(`${beats[i].accion}. ${STYLE}`, out, {
        aspectRatio: '9:16',
        refImagePaths: refs3.length ? refs3 : undefined,
      });
      log.ok(`Imagen ${i + 1}/${beats.length}`);
    } catch (e) {
      if (!fallback) throw e;
      await fsp.copyFile(fallback, out);
      log.warn(`Imagen ${i + 1} falló (${(e as Error).message.slice(0, 50)}) — respaldo con pose de Sabi`);
    }
    images.push(out);
    await new Promise((r) => setTimeout(r, 2500)); // espacia para no topar cuota
  }

  // 2) Voz (ElevenLabs)
  log.step('2/4 Voz (ElevenLabs)');
  const voice = await tts(brief.generadores.voz, path.join(dir, 'voz.mp3'));
  // captions disponibles (no se queman; el canal no los usa por defecto)
  await buildCaptionsSrt(`${voice}.timestamps.json`, path.join(dir, 'captions.srt')).catch(() => {});
  const vdur = await probeDuration(voice);
  const seg = Math.max(2.2, vdur / beats.length);
  const videoLen = seg * beats.length;
  log.ok(`Voz ${vdur.toFixed(1)}s · ${seg.toFixed(1)}s/beat · reel ${videoLen.toFixed(1)}s`);

  // 3) Clip por beat (imagen + zoom + texto) y unir
  log.step('3/4 Montaje de clips');
  const clips: string[] = [];
  for (let i = 0; i < beats.length; i++) {
    const out = path.join(dir, `clip_${String(i + 1).padStart(2, '0')}.mp4`);
    await makeBeatClip(images[i], beats[i].texto_en_pantalla, lang, seg, out);
    clips.push(out);
  }
  const silent = await concatClips(clips, path.join(dir, 'video_silent.mp4'));

  // 4) Música por mood + mezcla + combinar
  log.step(`4/4 Música (mood: ${mood}) + mezcla`);
  const music = await getMoodTrack(mood, path.join(dir, 'music.mp3'));
  const audio = await mixVoiceMusic(voice, music, path.join(dir, 'audio.mp3'), { targetDuration: videoLen });

  const reel = path.join(dir, 'reel_9x16.mp4');
  await ff(['-i', silent, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', reel]);

  log.step('✅ Reel listo');
  log.ok(reel);
  return reel;
}
