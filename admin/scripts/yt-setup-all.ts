// Configura TODOS los canales que ya tengan token: metadata + playlists. Sin preguntar.
import path from 'node:path';
import { updateChannel, getMyChannel } from '../src/youtube/upload';
import { PLAYLISTS, createPlaylist } from '../src/youtube/playlists';
import { readJson, writeJson, exists } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const YT = path.join(ROOT, 'data', 'youtube');
const TOKDIR = path.join(YT, 'tokens');

for (const lang of ['es', 'en', 'it', 'zh']) {
  if (!exists(path.join(TOKDIR, `${lang}.json`))) { log.info(`${lang}: sin token aún, salto`); continue; }
  if (exists(path.join(YT, `playlists_${lang}.json`))) { log.info(`${lang}: ya configurado, salto`); continue; }
  try {
    const ch = await getMyChannel(lang);
    log.step(`Canal ${lang}: "${ch.title}"`);
    const meta = await readJson<any>(path.join(YT, `channel_${lang}.json`), null);
    await updateChannel(lang, { description: meta.description, keywords: meta.keywords });
    log.ok('metadata (descripción + tags) actualizada');
    const ids: Record<string, string> = {};
    for (const pl of PLAYLISTS) {
      ids[pl.key] = await createPlaylist(lang, (pl.title as any)[lang], (pl.desc as any)[lang]);
      log.ok(`playlist: ${(pl.title as any)[lang]}`);
    }
    await writeJson(path.join(YT, `playlists_${lang}.json`), ids);
  } catch (e) {
    log.err(`${lang}: ${(e as Error).message.slice(0, 160)}`);
  }
}
console.log('\n✅ Setup de canales completado (los que tenían token).');
