// gen-vallenato-reels.ts — saca 7 formatos de REELS 9:16 de una canción de vallenato.
// Usa karaoke.ass (líneas con tiempos) + song.wav + el banco de loops. gpt-4o elige los mejores
// momentos (verso profundo, coro, la parte que duele, karaoke, pregunta-gancho, carta). CERO Veo.
// Uso: tsx scripts/gen-vallenato-reels.ts <slug>
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { ff, probeDuration } from '../src/lib/ffmpeg';
import { geminiJson } from '../src/ai/gemini';
import { config, ROOT } from '../src/config';
import { log } from '../src/lib/log';

const slug = process.argv[2];
if (!slug) { console.error('uso: tsx scripts/gen-vallenato-reels.ts <slug>'); process.exit(1); }
const dir = path.join(ROOT, 'data', 'vallenato', slug);
const assP = path.join(dir, 'karaoke.ass');
const songP = ['song.wav', 'song.mp3'].map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
if (!fs.existsSync(assP) || !songP) { console.error('faltan karaoke.ass o song.wav (corre gen-vallenato primero)'); process.exit(1); }
const LOOPBANK = path.join(ROOT, 'data', 'bank', 'vallenato-loops');
const TITLEBANK = path.join(ROOT, 'data', 'bank', 'vallenato-titles');
const rd = (f: string) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return ''; } };
const songTitle = rd('title.txt') || slug.replace(/-/g, ' ');
const esc = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "’");
const wrap2 = (s: string) => { const w = (s || '').trim().split(/\s+/).filter(Boolean); if (w.length <= 4) return w.join(' '); const m = Math.ceil(w.length / 2); return w.slice(0, m).join(' ') + '\n' + w.slice(m).join(' '); };
const tsec = (t: string) => { const [h, m, s] = t.split(':'); return (+h) * 3600 + (+m) * 60 + parseFloat(s); };

// 1) Parsear karaoke.ass -> líneas con tiempos
type Line = { i: number; start: number; end: number; text: string };
const lines: Line[] = [];
for (const ln of fs.readFileSync(assP, 'utf8').split(/\r?\n/)) {
  const m = ln.match(/^Dialogue:[^,]*,([^,]+),([^,]+),[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,,(.*)$/);
  if (!m) continue;
  const text = m[3].replace(/\{[^}]*\}/g, '').trim();
  if (text) lines.push({ i: lines.length, start: tsec(m[1]), end: tsec(m[2]), text });
}
if (lines.length < 4) { console.error('karaoke.ass sin líneas suficientes'); process.exit(1); }
log.ok(`${lines.length} líneas con tiempos`);

// 2) gpt-4o elige los mejores momentos
const numbered = lines.map((l) => `${l.i}: ${l.text}`).join('\n');
const SCHEMA = { type: 'object', properties: {
  profundo: { type: 'object', properties: { ini: { type: 'number' }, fin: { type: 'number' } }, required: ['ini', 'fin'] },
  coro: { type: 'object', properties: { ini: { type: 'number' }, fin: { type: 'number' } }, required: ['ini', 'fin'] },
  duele: { type: 'object', properties: { ini: { type: 'number' }, fin: { type: 'number' } }, required: ['ini', 'fin'] },
  karaoke: { type: 'object', properties: { ini: { type: 'number' }, fin: { type: 'number' } }, required: ['ini', 'fin'] },
  pregunta: { type: 'object', properties: { texto: { type: 'string' }, ini: { type: 'number' }, fin: { type: 'number' } }, required: ['texto', 'ini', 'fin'] },
  carta: { type: 'object', properties: { ini: { type: 'number' }, fin: { type: 'number' } }, required: ['ini', 'fin'] },
}, required: ['profundo', 'coro', 'duele', 'karaoke', 'pregunta', 'carta'] };
const SYS = 'Eres editor de Shorts de vallenato. Eliges los MEJORES momentos de la letra para reels virales. Devuelve SOLO JSON con índices de línea (ini/fin) reales de la lista.';
const USER = `Canción: "${songTitle}". LETRA (numerada):\n${numbered}\n\nElige rangos de líneas (4-8 líneas c/u, ini<=fin, índices válidos):\n` +
  `- "profundo": el verso MÁS profundo/impactante.\n- "coro": el coro (lo más pegajoso/repetido).\n- "duele": la parte que MÁS duele.\n` +
  `- "karaoke": el mejor verso para cantar (karaoke).\n- "pregunta": {texto: una pregunta-gancho corta que conecte (¿...?), ini/fin: el verso que la "responde"}.\n` +
  `- "carta": el verso ideal para una dedicatoria 💔.`;
