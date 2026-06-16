// Publicador de Katharsis: sube cada video de despertar con metadata FUERTE y específica
// (título gancho + descripción SEO + tags ≤500c + pilar→playlist). Drip 5/día.
// Hoy: primeros 5 públicos. Resto: programados 5/día a horas pico. Reanudable.
// Uso: tsx scripts/yt-kat-publish.ts <kat-es|kat-en> [perDay]
import path from 'node:path';
import fs from 'node:fs';
import { geminiJson } from '../src/ai/gemini';
import { uploadVideo } from '../src/youtube/upload';
import { addToPlaylist } from '../src/youtube/playlists';
import { readJson, writeJson } from '../src/lib/files';
import { ROOT, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

const slot = process.argv[2];
if (!slot) throw new Error('Uso: tsx scripts/yt-kat-publish.ts <kat-es|kat-en> [perDay]');
const PER_DAY = Number(process.argv[3] || 5);
const YT = path.join(ROOT, 'data', 'youtube');

const meta = await readJson<any>(path.join(YT, `channel_${slot}.json`), null);
if (!meta) throw new Error(`falta channel_${slot}.json`);
// Carpeta de origen por canal (bien separado, sin cruces)
const DIRS: Record<string, string> = { 'kat-es': 'awakening', 'kat-en': 'awakening-en', 'wealth': 'wealth' };
const lang = meta.lang || (slot === 'kat-en' ? 'en' : 'es');
const localDir = path.join(OUTPUT_DIR, DIRS[slot] || slot);
const playlists = await readJson<Record<string, string>>(path.join(YT, `kat_playlists_${slot}.json`), {});
const pillarKeys: string[] = (meta.pillars || []).map((p: any) => p.key);
const pillarLines = (meta.pillars || []).map((p: any) => `${p.key}: ${p.title} — ${p.desc}`).join('\n');

// Estado (reanudable): slug -> { videoId, publishAt }
const stateFile = path.join(YT, `kat_published_${slot}.json`);
const state = await readJson<Record<string, any>>(stateFile, {});

// Recolecta videos listos (con frase.json)
const dirs = fs.readdirSync(localDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => path.join(localDir, d.name))
  .filter((p) => fs.existsSync(path.join(p, 'video.mp4')) && fs.existsSync(path.join(p, 'frase.json')));

log.step(`${slot}: ${dirs.length} videos en disco, ${Object.keys(state).length} ya publicados`);

const SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string' }, descripcion: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    pillar: { type: 'string', enum: pillarKeys },
  },
  required: ['titulo', 'descripcion', 'tags', 'pillar'],
};
const SYS = lang === 'en'
  ? `You are the #1 YouTube SEO strategist for KATHARSIS, a cinematic motivation/awakening Shorts channel (brand line: "Break. Release. Rise."). You are given the EXACT phrase of one vertical Short. Produce METICULOUS, SPECIFIC metadata (never generic, always tied to THIS video's message):
- titulo: a powerful click-worthy title, MAX 100 characters, with a hook + a real search keyword, emotional, specific to the phrase (1-2 emojis allowed). No templates.
- descripcion: strong SEO. First line = hook + keywords. Then 2-3 lines expanding the video's message with depth. A clear CTA (subscribe / comment / save). Close with the brand line "Break. Release. Rise." and a final line of 8-12 relevant, specific hashtags.
- tags: 18-26 specific tags (mix long-tail + niche + broad) tied to the theme; enough to fill ~500 characters total.
- pillar: choose the single best key from:\n${pillarLines}\nReturn ONLY JSON.`
  : `Eres el estratega #1 de YouTube SEO para KATHARSIS, un canal de Shorts de motivación/despertar cinematográfico (frase de marca: "Rompe. Suelta. Renace."). Te doy la FRASE EXACTA de un Short vertical. Creas metadata MINUCIOSA y ESPECÍFICA (nunca genérica, siempre atada al mensaje de ESTE video):
- titulo: un título potente que invite al clic, MÁXIMO 100 caracteres, con gancho + una keyword real de búsqueda, emocional, específico a la frase (1-2 emojis permitidos). Sin plantillas.
- descripcion: SEO fuerte. Primera línea = gancho + keywords. Luego 2-3 líneas que amplíen el mensaje del video con profundidad. Un CTA claro (suscribirse / comentar / guardar). Cierra con la frase de marca "Rompe. Suelta. Renace." y una línea final de 8-12 hashtags relevantes y específicos.
- tags: 18-26 etiquetas específicas (mezcla long-tail + nicho + generales) atadas al tema; suficientes para llenar ~500 caracteres en total.
- pillar: elige la mejor clave de:\n${pillarLines}\nDevuelve SOLO JSON.`;

