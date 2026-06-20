// gen-zuri-from-photos.ts — anima las FOTOS NUEVAS de Zuri (E:\...\@Zury\Imagenes_video_general).
// SECUENCIAS numeradas (cam_1..4, lift_1..4, esc_1..3, selfie_1..2, 1-2-3) → se ENCADENAN con Veo
// first/last (foto1→foto2→foto3…) y se concatenan en UNA escena continua (efecto de camino/journey).
// Fotos SUELTAS (trio_*, tro_espalda, zuri_closeup, IMG_*) → single-frame con movimiento de avance.
// Zuri sale tal cual de las fotos (sin guitarra). CERO generación de imagen — solo Veo sobre tus fotos.
// Uso: tsx scripts/gen-zuri-from-photos.ts [grupo|all] (ej: cam, lift, all)
import path from 'node:path';
import fs from 'node:fs';
import { ff } from '../src/lib/ffmpeg';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile);

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const pos = args.filter((a) => !a.startsWith('--'));
const srcFlag = flags.find((a) => a.startsWith('--src='));
const SRC = srcFlag ? srcFlag.slice(6) : 'E:/0005. Passkal/Canales de Youtube/@Zury/Imagenes_video_general';
const FORCE_SINGLES = flags.includes('--singles');
const CLIPS = path.join(ROOT, 'data', 'bank', 'zuri', 'clips'); fs.mkdirSync(CLIPS, { recursive: true });
const ONLY = (pos[0] || 'all').toLowerCase();
const KEEP = 'keep the characters identical (Zuri the caramel meerkat with two pink roses and a yellow sweater with a blue heart and gold star, and her two friends), no morphing, no new objects, no guitar, no instruments';
const FOREST = 'magical glowing forest at sunset, lanterns, fireflies, floating neon music notes';
const FWD = `smooth cinematic forward motion, camera advancing with depth and parallax, fireflies drifting, leaves swaying`;
const CHAIN = `smooth continuous motion flowing into the next moment, camera travels forward, the path extends`;

const all = fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .filter((f) => !/^intro_and_autro|^suno_/i.test(f) && f !== 'trio_mirano_el_bosque.png');

// agrupar secuencias por prefijo_numero
const seqs: Record<string, { n: number; file: string }[]> = {};
const singles: string[] = [];
const SEQ_PREFIXES = ['cam', 'lift', 'esc', 'selfie', '']; // '' = 1.png,2.png,3.png
for (const f of all) {
  if (FORCE_SINGLES) { singles.push(f); continue; }
  const base = f.replace(/\.[^.]+$/, '');
  const m = base.match(/^(.*?)_?(\d+)$/);
  const pre = m ? m[1] : '__none';
  if (m && SEQ_PREFIXES.includes(pre)) (seqs[pre] = seqs[pre] || []).push({ n: +m[2], file: f });
  else singles.push(f);
}
for (const k of Object.keys(seqs)) seqs[k].sort((a, b) => a.n - b.n);

async function veo(f1: string, f2: string, out: string, prompt: string): Promise<boolean> {
  for (let a = 1; a <= 3; a++) {
    try {
      await exec('python', ['py/veo_loop.py', f1, f2, out, prompt], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 1 << 24 });
      if (fs.existsSync(out) && fs.statSync(out).size > 50000) return true;
    } catch (e) { log.warn(`veo intento ${a}: ${(e as Error).message.slice(0, 80)}`); await new Promise((r) => setTimeout(r, 4000)); }
  }
  return false;
}

let made = 0;
// 1) SECUENCIAS → encadenar y concatenar (continuidad)
for (const [pre, items] of Object.entries(seqs)) {
  if (items.length < 2) { singles.push(items[0].file); continue; }
  const name = pre || 'seq';
  if (ONLY !== 'all' && ONLY !== name) continue;
  const id = `seq_${name}`;
  const finalOut = path.join(CLIPS, id + '.mp4');
  if (fs.existsSync(finalOut) && fs.statSync(finalOut).size > 50000) { log.ok(`(ya existe) ${id}`); made++; continue; }
  log.step(`Secuencia ${name}: ${items.map((x) => x.n).join('→')} (${items.length - 1} tramos)`);
  const parts: string[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const seg = path.join(CLIPS, `_${id}_${i}.mp4`);
    const ok = await veo(path.join(SRC, items[i].file), path.join(SRC, items[i + 1].file), seg, `${CHAIN}. ${FOREST}. ${KEEP}.`);
    if (ok) parts.push(seg); else log.warn(`tramo ${i} de ${name} falló`);
  }
  if (parts.length) {
    const lst = path.join(CLIPS, `_${id}.txt`); fs.writeFileSync(lst, parts.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    await ff(['-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', finalOut]);
    for (const p of parts) try { fs.unlinkSync(p); } catch {}
    try { fs.unlinkSync(lst); } catch {}
    made++; log.ok(`✅ ${id}.mp4 (continua, ${parts.length * 8}s)`);
  }
}
// 2) SUELTAS → single-frame con avance
if (ONLY === 'all' || ONLY === 'singles') {
  for (const f of singles) {
    const id = `foto_${f.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
    const out = path.join(CLIPS, id + '.mp4');
    if (fs.existsSync(out) && fs.statSync(out).size > 50000) { log.ok(`(ya existe) ${id}`); made++; continue; }
    log.step(`Suelta ${f}…`);
    const ok = await veo(path.join(SRC, f), '-', out, `${FWD}. ${FOREST}. ${KEEP}.`);
    if (ok) { made++; log.ok(`✅ ${id}.mp4`); } else log.err(`${f}: falló`);
  }
}
console.log(`\n✅ Zuri banco: ${made} escenas (secuencias continuas + sueltas)`);