let sel: any;
try { sel = await geminiJson<any>(USER, SCHEMA, SYS); } catch (e) { log.warn('gpt-4o: ' + (e as Error).message.slice(0, 50)); }
const clamp = (r: any, n = 6) => { let ini = Math.max(0, Math.min((r?.ini | 0), lines.length - 1)); let fin = Math.max(ini, Math.min((r?.fin | 0), lines.length - 1)); if (fin - ini > 9) fin = ini + 7; return { ini, fin }; };
const def = (a: number, b: number) => ({ ini: Math.min(a, lines.length - 1), fin: Math.min(b, lines.length - 1) });
sel = sel || {};
const R = {
  profundo: clamp(sel.profundo || def(0, 3)),
  coro: clamp(sel.coro || def(4, 7)),
  duele: clamp(sel.duele || def(8, 11)),
  karaoke: clamp(sel.karaoke || def(4, 7)),
  pregunta: { ...clamp(sel.pregunta || def(0, 3)), texto: (sel.pregunta?.texto || '¿Te ha pasado?') },
  carta: clamp(sel.carta || def(0, 3)),
};

// loop del banco para fondos (según selector si existe, si no el primero)
let bgLoop = path.join(LOOPBANK, '01_lluvia_calle.mp4');
try { const lj = JSON.parse(fs.readFileSync(path.join(dir, 'loops.json'), 'utf8')); const c = (lj.loops || [])[0]; if (c && fs.existsSync(path.join(LOOPBANK, c + '.mp4'))) bgLoop = path.join(LOOPBANK, c + '.mp4'); } catch {}
const titleImg = path.join(TITLEBANK, 'title_a.png');

