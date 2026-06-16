// Configura un canal Katharsis: descripción + keywords + 5 playlists de pilares.
// Uso: tsx scripts/yt-kat-setup.ts <slot>   (ej: kat-es). Lee data/youtube/channel_<slot>.json
import path from 'node:path';
import { updateChannel, getMyChannel } from '../src/youtube/upload';
import { createPlaylist } from '../src/youtube/playlists';
import { readJson, writeJson } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const slot = process.argv[2];
if (!slot) throw new Error('Uso: tsx scripts/yt-kat-setup.ts <slot>  (ej: kat-es)');
const YT = path.join(ROOT, 'data', 'youtube');
const meta = await readJson<any>(path.join(YT, `channel_${slot}.json`), null);
if (!meta) throw new Error(`falta channel_${slot}.json`);

const ch = await getMyChannel(slot);
log.step(`Canal: ${ch.title} (${ch.id})`);

// 1) Descripción + keywords
await updateChannel(slot, { description: meta.description, keywords: meta.keywords, country: meta.country, defaultLanguage: meta.defaultLanguage });
log.ok(`Descripción (${meta.description.length} chars) + ${meta.keywords.length} keywords aplicadas`);

// 2) Playlists de pilares (reanudable: guarda ids, no duplica)
const plFile = path.join(YT, `kat_playlists_${slot}.json`);
const existing = await readJson<Record<string, string>>(plFile, {});
for (const p of meta.pillars || []) {
  if (existing[p.key]) { log.ok(`playlist "${p.title}" ya existe`); continue; }
  try {
    const id = await createPlaylist(slot, p.title, p.desc);
    existing[p.key] = id;
    await writeJson(plFile, existing);
    log.ok(`playlist creada: ${p.title} (${id})`);
  } catch (e) { log.err(`playlist "${p.title}": ${(e as Error).message.slice(0, 120)}`); }
}
console.log(`\n✅ ${ch.title} configurado: descripción + keywords + ${Object.keys(existing).length} playlists. Frase: ${meta.tagline}`);
