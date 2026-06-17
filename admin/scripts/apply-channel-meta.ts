// Aplica al canal en YouTube la metadata de su channel_<slot>.json (descripción
// + keywords + país + idioma), incluida la línea de TikTok. Sirve para cualquier
// slot (faceless, Signal, etc.), a diferencia de yt-setup.ts (solo SabiKids).
// Uso: tsx scripts/apply-channel-meta.ts <slot>
import path from 'node:path';
import { updateChannel } from '../src/youtube/upload';
import { readJson } from '../src/lib/files';
import { ROOT } from '../src/config';

const slot = process.argv[2];
if (!slot) throw new Error('Uso: tsx scripts/apply-channel-meta.ts <slot>');
const meta = await readJson<any>(path.join(ROOT, 'data', 'youtube', `channel_${slot}.json`), null);
if (!meta) throw new Error(`falta channel_${slot}.json`);

await updateChannel(slot, {
  description: meta.description,
  keywords: meta.keywords,
  country: meta.country,
  defaultLanguage: meta.defaultLanguage,
});
console.log(`✅ ${slot}: metadata aplicada al canal (TikTok ${meta.tiktok || '—'}).`);
