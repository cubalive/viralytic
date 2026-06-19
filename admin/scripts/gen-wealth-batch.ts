// Motor de WORLD WEALTH MINDSET (faceless): MEZCLA fotos animadas con zoom + b-roll del banco (≤8s),
// frase de mentalidad de riqueza sincronizada al bajo, 9:16. Reusa el banco de Veo.
// Uso: tsx scripts/gen-wealth-batch.ts [N] [lang]   (lang: en|es, default en)
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { detectBeats } from '../src/beat/detect';
import { getMoodTrack } from '../src/audio/soundbank';
import { geminiImage } from '../src/ai/gemini-image';
import { geminiJson } from '../src/ai/gemini';
import { ff, probeDuration } from '../src/lib/ffmpeg';
import { uploadPublic } from '../src/lib/storage';
import { ensureDir } from '../src/lib/files';
import { pickClips, loadBank } from '../src/bank/videobank';
import { freshTopics } from '../src/faceless/topics';
import { narrate } from '../src/faceless/voice';
import { loadStrategy } from '../src/faceless/strategy';
import { config, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

// Voz en off (ElevenLabs). On por defecto en este canal. Voz convincente, grave,
// multilingüe (Adam). Override: FACELESS_VOICE=off | FACELESS_VOICE_ID=<id>.
const VOICE = (process.env.FACELESS_VOICE ?? 'on').toLowerCase() !== 'off';
const VOICE_ID = process.env.FACELESS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB';
const VOICE_M = process.env.FACELESS_VOICE_M ?? 'pNInz6obpgDQGcFmaJgB'; // hombre fuerte/seductor (Adam)
const VOICE_F = process.env.FACELESS_VOICE_F ?? 'EXAVITQu4vr4xnSDxMaL'; // mujer calida/fuerte (Sarah)

const THEME = 'wealth';
const N_TARGET = Number(process.argv[2] || 20);
const LANG = (process.argv[3] || 'en').toLowerCase();
const baseDir = path.join(OUTPUT_DIR, LANG === 'en' ? 'wealth' : `wealth-${LANG}`);
const storagePrefix = LANG === 'en' ? 'kids-studio/wealth' : `kids-studio/wealth-${LANG}`;
const poolDir = path.join(OUTPUT_DIR, 'wealth', '_pool');
await ensureDir(poolDir);
const esc = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:');
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);

const TOPICS_BY_LANG: Record<string, string[]> = {
  en: [
    'The mindset of the wealthy', 'Why the rich think differently', 'Money is a game of patience', 'Your habits decide your wealth',
    'The real price of financial freedom', 'Stop trading time for money', 'Why most people stay broke', 'Discipline builds fortunes',
    'The silent power of saving', 'Invest in yourself first', 'The cost of waiting to start', 'Wealth is built in silence',
    'Spend less than you earn', 'Make your money work for you', 'The long game always wins', 'Comfort is the enemy of wealth',
    'Build multiple streams of income', 'The power of delayed gratification', 'The wealthy protect their time', 'Think in decades, not days',
  ],
  es: [
    'La mentalidad de los ricos', 'Por qué los ricos piensan distinto', 'El dinero es un juego de paciencia', 'Tus hábitos deciden tu riqueza',
    'El precio real de la libertad financiera', 'Deja de cambiar tiempo por dinero', 'Por qué la mayoría sigue pobre', 'La disciplina construye fortunas',
    'El poder silencioso de ahorrar', 'Invierte en ti primero', 'El costo de esperar para empezar', 'La riqueza se construye en silencio',
    'Gasta menos de lo que ganas', 'Haz que tu dinero trabaje para ti', 'El juego largo siempre gana', 'La comodidad es enemiga de la riqueza',
    'Construye múltiples fuentes de ingreso', 'El poder de postergar la recompensa', 'Los ricos protegen su tiempo', 'Piensa en décadas, no en días',
  ],
};
const SEED = TOPICS_BY_LANG[LANG] || TOPICS_BY_LANG.en;
const NICHE = {
  system: LANG === 'es'
    ? 'Generas TEMAS frescos y distintos para un canal de Shorts de MENTALIDAD DE RIQUEZA / psicología del dinero. Cada tema = un título corto en español de una verdad incómoda del dinero o un principio de riqueza. Devuelve SOLO JSON {topics:[...]}.'
    : 'You generate fresh, distinct TOPICS for a WEALTH MINDSET / money-psychology Shorts channel. Each topic = a short English title of an uncomfortable money truth or a wealth principle. Return ONLY JSON {topics:[...]}.',
  ask: LANG === 'es' ? 'Canal de mentalidad de riqueza en español.' : 'Wealth mindset / money psychology channel in English.',
};

