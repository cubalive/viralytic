import fsp from 'node:fs/promises';
import { getYtAccessToken } from './auth';

async function ytGet(channel: string, url: string) {
  const token = await getYtAccessToken(channel);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

/** Devuelve el canal autorizado (id + título). */
export async function getMyChannel(channel: string): Promise<{ id: string; title: string }> {
  const j = await ytGet(channel, 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true');
  const it = j.items?.[0];
  if (!it) throw new Error('No se encontró canal (¿autorizaste la cuenta/canal correcto?)');
  return { id: it.id, title: it.snippet?.title };
}

/** Rellena descripción + tags + país + idioma del canal (channels.update / brandingSettings). */
export async function updateChannel(channel: string, meta: { description: string; keywords: string[]; country?: string; defaultLanguage?: string }) {
  const ch = await getMyChannel(channel);
  const keywords = meta.keywords.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' ');
  const chBranding: any = { description: meta.description, keywords };
  if (meta.country) chBranding.country = meta.country;
  if (meta.defaultLanguage) chBranding.defaultLanguage = meta.defaultLanguage;
  const body = { id: ch.id, brandingSettings: { channel: chBranding } };
  const token = await getYtAccessToken(channel);
  const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`channels.update ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return ch;
}

export interface VideoMeta {
  title: string; description: string; tags: string[]; categoryId?: string; madeForKids?: boolean; file: string;
}

/** Sube un video. Si publishAt (ISO futuro), queda programado privado→público. */
export async function uploadVideo(channel: string, meta: VideoMeta, publishAt?: string): Promise<any> {
  const video = await fsp.readFile(meta.file);
  const status: any = { selfDeclaredMadeForKids: meta.madeForKids !== false };
  if (publishAt) { status.privacyStatus = 'private'; status.publishAt = publishAt; }
  else status.privacyStatus = 'public';
  const metadata = {
    snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId || '27' },
    status,
  };

  const boundary = `kidsstudio${Math.floor(Math.random() * 1e9)}`;
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(pre, 'utf8'), video, Buffer.from(post, 'utf8')]);

  const token = await getYtAccessToken(channel);
  const r = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`videos.insert ${r.status}: ${JSON.stringify(j).slice(0, 500)}`);
  return j;
}
