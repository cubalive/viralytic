// Exporta a un TXT la metadata COMPLETA (título + descripción + tags + pillar +
// estado + URL) de los videos de un canal que están en el banco, leyendo la
// metadata REAL desde YouTube (videos.list) para los ya publicados.
// Uso: tsx scripts/export-bank-metadata.ts <slot>   (ej. wealth, kat-en, signal)
import fs from 'node:fs';
import path from 'node:path';
import { getYtAccessToken } from '../src/youtube/auth';
import { readJson } from '../src/lib/files';
import { ROOT } from '../src/config';
import { BANK_DIR } from './bank';

const slot = process.argv[2];
if (!slot) throw new Error('Uso: tsx scripts/export-bank-metadata.ts <slot>');
const YT = path.join(ROOT, 'data', 'youtube');

const meta = await readJson<any>(path.join(YT, `channel_${slot}.json`), null);
if (!meta) throw new Error(`falta channel_${slot}.json`);
const published = await readJson<Record<string, any>>(path.join(YT, `kat_published_${slot}.json`), {});

const channelTitle: string = meta.title;
const L = (meta.lang || 'en').toUpperCase();
const bankDir = path.join(BANK_DIR, channelTitle, L, 'Generados');
if (!fs.existsSync(bankDir)) throw new Error(`no existe la carpeta del banco: ${bankDir}`);

const NUM_RE = /^(\d{3,}) - (.+)\.mp4$/i;
const files = fs.readdirSync(bankDir)
  .filter((f) => f.toLowerCase().endsWith('.mp4'))
  .sort();

// slug -> entrada publicada
const slugToPub = published;

// Baja snippet real de YouTube para los videoIds publicados (lotes de 50).
const ids = Object.values(published).map((p: any) => p.videoId).filter(Boolean);
const snippets: Record<string, any> = {};
if (ids.length) {
  const token = await getYtAccessToken(slot);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(',');
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${batch}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const j = await r.json();
    if (!r.ok) throw new Error(`videos.list ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    for (const it of j.items || []) snippets[it.id] = { ...it.snippet, status: it.status };
  }
}

const lines: string[] = [];
lines.push(`METADATA — ${channelTitle} (${L})`);
lines.push(`Carpeta: ${bankDir}`);
lines.push(`Videos en banco: ${files.length} · Publicados con metadata: ${ids.length}`);
lines.push('='.repeat(70));
lines.push('');

for (const file of files) {
  const m = file.match(NUM_RE);
  const num = m ? m[1] : '—';
  const slug = m ? m[2] : file.replace(/\.mp4$/i, '');
  const pub = slugToPub[slug];
  lines.push(`#${num}  ${file}`);
  if (pub && snippets[pub.videoId]) {
    const s = snippets[pub.videoId];
    lines.push(`  Estado    : PUBLICADO (${s.status?.privacyStatus || '?'})`);
    lines.push(`  URL       : https://youtube.com/watch?v=${pub.videoId}`);
    lines.push(`  Pillar    : ${pub.pillar || '—'}`);
    lines.push(`  Título    : ${s.title || pub.title || ''}`);
    lines.push(`  Tags      : ${(s.tags || []).join(', ') || '—'}`);
    lines.push('  Descripción:');
    for (const dl of String(s.description || '').split('\n')) lines.push(`    ${dl}`);
  } else if (pub) {
    lines.push(`  Estado    : PUBLICADO (videoId ${pub.videoId}, snippet no disponible)`);
    lines.push(`  Título    : ${pub.title || ''}`);
    lines.push(`  Pillar    : ${pub.pillar || '—'}`);
  } else {
    lines.push('  Estado    : SIN PUBLICAR — metadata se genera al publicar (aún no existe)');
  }
  lines.push('');
  lines.push('-'.repeat(70));
  lines.push('');
}

const outFile = path.join(bankDir, `_METADATA ${channelTitle} ${L}.txt`);
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`✅ Escrito: ${outFile}`);
console.log(`   ${files.length} videos · ${ids.length} con metadata de YouTube`);
