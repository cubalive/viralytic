// Puente WEB → RENDER del vallenato: toma de Supabase los temas en 'generating'
// (subidos desde la pestaña /vallenato), baja canción + voz + letra, corre el
// motor gen-vallenato, sube el video final y marca 'ready'. El render usa
// python/ffmpeg local (por eso no corre en Vercel). Idempotente / reanudable.
// Uso:  tsx scripts/vallenato-pull.ts
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { ensureDir } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const exec = promisify(execFile);
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) throw new Error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en admin/.env');
const BUCKET = 'assets';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(method: string, q: string, body?: unknown): Promise<any> {
  const r = await fetch(`${SUPA}/rest/v1/${q}`, {
    method, headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`rest ${method} ${q}: ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json().catch(() => null);
}
async function download(storagePath: string, outFile: string): Promise<void> {
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${storagePath}`, { headers: H });
  if (!r.ok) throw new Error(`download ${storagePath}: ${r.status}`);
  fs.writeFileSync(outFile, Buffer.from(await r.arrayBuffer()));
}
async function upload(storagePath: string, file: string): Promise<void> {
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'video/mp4', 'x-upsert': 'true' }, body: fs.readFileSync(file),
  });
  if (!r.ok) throw new Error(`upload ${storagePath}: ${r.status} ${(await r.text()).slice(0, 120)}`);
}

const pending = await rest('GET', 'mv_songs?artist=eq.vallenato&status=eq.generating&select=id,title,lyrics,track_path,stem_path&order=created_at.asc');
if (!pending?.length) { console.log('vallenato-pull: nada en generating.'); process.exit(0); }

for (const s of pending) {
  const id = s.id;
  if (!s.lyrics || !s.track_path || !s.stem_path) { log.warn(`${id}: intake incompleto, salto`); continue; }
  log.step(`Render vallenato "${s.title}" (${id})`);
  const dir = path.join(ROOT, 'data', 'vallenato', id);
  await ensureDir(dir);
  try {
    await rest('PATCH', `mv_songs?id=eq.${id}&status=eq.generating`, { status: 'rendering' }); // claim
    await download(s.track_path, path.join(dir, 'song.wav'));
    await download(s.stem_path, path.join(dir, 'vocal.wav'));
    fs.writeFileSync(path.join(dir, 'lyrics.txt'), s.lyrics, 'utf8');

    await exec('npx', ['tsx', 'scripts/gen-vallenato.ts', id], { cwd: ROOT, maxBuffer: 1 << 26 });

    const video = path.join(dir, 'video.mp4');
    if (!fs.existsSync(video)) throw new Error('el motor no produjo video.mp4');
    const finalPath = `mv/vallenato/${id}/final.mp4`;
    await upload(finalPath, video);
    await rest('PATCH', `mv_songs?id=eq.${id}`, {
      status: 'ready', final_path: finalPath,
      metadata: { title: s.title, tags: ['vallenato', 'música vallenata', 'vallenatos', 'romántico'] },
    });
    log.ok(`✅ ${s.title} → listo (${finalPath})`);
  } catch (e) {
    await rest('PATCH', `mv_songs?id=eq.${id}`, { status: 'failed', metadata: { error: (e as Error).message.slice(0, 300) } }).catch(() => {});
    log.err(`${id}: ${(e as Error).message.slice(0, 160)}`);
  }
}
console.log('\n✅ vallenato-pull terminado.');