const SYS: Record<string, string> = {
  en:
    'You are a world-class SHORT-FORM RETENTION engineer for a WEALTH MINDSET channel. You write for the BRAIN: stop the scroll in the first 0.5s and hold attention to the very last frame. RULES:\n' +
    '- Fragment 1 = a PATTERN-INTERRUPT HOOK: a bold almost-forbidden money truth, a sharp "You..." callout, or a question that opens an instant curiosity gap.\n' +
    '- Every next fragment ESCALATES tension and keeps an OPEN LOOP — never resolve early.\n' +
    '- Fragments are ULTRA short (1-3 words) so the cuts hit hard on every beat.\n' +
    '- Near the end deliver the PAYOFF: a reframe that gives a dopamine "aha".\n' +
    '- The LAST fragment must trigger a REWATCH or a COMMENT (a punchy loop-back or an identity line like "Now you know.").\n' +
    'Confident, sharp, aspirational (NO scams, no get-rich-quick lies, no specific financial advice). Return ONLY JSON.',
  es:
    'Eres un ingeniero de RETENCIÓN de talla mundial para un canal de MENTALIDAD DE RIQUEZA. Escribes para el CEREBRO: parar el scroll en los primeros 0.5s y sostener la atención hasta el último frame. REGLAS:\n' +
    '- Fragmento 1 = GANCHO PATTERN-INTERRUPT: una verdad del dinero audaz casi prohibida, un "Tú..." directo, o una pregunta que abre una brecha de curiosidad inmediata.\n' +
    '- Cada fragmento siguiente ESCALA la tensión y mantiene un OPEN LOOP — nunca resuelvas antes de tiempo.\n' +
    '- Fragmentos ULTRA cortos (1-3 palabras) para que los cortes peguen fuerte en cada golpe.\n' +
    '- Cerca del final entrega el PAYOFF: un giro que da un "ajá" de dopamina.\n' +
    '- El ÚLTIMO fragmento debe disparar REWATCH o COMENTARIO (un remate que cierra el loop o una frase de identidad como "Ahora lo sabes.").\n' +
    'Seguro, filoso, aspiracional (NADA de estafa ni riqueza rápida ni consejos financieros específicos). Devuelve SOLO JSON.',
};
let sys = SYS[LANG] || SYS.en;
sys += '
Elige el campo "genero" (hombre/mujer): la voz que mejor cuente ESTE tema. Usa "hombre" para fuerza, dinero, tecnologia, futuro o intensidad; "mujer" para ternura, emocion suave o cercania.';

const PHOTO_THEMES = [
  'a glowing modern city skyline at golden hour, financial district',
  'a sleek luxury sports car on a city street at dusk, cinematic',
  'stacks of cash and gold coins on a dark marble table, dramatic light',
  'a lone silhouette on a rooftop overlooking a vast city at sunrise',
  'a sleek modern luxury office with floor-to-ceiling city view',
  'extreme close-up of an elegant luxury watch on a suited wrist',
  'a private jet on a runway at golden hour, aspirational',
  'glowing stock market charts and financial data on dark screens',
  'a luxury modern mansion with an infinity pool at dusk',
  'hands typing on a laptop at night with city light bokeh',
  'hands writing goals in a notebook beside coffee and a laptop, morning light',
  'a confident person in a suit walking through a modern financial district',
];

log.step('Pool de fotos (riqueza cinematográfica)');
const photos: string[] = [];
for (let i = 0; i < PHOTO_THEMES.length; i++) {
  const p = path.join(poolDir, `photo_${String(i).padStart(2, '0')}.png`);
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) { photos.push(p); continue; }
    await geminiImage(`${PHOTO_THEMES[i]}, vertical 9:16, ultra realistic cinematic photography, premium high-end mood, highly detailed, no text`, p, { aspectRatio: '9:16' });
    photos.push(p); log.ok(`foto ${i}`);
  } catch (e) { log.warn(`foto ${i} falló (${(e as Error).message.slice(0, 40)})`); }
}
if (!photos.length) throw new Error('sin fotos');
log.ok(`pool: ${photos.length} fotos | banco: ${loadBank(THEME).length} clips`);

