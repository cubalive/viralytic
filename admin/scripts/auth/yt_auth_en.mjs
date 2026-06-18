// yt_auth.mjs — autoriza YouTube (subir + miniaturas) y guarda token POR CANAL.
// Uso:  node yt_auth.mjs <salida_token.json>   (ej: yt-token-es.json)
// Al abrir la URL, inicia sesión y ELIGE EL CANAL correcto (marca) de ese idioma.
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
const out = 'C:/Users/alain/.secrets/yt-token-en.json';
const c = JSON.parse(readFileSync('C:/Users/alain/.secrets/vertex-oauth-client.json','utf8')).web;
const REDIRECT = 'http://localhost:53682/oauth2callback';
const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';
const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(c.client_id)}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
console.log('\n==== ABRE ESTA URL, INICIA SESIÓN Y ELIGE EL CANAL DE ESTE IDIOMA ====\n\n' + url + '\n');
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/oauth2callback')) { res.end('ok'); return; }
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  const tok = await (await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ code, client_id:c.client_id, client_secret:c.client_secret, redirect_uri:REDIRECT, grant_type:'authorization_code' }) })).json();
  if (tok.refresh_token) writeFileSync(out, JSON.stringify({ refresh_token: tok.refresh_token, client_id:c.client_id, client_secret:c.client_secret }, null, 2));
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<h2>' + (tok.refresh_token ? 'OK Canal conectado. Cierra la pestana.' : ('Error: '+(tok.error||'sin refresh_token'))) + '</h2>');
  console.log('RESULT token=' + out + ' refresh=' + (!!tok.refresh_token) + (tok.error?(' err='+tok.error):''));
  setTimeout(()=>process.exit(tok.refresh_token?0:1), 800);
});
server.listen(53682, () => console.log('esperando en :53682 ...'));
setTimeout(()=>{ console.log('TIMEOUT'); process.exit(1); }, 600000);
