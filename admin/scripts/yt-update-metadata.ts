// Actualiza la metadata (título/desc/tags) de los videos ya publicados con la versión mejorada.
import path from 'node:path';
import { getYtAccessToken } from '../src/youtube/auth';
import { readJson } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const YT = path.join(ROOT, 'data', 'youtube');

for (const lang of ['es', 'en', 'it', 'zh']) {
  const pub = await readJson<Record<string, string>>(path.join(YT, `published_${lang}.json`), {});
  const token = await getYtAccessToken(lang);
  let n = 0;
  for (const [slug, vid] of Object.entries(pub)) {
    if (!vid || vid === 'SKIP') continue;
    const meta = await readJson<any>(path.join(YT, lang, `${slug}.json`), null);
    if (!meta) continue;
    const body = { id: vid, snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId || '27' } };
    const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) n++; else log.err(`${slug}: ${(await r.text()).slice(0, 130)}`);
  }
  log.ok(`${lang}: ${n} videos con metadata mejorada`);
}
console.log('\n✅ Metadata optimizada aplicada a los videos en vivo.');