const FONT = esc(config.fonts.latin);
function caps(rng: { ini: number; fin: number }, aStart: number, yExpr: string, fontsize: number): string {
  // un drawtext por línea, encendido en su ventana de tiempo (desplazado 1.6s por el intro)
  const out: string[] = [];
  for (let k = rng.ini; k <= rng.fin; k++) {
    const l = lines[k];
    const tf = path.join(dir, `_cap_${k}.txt`); fs.writeFileSync(tf, wrap2(l.text), 'utf8');
    const a = (1.6 + (l.start - aStart)).toFixed(2), b = (1.6 + (l.end - aStart) + 0.3).toFixed(2);
    out.push(`drawtext=fontfile='${FONT}':textfile='${esc(tf)}':fontcolor=white:fontsize=${fontsize}:borderw=6:bordercolor=black@0.9:shadowcolor=black@0.5:shadowx=0:shadowy=3:x=(w-text_w)/2:y=${yExpr}:line_spacing=10:enable='between(t,${a},${b})'`);
  }
  return out.join(',');
}
function txtDraw(text: string, yExpr: string, fontsize: number, enable: string, color = 'white'): string {
  const tf = path.join(dir, `_t_${Math.abs(hashCode(text + yExpr))}.txt`); fs.writeFileSync(tf, wrap2(text), 'utf8');
  return `drawtext=fontfile='${FONT}':textfile='${esc(tf)}':fontcolor=${color}:fontsize=${fontsize}:borderw=5:bordercolor=black@0.85:x=(w-text_w)/2:y=${yExpr}:line_spacing=12:enable='${enable}'`;
}
function hashCode(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

async function buildReel(label: string, rng: { ini: number; fin: number }, opts: { bg: 'black' | 'loop'; hook?: string; outro?: string; karaoke?: boolean }): Promise<void> {
  const aStart = lines[rng.ini].start, aEnd = lines[rng.fin].end;
  const verseDur = Math.max(2, aEnd - aStart);
  const outroDur = opts.outro ? 1.5 : 0;
  const total = 1.6 + verseDur + outroDur;
  const out = path.join(dir, `reel_${label}.mp4`);
  const draws: string[] = [];
  if (opts.hook) draws.push(txtDraw(opts.hook, '(h-text_h)/2', 70, 'lt(t,1.6)'));
  draws.push(caps(rng, aStart, opts.karaoke ? 'h*0.42' : 'h*0.66', opts.karaoke ? 76 : 58));
  if (opts.outro) draws.push(txtDraw(opts.outro, 'h*0.80', 56, `gt(t,${(total - outroDur).toFixed(2)})`, '0xFFD700'));
  const chain = draws.filter(Boolean).join(',');
  const inArgs = opts.bg === 'black'
    ? ['-f', 'lavfi', '-i', `color=c=black:s=1080x1920:r=30`]
    : ['-stream_loop', '-1', '-i', bgLoop];
  const bgPre = opts.bg === 'black' ? '' : 'scale=-2:1920,crop=1080:1920,setsar=1,';
  const vf = `${bgPre}${chain},format=yuv420p`;
  await ff(['-y', ...inArgs, '-i', songP!,
    '-filter_complex', `[0:v]${vf}[v];[1:a]atrim=${aStart.toFixed(2)}:${aEnd.toFixed(2)},asetpts=PTS-STARTPTS,adelay=1600|1600,apad[a]`,
    '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', out]);
  log.ok(`  🎬 reel_${label}.mp4 (${total.toFixed(0)}s)`);
}

log.step(`Reels de "${songTitle}"`);
// 1 Frase profunda (negro)
await buildReel('1_profundo', R.profundo, { bg: 'black', hook: `J.J no se equivocó cuando dijo…` });
// 2 Coro (loop + karaoke)
await buildReel('2_coro', R.coro, { bg: 'loop', karaoke: true });
// 3 La parte que duele (negro)
await buildReel('3_duele', R.duele, { bg: 'black', hook: `la parte que duele 😢` });
// 4 Karaoke vertical (loop, letra grande)
await buildReel('4_karaoke', R.karaoke, { bg: 'loop', karaoke: true });
// 5 Pregunta-gancho (negro)
await buildReel('5_pregunta', R.pregunta, { bg: 'black', hook: R.pregunta.texto });
// 6 Carta / dedicatoria (negro)
await buildReel('6_carta', R.carta, { bg: 'black', hook: `Si esta canción te llegó, era para alguien… 💔`, outro: 'dedícala 👇' });

// 7 Intro título + golpe del coro
{
  const introClip = path.join(dir, '_rintro.mp4');
  const tf = path.join(dir, '_rtitle.txt'); fs.writeFileSync(tf, songTitle.toUpperCase(), 'utf8');
  const dT = `drawtext=fontfile='${FONT}':textfile='${esc(tf)}':fontcolor=white:fontsize=72:borderw=3:bordercolor=black@0.7:x=(w-text_w)/2:y=h*0.34:line_spacing=12`;
  const dJ = `drawtext=fontfile='${FONT}':text='J.J':fontcolor=0xFFD700:fontsize=54:borderw=2:bordercolor=black@0.7:x=(w-text_w)/2:y=h*0.58`;
  await ff(['-y', '-loop', '1', '-i', titleImg, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '2.5', '-vf', `scale=-2:1920,crop=1080:1920,setsar=1,${dT},${dJ},format=yuv420p`, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', introClip]);
  await buildReel('7_introcoro', R.coro, { bg: 'loop', karaoke: true });
  // prepend intro (concat con re-encode para igualar)
  const body = path.join(dir, 'reel_7_introcoro.mp4');
  const lst = path.join(dir, '_r7.txt'); fs.writeFileSync(lst, [introClip, body].map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const merged = path.join(dir, 'reel_7_intro_coro.mp4');
  await ff(['-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', merged]);
  try { fs.unlinkSync(body); fs.unlinkSync(introClip); fs.unlinkSync(lst); fs.unlinkSync(tf); } catch {}
}

// limpiar temporales de captions
for (const f of fs.readdirSync(dir)) if (/^_cap_|^_t_/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
const reels = fs.readdirSync(dir).filter((f) => /^reel_.*\.mp4$/.test(f));
console.log(`\n✅ ${reels.length} reels: ${reels.join(', ')}`);
