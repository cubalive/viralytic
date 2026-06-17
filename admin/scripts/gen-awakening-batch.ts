// Lote de videos de DESPERTAR (frase sincronizada al bajo, 9:16, imágenes realistas).
// Eficiente: genera un POOL de imágenes una vez y lo reusa en todos los videos.
// Uso: tsx scripts/gen-awakening-batch.ts [N]   (default 30)
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { detectBeats } from '../src/beat/detect';
import { getMoodTrack } from '../src/audio/soundbank';
import { geminiImage } from '../src/ai/gemini-image';
import { geminiJson } from '../src/ai/gemini';
import { ff, probeDuration } from '../src/lib/ffmpeg';
import { pickClips } from '../src/bank/videobank';
import { uploadPublic } from '../src/lib/storage';
import { ensureDir } from '../src/lib/files';
import { freshTopics } from '../src/faceless/topics';
import { config, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

const N_TARGET = Number(process.argv[2] || 30);
const LANG = (process.argv[3] || 'es').toLowerCase();
const baseDir = path.join(OUTPUT_DIR, LANG === 'es' ? 'awakening' : `awakening-${LANG}`);
const storagePrefix = LANG === 'es' ? 'kids-studio/awakening' : `kids-studio/awakening-${LANG}`;
const poolDir = path.join(OUTPUT_DIR, 'awakening', '_pool'); // pool compartido entre idiomas
await ensureDir(poolDir);
const esc = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:');
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);

// 30 temas variados dentro del concepto: despertar, energía, encontrarte contigo, progreso, desnudar la sociedad.
const TOPICS_BY_LANG: Record<string, string[]> = {
  es: [
    'La rutina que no elegiste', 'Vivir para la aprobación de otros', 'El miedo al qué dirán',
    'Compararte en las redes sociales', 'El tiempo que regalas al scroll', 'Posponer tus sueños para después',
    'La zona de confort que te encadena', 'Trabajar sin propósito', 'El ruido que tapa tu voz interior',
    'Esperar el momento perfecto', 'La opinión ajena sobre tu vida', 'El consumo que te distrae',
    'La prisa que te roba el presente', 'Culpar a otros de tu vida', 'El éxito ajeno como medida',
    'Dormir tus talentos', 'La queja como costumbre', 'El piloto automático diario',
    'Buscar fuera lo que está dentro', 'El precio de encajar', 'La energía que entregas a lo que no importa',
    'Reaccionar en vez de decidir', 'La pantalla antes que tú', 'La validación que mendigas',
    'Tu poder personal dormido', 'El silencio interior como fuerza', 'Levantarte después de caer',
    'Romper el molde social', 'La disciplina como libertad', 'Empezar hoy, no mañana',
  ],
  en: [
    'The routine you never chose', 'Living for other people’s approval', 'The fear of being judged',
    'Comparing yourself on social media', 'The time you give to the scroll', 'Postponing your dreams for later',
    'The comfort zone that chains you', 'Working without purpose', 'The noise that silences your inner voice',
    'Waiting for the perfect moment', 'Other people’s opinion of your life', 'The consumption that distracts you',
    'The rush that steals your present', 'Blaming others for your life', 'Other people’s success as your measure',
    'Letting your talents sleep', 'Complaining as a habit', 'The daily autopilot',
    'Searching outside for what is within', 'The price of fitting in', 'The energy you give to what doesn’t matter',
    'Reacting instead of deciding', 'The screen before yourself', 'The validation you beg for',
    'Your dormant personal power', 'Inner silence as strength', 'Rising after you fall',
    'Breaking the social mold', 'Discipline as freedom', 'Starting today, not tomorrow',
  ],
};
const SEED = TOPICS_BY_LANG[LANG] || TOPICS_BY_LANG.es;
const NICHE = {
  system: LANG === 'es'
    ? 'Generas TEMAS frescos y distintos para un canal de Shorts de DESPERTAR / consciencia. Cada tema = un título corto en español de una verdad incómoda de la sociedad o un tema de autorrealización. Devuelve SOLO JSON {topics:[...]}.'
    : 'You generate fresh, distinct TOPICS for an AWAKENING / consciousness Shorts channel. Each topic = a short English title of an uncomfortable societal truth or a self-realization theme. Return ONLY JSON {topics:[...]}.',
  ask: LANG === 'es' ? 'Canal de despertar/consciencia en español.' : 'Awakening / consciousness channel in English.',
};
// Sonidos virales/impactantes (trap) de TikTok — pegan fuerte en los cortes al beat.
const MOODS = ['retencion-tiktok'];
const THEMES = [
  'a breathtaking modern city skyline at golden hour', 'a person on a mountain cliff facing a vast glowing sunrise',
  'a stunning ocean horizon at dawn with dramatic light', 'a serene forest with sun rays piercing the trees',
  'a futuristic city at night with glowing lights and rain reflections', 'a lone figure walking toward a bright horizon on an empty road',
  'majestic snowy mountains under the northern lights', 'a calm lake mirroring a vivid colorful sunset sky',
  'a vast desert with dunes under a dramatic sky', 'a waterfall in a lush green canyon with sunlight',
  'a person standing on a rooftop above a glowing megacity at dusk', 'a starry milky way over a silhouetted mountain range',
  'rolling green hills under golden morning light', 'a dramatic coastline with waves crashing on cliffs at sunset',
  'an open road through autumn forest toward distant mountains', 'a misty valley with sunbeams breaking through clouds',
  'a tropical beach with turquoise water and palm trees at sunrise', 'a snowy pine forest at dawn with soft pink light',
];

