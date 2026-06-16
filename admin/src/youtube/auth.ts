import http from 'node:http';
import path from 'node:path';
import { exec } from 'node:child_process';
import { config, ROOT } from '../config';
import { ensureDir, writeJson, readJson } from '../lib/files';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];
const TOKDIR = path.join(ROOT, 'data', 'youtube', 'tokens');

export function authUrl(): string {
  const p = new URLSearchParams({
    client_id: config.youtube.clientId,
    redirect_uri: config.youtube.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/auth?${p}`;
}

async function exchange(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<any>;
}

/** Corre el login OAuth (loopback) y guarda el refresh_token del canal. */
export function runAuthFlow(channel: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url || '/', 'http://localhost:8088');
      if (u.pathname !== '/oauth2callback') { res.end('ok'); return; }
      const code = u.searchParams.get('code');
      res.end('✅ Autorización recibida. Ya puedes cerrar esta pestaña.');
      server.close();
      if (!code) return reject(new Error('Sin code en el callback'));
      try {
        const tok = await exchange({
          code,
          client_id: config.youtube.clientId,
          client_secret: config.youtube.clientSecret,
          redirect_uri: config.youtube.redirectUri,
          grant_type: 'authorization_code',
        });
        await ensureDir(TOKDIR);
        await writeJson(path.join(TOKDIR, `${channel}.json`), tok);
        resolve(tok);
      } catch (e) { reject(e); }
    });
    server.listen(8088, () => {
      const url = authUrl();
      console.log(`\n► Autoriza el canal "${channel}". Abriendo el navegador…`);
      console.log(`(si no abre, pega esta URL):\n${url}\n`);
      exec(`start "" "${url}"`, () => {}); // Windows
    });
  });
}

/** Devuelve un access token fresco para el canal (usando su refresh_token). */
export async function getYtAccessToken(channel: string): Promise<string> {
  const tok = await readJson<any>(path.join(TOKDIR, `${channel}.json`), null);
  if (!tok?.refresh_token) throw new Error(`Sin token para "${channel}" — corre: npm run yt-auth -- ${channel}`);
  const d = await exchange({
    refresh_token: tok.refresh_token,
    client_id: config.youtube.clientId,
    client_secret: config.youtube.clientSecret,
    grant_type: 'refresh_token',
  });
  return d.access_token;
}
