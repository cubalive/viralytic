// Compilación 16:9 de SabiKids: junta N reels YA hechos en un video largo
// (multi-tema) con CAPÍTULOS + metadata SEO ecosistémica. CERO Veo — solo reúso.
// Uso: tsx scripts/gen-sabikids-compilation.ts [lang=es] [n=10] ["Título opcional"]
import path from 'node:path';
import fs from 'node:fs';
import { ff, probeDuration } from '../src/lib/ffmpeg';
import { geminiJson } from '../src/ai/gemini';
import { readJson } from '../src/lib/files';
import { ROOT, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

const lang = process.argv[2] || 'es';
const N = Number(process.argv[3] || 10);
const customTitle = process.argv[4] || '';

const SRC = path.join(OUTPUT_DIR, 'reels', 'edu-veo-16x9');
const cfg: any = await readJson(path.join(ROOT, 'data', 'youtube', `channel_${lang}.json`), {});
const brand = cfg.title || 'Sabi Kids';

if (!fs.existsSync(SRC)) throw new Error(`no hay 16:9 en ${SRC}`);
const dirs = fs.readdirSync(SRC).filter((d) => fs.existsSync(path.join(SRC, d, `reel_${lang}.mp4`)));
if (dirs.length < 2) throw new Error(`pocos reels ${lang} para compilar (${dirs.length})`);
const picks = dirs.slice(0, Math.min(N, dirs.length));
const topicOf = (d: string) => d.split('__')[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const outDir = path.join(OUTPUT_DIR, 'reels', 'edu-veo-16x9', '_compilations');
fs.mkdirSync(outDir, { recursive: true });
const stamp = picks.length;

// 1) capítulos (tiempo acumulado) + lista de concat
let t = 0;
const chapters: { title: string; at: number }[] = [];
const files: string[] = [];
for (const d of picks) {
  const f = path.join(SRC, d, `reel_${lang}.mp4`);
  chapters.push({ title: topicOf(d), at: t });
  files.push(f);
  t += await probeDuration(f);
}
const totalMin = Math.round(t / 60);

// 2) concat (mismo códec del motor → copy; si falla, re-encode)
const listFile = path.join(outDir, `_list_${lang}.txt`);
fs.writeFileSync(listFile, files.map((f) => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
const slug = `compilacion-${lang}-${stamp}temas`;
const final = path.join(outDir, `${slug}.mp4`);
try {
  await ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', final]);
} catch {
  await ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', final]);
}

// 3) metadata SEO ecosistémica + capítulos
const ts = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const chaptersBlock = chapters.map((c, i) => `${i === 0 ? '00:00' : ts(c.at)} ${c.title}`).join('\n');
const LANG_FULL: Record<string, string> = { es: 'Spanish', en: 'English', it: 'Italian', zh: 'Simplified Chinese' };
let meta: any = { title: customTitle || `${picks.map(topicOf).slice(0, 3).join(', ')} y más | ${totalMin} min | ${brand}`, description: '', tags: cfg.keywords || ['kids learning'] };
try {
  const sys =
    `You are the #1 YouTube SEO strategist (2026) for the kids channel "${brand}". Write ALL output in ${LANG_FULL[lang] || 'English'}. ` +
    `This is a LONG compilation (${totalMin} min) covering: ${picks.map(topicOf).join(', ')}. Return ONLY JSON:\n` +
    `- titulo: <=100 chars, structure "main keywords | benefit | ${brand}" (e.g. learning compilation for kids).\n` +
    `- descripcion: RICH SEO (1500+ chars): intro (what kids learn, keywords, ages 2-8), body (each topic + why it helps, related concepts, parent questions), channel authority line, CTA (subscribe + playlist) + 8-12 hashtags. Do NOT include timestamps (appended).\n` +
    `- tags: 18-26 kids-learning tags (~500 chars).`;
  const out: any = await geminiJson(`Compilation topics: ${picks.map(topicOf).join(', ')}`, { type: 'object', properties: { titulo: { type: 'string' }, descripcion: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['titulo', 'descripcion', 'tags'] }, sys);
  meta = { title: (customTitle || out.titulo).slice(0, 100), description: `${out.descripcion}\n\n⏱️ Capítulos:\n${chaptersBlock}`, tags: (out.tags || meta.tags).slice(0, 30) };
} catch (e) { log.warn(`metadata: ${(e as Error).message.slice(0, 50)}`); meta.description = `⏱️ Capítulos:\n${chaptersBlock}`; }

fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify({ ...meta, file: final, lang, topics: picks.map(topicOf) }, null, 2), 'utf8');
fs.rmSync(listFile, { force: true });
console.log(`\n✅ Compilación ${lang}: ${picks.length} temas, ${totalMin} min → ${final}`);
console.log(`   Título: ${meta.title}`);
