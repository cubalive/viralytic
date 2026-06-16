// Actualiza (fuerza) la descripción + keywords de TODOS los canales con la versión maximizada.
import path from 'node:path';
import { updateChannel, getMyChannel } from '../src/youtube/upload';
import { readJson } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const YT = path.join(ROOT, 'data', 'youtube');

for (const lang of ['es', 'en', 'it', 'zh']) {
  try {
    const ch = await getMyChannel(lang);
    const meta = await readJson<any>(path.join(YT, `channel_${lang}.json`), null);
    if (!meta) { log.warn(`${lang}: sin metadata`); continue; }
    await updateChannel(lang, { description: meta.description, keywords: meta.keywords, country: meta.country, defaultLanguage: meta.defaultLanguage });
    log.ok(`${ch.title}: descripción (${meta.description.length} chars) + ${meta.keywords.length} keywords`);
  } catch (e) {
    log.err(`${lang}: ${(e as Error).message.slice(0, 140)}`);
  }
}
console.log('\n✅ Canales actualizados al máximo.');
