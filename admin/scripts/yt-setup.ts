// Rellena la metadata del canal + crea las playlists. Uso: tsx scripts/yt-setup.ts <es|en|it|zh>
import path from 'node:path';
import { updateChannel, getMyChannel } from '../src/youtube/upload';
import { PLAYLISTS, createPlaylist } from '../src/youtube/playlists';
import { readJson, writeJson } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const lang = process.argv[2];
if (!['es', 'en', 'it', 'zh'].includes(lang)) throw new Error('Uso: npm run yt-setup -- <es|en|it|zh>');

const YT = path.join(ROOT, 'data', 'youtube');
const ch = await getMyChannel(lang);
log.ok(`Canal autorizado: "${ch.title}" (${ch.id})`);

const meta = await readJson<any>(path.join(YT, `channel_${lang}.json`), null);
await updateChannel(lang, { description: meta.description, keywords: meta.keywords });
log.ok('Descripción + tags del canal actualizados');

const ids: Record<string, string> = {};
for (const pl of PLAYLISTS) {
  const id = await createPlaylist(lang, (pl.title as any)[lang], (pl.desc as any)[lang]);
  ids[pl.key] = id;
  log.ok(`Playlist creada: ${(pl.title as any)[lang]}`);
}
await writeJson(path.join(YT, `playlists_${lang}.json`), ids);
console.log(`\n✅ Canal ${lang} configurado: metadata + ${PLAYLISTS.length} playlists.`);
