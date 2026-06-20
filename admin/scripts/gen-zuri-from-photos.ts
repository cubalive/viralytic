// gen-zuri-from-photos.ts — anima las FOTOS NUEVAS de Zuri (E:\...\@Zury\Imagenes_video_general)
// con Veo (single-frame) → banco data/bank/zuri/clips. Movimiento con efecto de "camino más largo"
// (cámara que avanza + profundidad) y variedad por foto. Zuri sale tal cual de las fotos (sin guitarra).
// Uso: tsx scripts/gen-zuri-from-photos.ts [N=99] [offset=0]
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile);

const SRC = 'E:/0005. Passkal/Canales de Youtube/@Zury/Imagenes_video_general';
const CLIPS = path.join(ROOT, 'data', 'bank', 'zuri', 'clips'); fs.mkdirSync(CLIPS, { recursive: true });
const N = Number(process.argv[2] || 99);
const OFF = Number(process.argv[3] || 0);
const KEEP = 'keep the characters identical (Zuri the caramel meerkat with two pink roses and yellow sweater with blue heart and gold star, and her two friends), no morphing, no new objects, no guitar, no instruments';
const FOREST = 'magical glowing forest at sunset, lanterns, fireflies, floating neon music notes';

// movimiento por tipo de toma (clave = prefijo del nombre del archivo)
const MOTION: Record<string, string> = {
  tro_espalda: `walking forward deeper into the forest, seen from behind, the path extends ahead toward the sunset, camera follows from behind, parallax depth, fireflies drifting`,
  trio_mirando: `slowly walking forward toward the opening sunset valley, the vista widens, gentle cinematic push-in, fireflies drifting`,
  trio_aerea: `slow aerial drift forward over the trio toward the valley, cinematic depth`,
  trio_senalando: `pointing at the forest, gentle camera push-in, leaves swaying, fireflies`,
  trio_mirano: `slowly walking forward toward the sunset, gentle push-in, fireflies`,
  cam: `smooth cinematic camera travel forward with parallax, fireflies, leaves swaying`,
  esc: `lively performance motion on the natural stage, lights pulsing, music notes floating`,
  lift: `energetic playful motion, slight bounce, music notes floating, sparkles`,
  selfie: `playful subtle motion, warm light, fireflies, gentle bounce`,
  zuri_closeup: `gentle close motion, hands glowing softly, fireflies (keep figure small, avoid huge frontal face)`,
};
const motionFor = (name: string) => {
  const key = Object.keys(MOTION).find((k) => name.toLowerCase().startsWith(k));
  return key ? MOTION[key] : `gentle cinematic forward motion with parallax and depth, fireflies drifting, leaves swaying`;
};

// seleccionar imágenes (excluir audio, intro/outro y casi-duplicados)
let imgs = fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .filter((f) => !/^intro_and_autro|^suno_/i.test(f))
  .filter((f) => f !== 'trio_mirano_el_bosque.png'); // typo duplicado de trio_mirando
imgs.sort();
imgs = imgs.slice(OFF, OFF + N);
log.ok(`${imgs.length} fotos a animar`);

let made = 0;
for (let i = 0; i < imgs.length; i++) {
  const name = imgs[i].replace(/\.[^.]+$/, '');
  const id = `foto_${name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
  const out = path.join(CLIPS, id + '.mp4');
  if (fs.existsSync(out) && fs.statSync(out).size > 50000) { log.ok(`(ya existe) ${id}`); made++; continue; }
  const prompt = `${motionFor(name)}. ${FOREST}. ${KEEP}.`;
  let ok = false;
  for (let a = 1; a <= 3 && !ok; a++) {
    try {
      log.step(`${i + 1}/${imgs.length} ${name}${a > 1 ? ` (intento ${a})` : ''}…`);
      await exec('python', ['py/veo_loop.py', path.join(SRC, imgs[i]), '-', out, prompt], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 1 << 24 });
      if (fs.existsSync(out) && fs.statSync(out).size > 50000) { ok = true; made++; log.ok(`✅ ${id}.mp4`); }
      else throw new Error('clip vacío');
    } catch (e) { log.warn(`${name} intento ${a}: ${(e as Error).message.slice(0, 90)}`); await new Promise((r) => setTimeout(r, 4000)); }
  }
  if (!ok) log.err(`${name}: falló tras 3 intentos`);
}
console.log(`\n✅ Zuri desde fotos: ${made}/${imgs.length} clips en el banco`);