// Sanea + llena tags hasta ~480 chars (YouTube rechaza < > comillas y suma > 500)
function capTags(tags: string[]): string[] {
  const out: string[] = []; let total = 0;
  for (const raw of tags || []) {
    const t = String(raw).replace(/[<>"“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!t || out.includes(t)) continue;
    const add = t.length + (out.length ? 1 : 0);
    if (total + add > 480) break;
    out.push(t); total += add;
  }
  return out;
}

// Slot de publicación: primeros PER_DAY = ahora (hoy público); resto programado 5/día a horas pico.
const HOURS = [6, 9, 13, 18, 21];
function slotFor(scheduledIndex: number): string | undefined {
  if (scheduledIndex < PER_DAY) return undefined; // público ya
  const j = scheduledIndex - PER_DAY;
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1 + Math.floor(j / PER_DAY), HOURS[j % PER_DAY], 0, 0);
  return d.toISOString();
}

let publishedNow = 0, scheduled = 0, idx = Object.keys(state).length;
for (const dir of dirs) {
  const slug = path.basename(dir);
  if (state[slug]) continue;
  const fr = await readJson<any>(path.join(dir, 'frase.json'), null);
  if (!fr?.frase) { log.warn(`${slug}: sin frase, salto`); continue; }

  let md: any;
  try {
    md = await geminiJson(
      (lang === 'en' ? `Theme: "${fr.topic}"\nPhrase: "${fr.frase}"` : `Tema: "${fr.topic}"\nFrase: "${fr.frase}"`),
      SCHEMA, SYS);
  } catch (e) { log.err(`${slug} metadata: ${(e as Error).message.slice(0, 80)} — salto`); continue; }

  const title = (md.titulo || fr.topic).slice(0, 100);
  const tags = capTags(md.tags || []);
  const publishAt = slotFor(idx);
  try {
    const res = await uploadVideo(slot, {
      title, description: md.descripcion || '', tags,
      categoryId: meta.categoryId || '22', madeForKids: false,
      file: path.join(dir, 'video.mp4'),
    }, publishAt);
    const videoId = res.id;
    state[slug] = { videoId, publishAt: publishAt || 'now', pillar: md.pillar, title };
    await writeJson(stateFile, state);
    // Asignar a playlist del pilar
    const plId = playlists[md.pillar] || playlists[pillarKeys[0]];
    if (plId) { try { await addToPlaylist(slot, plId, videoId); } catch (e) { log.warn(`playlist ${slug}: ${(e as Error).message.slice(0, 60)}`); } }
    if (publishAt) { scheduled++; log.ok(`📅 ${slug} → ${publishAt.slice(0, 16)} [${md.pillar}] "${title.slice(0, 50)}"`); }
    else { publishedNow++; log.ok(`🔴 PÚBLICO ${slug} [${md.pillar}] "${title.slice(0, 50)}"`); }
    idx++;
  } catch (e) {
    const msg = (e as Error).message;
    log.err(`${slug} upload: ${msg.slice(0, 140)}`);
    if (/uploadLimitExceeded|quotaExceeded|exceeded.*number/i.test(msg)) { log.warn('Límite de subidas del canal alcanzado — paro aquí (reanudable).'); break; }
  }
}
console.log(`\n✅ ${slot}: ${publishedNow} públicos hoy + ${scheduled} programados. Total acumulado: ${Object.keys(state).length}/${dirs.length}.`);