const SCHEMA = { type: 'object', properties: { fragmentos: { type: 'array', items: { type: 'string' } }, frase: { type: 'string' }, genero: { type: 'string', enum: ['hombre', 'mujer'] } }, required: ['fragmentos', 'frase', 'genero'] };

async function renderOne(topic: string, idx: number, mood: string): Promise<string> {
  const slug = slugify(topic);
  const dir = path.join(baseDir, slug);
  await ensureDir(dir);
  const final = path.join(dir, 'video.mp4');
  if (fs.existsSync(final) && fs.statSync(final).size > 10000) { log.ok(`${topic} ya existe`); return final; }

  const music = await getMoodTrack(mood, path.join(dir, 'music.mp3'), idx);
  const dur = await probeDuration(music);
  const all = await detectBeats(music, { minGap: 0.3 });
  const beats = all.filter((b) => b >= 0.2 && b < Math.min(dur, 28));
  const N = Math.min(beats.length, 22);
  let use = beats.slice(0, N);

  const userPrompt = LANG === 'es'
    ? `Tema: "${topic}". Crea un mensaje de mentalidad de riqueza en EXACTAMENTE ${N} fragmentos cortos (1-4 palabras), que enganche con una verdad del dinero, desnude la brecha de mentalidad y termine con un giro poderoso para construir riqueza. {fragmentos:[...], frase:"..."}`
    : `Theme: "${topic}". Create a wealth mindset message in EXACTLY ${N} short fragments (1-4 words), that hooks with a money truth, exposes the mindset gap and ends with a powerful wealth-building shift. {fragmentos:[...], frase:"..."}`;
  const { fragmentos, frase, genero } = await geminiJson<{ fragmentos: string[]; frase: string; genero?: string }>(userPrompt, SCHEMA, sys);
  await fsp.writeFile(path.join(dir, 'frase.json'), JSON.stringify({ topic, mood, frase, fragmentos }, null, 2), 'utf8');

  // Voz en off: narra los fragmentos y sincroniza su aparición a la voz.
  let voicePath: string | null = null, voiceDur = 0, voiceSeek = 0;
  if (VOICE) {
    try {
      const nr = await narrate(fragmentos, dir, LANG, genero === 'mujer' ? VOICE_F : VOICE_M);
      voiceSeek = nr.times[0] ?? 0;
      use = nr.times.map((t) => Math.max(0, t - voiceSeek));
      voiceDur = Math.max(0.5, nr.voiceDur - voiceSeek);
      voicePath = nr.voicePath;
    } catch (e) { log.warn(`voz ${slug}: ${(e as Error).message.slice(0, 60)} — sigo sin voz`); }
  }

  const nClips = Math.max(1, Math.ceil(use.length / 2));
  const clips = pickClips(THEME, { n: nClips, offset: idx * 2 });
  const photoOffset = (idx * 3) % photos.length;

  const segs: string[] = [];
  let pi = 0, ci = 0;
  for (let i = 0; i < use.length; i++) {
    const segDur = Math.max(0.25, (i + 1 < use.length ? use[i + 1] : (voiceDur > use[i] ? voiceDur : use[i] + 0.7)) - use[i]);
    const out = path.join(dir, `seg_${String(i).padStart(2, '0')}.mp4`);
    const txtFile = out + '.txt';
    await fsp.writeFile(txtFile, fragmentos[i] || '', 'utf8');
    // Texto con POP-IN (alpha sube en 0.16s → el cerebro registra el cambio en cada beat)
    const draw = `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(txtFile)}':fontcolor=white:fontsize=96:borderw=8:bordercolor=black@0.9:shadowcolor=black@0.55:shadowx=0:shadowy=3:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=12:alpha='if(lt(t,0.16),t/0.16,1)'`;
    const useClip = clips.length > 0 && i % 2 === 1;

    if (useClip) {
      const clip = clips[ci % clips.length].file; ci++;
      const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,${draw}`;
      await ff(['-i', clip, '-t', segDur.toFixed(2), '-an', '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
    } else {
      const img = photos[(photoOffset + pi) % photos.length]; pi++;
      const frames = Math.max(1, Math.round(segDur * 30));
      // Zoom con DIRECCIÓN alternada (in/out) → movimiento variado que evita la monotonía
      const zexpr = (pi % 2 === 0) ? `min(1.0+0.006*on,1.20)` : `max(1.22-0.006*on,1.02)`;
      const vf =
        `scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,` +
        `zoompan=z='${zexpr}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,${draw}`;
      await ff(['-loop', '1', '-i', img, '-t', segDur.toFixed(2), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
    }
    await fsp.unlink(txtFile).catch(() => {});
    segs.push(out);
  }

  const listFile = path.join(dir, 'list.txt');
  await fsp.writeFile(listFile, segs.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const silent = path.join(dir, 'silent.mp4');
  await ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);
  const vlen = await probeDuration(silent);
  const fadeSt = Math.max(0, vlen - 0.8).toFixed(2);
  if (voicePath) {
    // Voz al frente + música de fondo ducked (16%), salta el silencio inicial de la voz.
    await ff(['-i', silent, '-ss', voiceSeek.toFixed(2), '-i', voicePath, '-i', music, '-map', '0:v',
      '-filter_complex', `[2:a]volume=0.16,apad[bg];[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[mx];[mx]afade=t=out:st=${fadeSt}:d=0.8[ao]`,
      '-map', '[ao]', '-t', vlen.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', final]);
  } else {
    await ff(['-i', silent, '-ss', use[0].toFixed(2), '-i', music, '-map', '0:v', '-map', '1:a', '-t', vlen.toFixed(2),
      '-c:v', 'copy', '-c:a', 'aac', '-af', `afade=t=out:st=${fadeSt}:d=0.8`, final]);
  }

  for (const c of segs) await fsp.unlink(c).catch(() => {});
  await fsp.unlink(silent).catch(() => {});
  await uploadPublic(final, `${storagePrefix}/${slug}.mp4`, 'video/mp4');
  // Miniatura SIN TEXTO (16:9) que invita al clic — al no tener texto sirve en todos los idiomas.
  const thumb = path.join(dir, 'thumb.png');
  if (!fs.existsSync(thumb)) {
    try { await geminiImage(`Cinematic YouTube thumbnail about "${topic}", one bold dramatic focal subject, high-contrast lighting, vivid premium colors, curiosity-driving, photorealistic, absolutely NO text and NO words`, thumb, { aspectRatio: '16:9' }); }
    catch (e) { log.warn(`thumb ${slug}: ${(e as Error).message.slice(0, 40)}`); }
  }
  return final;
}

// Sonidos virales/impactantes (trap) de TikTok — pegan fuerte en los cortes al beat.
const MOODS = ['retencion-tiktok'];
// Auto-optimización: sesga temas + hook hacia lo que rinde (optimize.ts).
const strategy = await loadStrategy('wealth');
if (strategy?.hookNote) sys += `\n\nOPTIMIZACIÓN (lo que está rindiendo): ${strategy.hookNote}`;
const effSeed = strategy?.topics?.length ? strategy.topics : SEED;
log.step(`Temas frescos (${N_TARGET})${strategy ? ' [estrategia activa]' : ''}`);
const TOPICS = await freshTopics(`wealth-${LANG}`, NICHE, N_TARGET, effSeed);
log.ok(`temas: ${TOPICS.join(' · ').slice(0, 120)}…`);
let made = 0;
const total = Math.min(N_TARGET, TOPICS.length);
for (let i = 0; i < total; i++) {
  const mood = MOODS[i % MOODS.length];
  try { await renderOne(TOPICS[i], i, mood); made++; log.ok(`(${made}/${total}) ${TOPICS[i]} [${mood}]`); }
  catch (e) { log.err(`${TOPICS[i]}: ${(e as Error).message.slice(0, 90)}`); }
}
console.log(`\n✅ World Wealth Mindset (${LANG}): ${made}/${total} videos (mezcla foto+video) subidos a ${storagePrefix}/`);