// 1) POOL de imágenes (reusa existentes + las del sample anterior + extiende; resiliente a cuota)
log.step(`Pool de imágenes (objetivo ${THEMES.length})`);
for (const seed of ['mystery/esperanzador', 'mystery/retencion-tiktok']) {
  const sd = path.join(OUTPUT_DIR, seed);
  if (!fs.existsSync(sd)) continue;
  for (const f of fs.readdirSync(sd).filter((x) => /^bg_\d+\.png$/.test(x))) {
    const dst = path.join(poolDir, `seed_${seed.split('/')[1]}_${f}`);
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(sd, f), dst);
  }
}
for (let i = 0; i < THEMES.length; i++) {
  const p = path.join(poolDir, `img_${String(i).padStart(2, '0')}.png`);
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) continue;
    await geminiImage(`${THEMES[i]}, ultra realistic cinematic photography, vertical 9:16, dramatic light, inspiring and awakening mood, highly detailed, no text, masterpiece`, p, { aspectRatio: '9:16' });
    log.ok(`pool img_${i}`);
  } catch (e) { log.warn(`img_${i} falló (${(e as Error).message.slice(0, 40)})`); }
}
const pool = fs.readdirSync(poolDir).filter((f) => /\.png$/.test(f)).map((f) => path.join(poolDir, f)).filter((p) => fs.statSync(p).size > 10000);
if (pool.length < 4) throw new Error(`pool insuficiente (${pool.length})`);
log.ok(`pool listo: ${pool.length} imágenes`);

