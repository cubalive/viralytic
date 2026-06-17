// Organiza TODOS los videos en el BANCO GENERAL, por canal → idioma → Publicados/Generados.
// Lee el estado real de publicación para clasificar. Reanudable (no recopia).
// Uso: tsx scripts/organize-bank.ts   (destino por env BANK_DIR o el default)
import fs from 'node:fs';
import path from 'node:path';
import { OUTPUT_DIR, ROOT } from '../src/config';
import { log } from '../src/lib/log';

const BANK = process.env.BANK_DIR || 'E:\\0005. Passkal\\Canales de Youtube\\BANCO DE VIDEOS GENERAL';
const YT = path.join(ROOT, 'data', 'youtube');
const rj = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };
const clean = (s: string) => s.replace(/__.*$/, '');

let copied = 0, skipped = 0, moved = 0;
function place(channel: string, lang: string, status: 'Publicados' | 'Generados', name: string, src: string) {
  // Si ya estaba en el otro estado (p.ej. pasó de Generado a Publicado), lo quita de allí.
  const other = status === 'Publicados' ? 'Generados' : 'Publicados';
  const otherPath = path.join(BANK, channel, lang, other, name);
  if (fs.existsSync(otherPath)) { try { fs.unlinkSync(otherPath); moved++; } catch {} }
  const dst = path.join(BANK, channel, lang, status, name);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) { skipped++; return; }
  try { fs.copyFileSync(src, dst); copied++; } catch (e) { log.warn(`no copió ${name}: ${(e as Error).message.slice(0, 50)}`); }
}

// ---- Canales faceless (1 carpeta por slug con video.mp4) ----
const FACELESS = [
  { sub: 'wealth', channel: 'World Wealth Mindset', lang: 'EN', state: 'kat_published_wealth.json' },
  { sub: 'awakening', channel: 'Katharsis', lang: 'ES', state: 'kat_published_kat-es.json' },
  { sub: 'awakening-en', channel: 'Katharsis', lang: 'EN', state: 'kat_published_kat-en.json' },
];
for (const f of FACELESS) {
  const base = path.join(OUTPUT_DIR, f.sub);
  if (!fs.existsSync(base)) continue;
  const pub = rj(path.join(YT, f.state));
  for (const d of fs.readdirSync(base)) {
    if (d.startsWith('_')) continue;
    const v = path.join(base, d, 'video.mp4');
    if (!fs.existsSync(v)) continue;
    place(f.channel, f.lang, pub[d] ? 'Publicados' : 'Generados', `${d}.mp4`, v);
  }
  log.ok(`${f.channel} ${f.lang}: organizado`);
}

// ---- SabiKids (reels reel_<lang>[_vN].mp4 dentro de cada tema) ----
const edu = path.join(OUTPUT_DIR, 'reels', 'edu-veo');
for (const lang of ['es', 'en', 'it', 'zh']) {
  const pub = rj(path.join(YT, `published_${lang}.json`));
  const publishedFiles = new Set<string>();
  for (const [slug, vid] of Object.entries(pub)) {
    if (!vid || vid === 'SKIP') continue;
    const meta = rj(path.join(YT, lang, `${slug}.json`));
    const file = meta.file ? path.join(ROOT, meta.file) : '';
    if (file && fs.existsSync(file)) {
      publishedFiles.add(path.resolve(file).toLowerCase());
      place('SabiKids', lang.toUpperCase(), 'Publicados', `${clean(slug)}.mp4`, file);
    }
  }
  if (fs.existsSync(edu)) {
    for (const topic of fs.readdirSync(edu)) {
      const tdir = path.join(edu, topic);
      if (!fs.statSync(tdir).isDirectory()) continue;
      for (const fn of fs.readdirSync(tdir)) {
        const m = fn.match(new RegExp(`^reel_${lang}(_v\\d+)?\\.mp4$`));
        if (!m) continue;
        const full = path.join(tdir, fn);
        if (publishedFiles.has(path.resolve(full).toLowerCase())) continue;
        place('SabiKids', lang.toUpperCase(), 'Generados', `${clean(topic)}${m[1] || ''}.mp4`, full);
      }
    }
  }
  log.ok(`SabiKids ${lang.toUpperCase()}: organizado`);
}

console.log(`\n✅ Banco organizado en: ${BANK}\n   ${copied} copiados, ${skipped} ya existían.`);
