// Revisa el estado de los canales y videos (restricciones, rechazos, made-for-kids).
import path from 'node:path';
import { getYtAccessToken } from '../src/youtube/auth';
import { readJson } from '../src/lib/files';
import { ROOT } from '../src/config';

const YT = path.join(ROOT, 'data', 'youtube');

for (const lang of ['es', 'en', 'it', 'zh']) {
  const pub = await readJson<Record<string, string>>(path.join(YT, `published_${lang}.json`), {});
  const ids = Object.values(pub).filter((v) => v && v !== 'SKIP');
  let token: string;
  try { token = await getYtAccessToken(lang); } catch (e) { console.log(`${lang}: ${(e as Error).message}`); continue; }

  const chR = await fetch('https://www.googleapis.com/youtube/v3/channels?part=status,snippet,brandingSettings&mine=true', { headers: { Authorization: `Bearer ${token}` } });
  const ch = (await chR.json()).items?.[0];
  console.log(`\n=== ${lang} :: ${ch?.snippet?.title} ===`);
  console.log('  canal status:', JSON.stringify(ch?.status));

  if (ids.length) {
    const vR = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids.join(',')}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await vR.json();
    const vids = j.items || [];
    let ok = 0, flagged = 0;
    for (const v of vids) {
      const s = v.status;
      const bad = s.uploadStatus !== 'processed' || s.rejectionReason || s.failureReason;
      if (bad) { flagged++; console.log(`  ⚠️ ${v.id}: upload=${s.uploadStatus} ${s.rejectionReason ? 'REJECT=' + s.rejectionReason : ''} ${s.failureReason ? 'FAIL=' + s.failureReason : ''} priv=${s.privacyStatus}`); }
      else ok++;
    }
    console.log(`  videos: ${ok} OK, ${flagged} con marca/rechazo (de ${vids.length})`);
    if (vids[0]) console.log('  ejemplo status:', JSON.stringify(vids[0].status));
  }
}