const SCHEMA = { type: 'object', properties: { fragmentos: { type: 'array', items: { type: 'string' } }, frase: { type: 'string' } }, required: ['fragmentos', 'frase'] };
const SYS: Record<string, string> = {
  es:
    'Eres un ingeniero de RETENCIÓN de talla mundial para un canal de DESPERTAR y consciencia. Escribes para el CEREBRO: parar el scroll en los primeros 0.5s y sostener hasta el último frame. REGLAS:\n' +
    '- Fragmento 1 = GANCHO PATTERN-INTERRUPT: una verdad incómoda audaz, un "Tú..." directo, o una pregunta que abre una brecha de curiosidad inmediata.\n' +
    '- Cada fragmento siguiente ESCALA la tensión y mantiene un OPEN LOOP — nunca resuelvas antes de tiempo.\n' +
    '- Fragmentos ULTRA cortos (1-3 palabras) para cortes que pegan fuerte en cada golpe.\n' +
    '- Cerca del final, PAYOFF: un giro de DESPERTAR poderoso y positivo (un "ajá" de dopamina) sobre tu energía, tu progreso, levantarte.\n' +
    '- El ÚLTIMO fragmento dispara REWATCH o COMENTARIO (remate que cierra el loop o frase de identidad como "Ahora despiertas.").\n' +
    'Profundo, despierto, inspirador (no infantil, NO nihilista). Devuelve SOLO JSON.',
  en:
    'You are a world-class SHORT-FORM RETENTION engineer for an AWAKENING / consciousness channel. You write for the BRAIN: stop the scroll in the first 0.5s and hold to the last frame. RULES:\n' +
    '- Fragment 1 = a PATTERN-INTERRUPT HOOK: a bold uncomfortable truth, a sharp "You..." callout, or a question that opens an instant curiosity gap.\n' +
    '- Every next fragment ESCALATES tension and keeps an OPEN LOOP — never resolve early.\n' +
    '- Fragments ULTRA short (1-3 words) so the cuts hit hard on every beat.\n' +
    '- Near the end, the PAYOFF: a powerful positive awakening twist (a dopamine "aha") about your energy, your progress, rising.\n' +
    '- The LAST fragment triggers a REWATCH or COMMENT (a loop-back or identity line like "Now you wake up.").\n' +
    'Deep, awakened, inspiring (not childish, NOT nihilistic). Return ONLY JSON.',
};
const sys = SYS[LANG] || SYS.es;

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
  const use = beats.slice(0, N);

  const userPrompt = LANG === 'en'
    ? `Theme / truth to expose: "${topic}". Create an awakening message in EXACTLY ${N} short fragments (1-4 words), that hooks, exposes that truth and ends with a powerful, positive awakening. {fragmentos:[...], frase:"..."}`
    : `Tema / verdad a desnudar: "${topic}". Crea un mensaje de despertar en EXACTAMENTE ${N} fragmentos cortos (1-4 palabras), que enganche, desnude esa verdad y termine con un despertar poderoso y positivo. {fragmentos:[...], frase:"..."}`;
  const { fragmentos, frase } = await geminiJson<{ fragmentos: string[]; frase: string }>(userPrompt, SCHEMA, sys);
  await fsp.writeFile(path.join(dir, 'frase.json'), JSON.stringify({ topic, mood, frase, fragmentos }, null, 2), 'utf8');

  const offset = (idx * 3) % pool.length;
  const imgs = Array.from({ length: Math.min(8, pool.length) }, (_, k) => pool[(offset + k) % pool.length]);
  const NIMG = imgs.length;

  // B-roll del banco Veo 'awakening' (9:16): se alterna con las fotos.
  const nClips = Math.max(1, Math.ceil(use.length / 2));
  const bankClips = pickClips('awakening', { n: nClips, offset: idx * 2 });

  const clips: string[] = [];
  let ci = 0;
  for (let i = 0; i < use.length; i++) {
    const segDur = Math.max(0.25, (i + 1 < use.length ? use[i + 1] : use[i] + 0.7) - use[i]);
    const out = path.join(dir, `seg_${String(i).padStart(2, '0')}.mp4`);
    const txtFile = out + '.txt';
    await fsp.writeFile(txtFile, fragmentos[i] || '', 'utf8');
    const draw =
      `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(txtFile)}':fontcolor=white:fontsize=96:` +
      `borderw=8:bordercolor=black@0.9:shadowcolor=black@0.55:shadowx=0:shadowy=3:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=12:alpha='if(lt(t,0.16),t/0.16,1)'`;
    // Beats impares = b-roll del banco; pares = foto con zoom Ken Burns.
    const useClip = bankClips.length > 0 && i % 2 === 1;
    if (useClip) {
      const clip = bankClips[ci % bankClips.length].file; ci++;
      const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,${draw}`;
      await ff(['-i', clip, '-t', segDur.toFixed(2), '-an', '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
    } else {
      const img = imgs[i % NIMG];
      const frames = Math.max(1, Math.round(segDur * 30));
      const zexpr = (i % 2 === 0) ? `min(1.0+0.006*on,1.20)` : `max(1.22-0.006*on,1.02)`; // zoom in/out alternado
      const vf =
        `scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,` +
        `zoompan=z='${zexpr}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,${draw}`;
      await ff(['-loop', '1', '-i', img, '-t', segDur.toFixed(2), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
    }
    await fsp.unlink(txtFile).catch(() => {});
    clips.push(out);
  }

  const listFile = path.join(dir, 'list.txt');
  await fsp.writeFile(listFile, clips.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const silent = path.join(dir, 'silent.mp4');
  await ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);
  const vlen = await probeDuration(silent);
  await ff(['-i', silent, '-ss', use[0].toFixed(2), '-i', music, '-map', '0:v', '-map', '1:a', '-t', vlen.toFixed(2),
    '-c:v', 'copy', '-c:a', 'aac', '-af', 'afade=t=out:st=' + Math.max(0, vlen - 0.8).toFixed(2) + ':d=0.8', final]);

  // limpia intermedios
  for (const c of clips) await fsp.unlink(c).catch(() => {});
  await fsp.unlink(silent).catch(() => {});
  await uploadPublic(final, `${storagePrefix}/${slug}.mp4`, 'video/mp4');
  // Miniatura SIN TEXTO (16:9) que invita al clic — al no tener texto sirve en todos los idiomas.
  const thumb = path.join(dir, 'thumb.png');
  if (!fs.existsSync(thumb)) {
    try { await geminiImage(`Cinematic YouTube thumbnail about "${topic}", one bold dramatic focal subject, awakening/emotional mood, high-contrast dramatic lighting, vivid colors, curiosity-driving, photorealistic, absolutely NO text and NO words`, thumb, { aspectRatio: '16:9' }); }
    catch (e) { log.warn(`thumb ${slug}: ${(e as Error).message.slice(0, 40)}`); }
  }
  return final;
}

log.step(`Temas frescos (${N_TARGET})`);
const TOPICS = await freshTopics(`kat-${LANG}`, NICHE, N_TARGET, SEED);
log.ok(`temas: ${TOPICS.join(' · ').slice(0, 120)}…`);
let made = 0;
const total = Math.min(N_TARGET, TOPICS.length);
for (let i = 0; i < total; i++) {
  const mood = MOODS[i % MOODS.length];
  try {
    await renderOne(TOPICS[i], i, mood);
    made++;
    log.ok(`(${made}/${total}) ${TOPICS[i]} [${mood}]`);
  } catch (e) {
    log.err(`${TOPICS[i]}: ${(e as Error).message.slice(0, 90)}`);
  }
}
console.log(`\n✅ ${made}/${total} videos de despertar generados y subidos a kids-studio/awakening/`);
