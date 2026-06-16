// Reprograma TODOS los videos no-públicos para publicarse en ~20 min (todos juntos).
import path from 'node:path';
import { getYtAccessToken } from '../src/youtube/auth';
import { readJson } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const YT = path.join(ROOT, 'data', 'youtube');
const when = new Date(Date.now() + 20 * 60 * 1000).toISOString();

for (const lang of ['es', 'en', 'it', 'zh']) {
  const pub = await readJson<Record<string, string>>(path.join(YT, `published_${lang}.json`), {});
  const ids = Object.values(pub).filter((v) => v && v !== 'SKIP');
  if (!ids.length) continue;
  const token = await getYtAccessToken(lang);

  const vR = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids.join(',')}`, { headers: { Authorization: `Bearer ${token}` } });
  const vids = (await vR.json()).items || [];
  let n = 0, already = 0;
  for (const v of vids) {
    if (v.status?.privacyStatus === 'public') { already++; continue; }
    const body = { id: v.id, status: { privacyStatus: 'private', publishAt: when, selfDeclaredMadeForKids: true } };
    const uR = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (uR.ok) n++; else log.err(`${v.id}: ${(await uR.text()).slice(0, 140)}`);
  }
  log.ok(`${lang}: ${n} reprogramados (+${already} ya públicos)`);
}
console.log(`\n✅ Todos los programados saldrán a las ${when} (~20 min).`);
