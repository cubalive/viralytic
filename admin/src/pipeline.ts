import path from 'node:path';
import { ROOT, SONGS_DIR, OUTPUT_DIR } from './config';
import {
  loadManifest, saveManifest, readJson, writeJson, ensureDir, exists,
} from './lib/files';
import { lyricsToScenes } from './stages/script';
import { sceneKeyframes } from './stages/keyframes';
import { sceneClip } from './stages/video';
import { getLipSync } from './stages/lipsync';
import { renderMaster } from './stages/render';
import { reframeToReel } from './stages/reframe';
import { log } from './lib/log';
import type { Song } from './types';

/** Corre el pipeline completo para una canción. */
export async function runSong(songId: string) {
  const songDir = path.join(SONGS_DIR, songId);
  const song = await readJson<Song | null>(path.join(songDir, 'song.json'), null);
  if (!song) throw new Error(`No existe ${path.join(songDir, 'song.json')}`);

  // resolver ruta de audio (relativa a la raíz del proyecto)
  if (song.audioPath && !path.isAbsolute(song.audioPath)) {
    song.audioPath = path.resolve(ROOT, song.audioPath);
  }
  if (!exists(song.audioPath)) {
    throw new Error(`Falta el audio: ${song.audioPath}\nPon el mp3/wav de la canción ahí.`);
  }

  const outDir = path.join(OUTPUT_DIR, songId);
  await ensureDir(outDir);
  const statePath = path.join(outDir, 'song.state.json');

  const manifest = await loadManifest();
  const refs = song.characters.flatMap((cid) => manifest.characters[cid]?.canonImages ?? []);
  if (!refs.length) {
    log.warn('Aún no hay canon (faltan fotos): los keyframes usarán generación libre por ahora.');
  } else {
    log.info(`Canon cargado: ${refs.length} imágenes de referencia`);
  }

  // 1) Guion
  log.step('1/6 · Guion (letra → escenas)');
  const charsDesc = song.characters.join(', ');
  song.scenes = await lyricsToScenes(song, charsDesc);
  await writeJson(statePath, song);
  log.ok(`${song.scenes.length} escenas (~${song.scenes.length * 8}s de video)`);

  // 2) Keyframes
  log.step('2/6 · Keyframes (Imagen)');
  const kfDir = path.join(outDir, 'keyframes');
  for (const sc of song.scenes) {
    await sceneKeyframes(sc, refs, kfDir);
    log.ok(`Keyframes escena ${sc.index + 1}/${song.scenes.length}`);
  }
  await writeJson(statePath, song);

  // 3) Clips de video (Veo)
  log.step('3/6 · Video (Veo) — esto tarda, cada clip ~1-2 min');
  const clipDir = path.join(outDir, 'clips');
  for (const sc of song.scenes) {
    await sceneClip(sc, clipDir);
    log.ok(`Clip escena ${sc.index + 1}/${song.scenes.length}`);
    await writeJson(statePath, song);
  }

  // 4) Lip sync
  log.step('4/6 · Lip sync');
  const ls = getLipSync();
  log.info(`Proveedor: ${ls.name}`);
  const syncDir = path.join(outDir, 'synced');
  await ensureDir(syncDir);
  for (const sc of song.scenes) {
    const n = String(sc.index + 1).padStart(2, '0');
    const out = path.join(syncDir, `synced_${n}.mp4`);
    sc.syncedClip = await ls.sync(sc.clip!, song.audioPath, out);
  }
  await writeJson(statePath, song);

  // 5) Master 16:9
  log.step('5/6 · Render master 16:9');
  const master = path.join(outDir, 'master_16x9.mp4');
  await renderMaster(song, song.scenes.map((s) => s.syncedClip!), master);
  log.ok(master);

  // 6) Reframe 9:16
  log.step('6/6 · Reframe 9:16 (Reels / YT Kids)');
  const reel = path.join(outDir, 'reel_9x16.mp4');
  await reframeToReel(master, reel);
  log.ok(reel);

  manifest.songs[songId] = {
    status: 'done',
    master,
    reel,
    scenes: song.scenes.length,
    updatedAt: new Date().toISOString(),
  };
  await saveManifest(manifest);

  log.step('✅ LISTO');
  log.ok(`Master 16:9 → ${master}`);
  log.ok(`Reel  9:16 → ${reel}`);
}
