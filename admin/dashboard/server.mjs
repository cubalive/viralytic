// Admin de lujo (local) v3 — centrado en CANAL. Todos los proyectos, plegables,
// 16:9 separado de reels, badge conectado, subir+generar, PROGRAMAR a YouTube + CALENDARIO.
// Uso:  node dashboard/server.mjs   ->  http://localhost:8090
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REG = JSON.parse(fs.readFileSync(path.join(HERE, 'projects.json'), 'utf8'));
const PROJ = Object.fromEntries(REG.groups.flatMap(g => g.projects.map(p => [p.id, p])));
const CAL = path.join(ROOT, 'data', 'youtube', 'calendar.json');
const jobs = new Map(); let jid = 0;

const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const readCal = () => readJson(CAL, []);
const writeCal = (a) => fs.writeFileSync(CAL, JSON.stringify(a, null, 2), 'utf8');
const tokenExists = (p) => !!(p.ytToken && fs.existsSync(abs(p.ytToken)));
const isReelPath = (f, p) => /\/reels?\//i.test(f) || /\/(reel|short)_\d+\.mp4$/i.test(f) || p.kind === 'faceless';
const CRONF = path.join(ROOT, 'data', 'youtube', 'cron.json');
const authCmd = (p) => (p.kind && p.kind.indexOf('music-zuri') === 0) ? `node "scripts/auth/yt_auth_${p.lang}.mjs"` : (p.id === 'vallenato' ? 'npx tsx scripts/yt-auth.ts vallenato' : (p.id.indexOf('sabi-') === 0 ? `npx tsx scripts/yt-auth.ts ${p.lang}` : `npx tsx scripts/yt-auth.ts ${p.id}`));

function isProduct(name) {
  if (name === 'master_16x9.mp4' || name === 'video.mp4') return true;
  if (/^(reel|short)_\d+\.mp4$/.test(name)) return true;
  if (/^reel_(es|en|it|zh|pt|hi|pa)\.mp4$/.test(name)) return true;
  if (!/^reel_/i.test(name) && /_(ES|EN|ZH|IT|PT|HI|PA)\.mp4$/i.test(name)) return true;
  return false;
}
function listMp4(dir, filter) {
  const root = abs(dir); const out = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith('_') && e.name !== 'photos' && e.name !== 'clips' && e.name !== 'bumpers') walk(f); }
    else if (e.name.endsWith('.mp4') && (!filter || e.name.includes(filter)) && isProduct(e.name)) out.push(path.relative(ROOT, f).replace(/\\/g, '/')); } };
  walk(root); return out.sort().slice(0, 200);
}
function channelInfo(p) {
  const cfg = readJson(abs(p.channel || ''), {});
  const vids = listMp4(p.outputsDir, p.filter);
  return { id: p.id, name: p.name, handle: p.handle || cfg.handle || '', kind: p.kind, lang: p.lang, connected: tokenExists(p),
    title: cfg.title || p.name, description: cfg.description || p.desc || '', keywords: cfg.keywords || [],
    videos16: vids.filter(f => !isReelPath(f, p)), reels: vids.filter(f => isReelPath(f, p)), scheduled: readCal().filter(c => c.project === p.id) };
}
function parseMultipart(buf, boundary) {
  const fields = {}, files = {}; const bb = Buffer.from('--' + boundary);
  let s = buf.indexOf(bb); if (s < 0) return { fields, files }; s += bb.length;
  while (buf.slice(s, s + 2).toString() !== '--') {
    s += 2; const he = buf.indexOf('\r\n\r\n', s); if (he < 0) break;
    const hd = buf.slice(s, he).toString(); const nx = buf.indexOf(bb, he); if (nx < 0) break;
    const body = buf.slice(he + 4, nx - 2);
    const name = (hd.match(/name="([^"]*)"/) || [])[1]; const fn = (hd.match(/filename="([^"]*)"/) || [])[1];
    if (fn) files[name] = { filename: fn, data: body }; else if (name) fields[name] = body.toString('utf8');
    s = nx + bb.length;
  }
  return { fields, files };
}
function runJob(label, cmd, args, onDone) {
  const id = ++jid; const job = { log: [], done: false, code: null, label }; jobs.set(id, job);
  const p = spawn(cmd, args, { cwd: ROOT, env: process.env, shell: true });
  const push = (d) => { job.log.push(d.toString()); if (job.log.length > 500) job.log.shift(); };
  p.stdout.on('data', push); p.stderr.on('data', push);
  p.on('close', (c) => { job.code = c; job.done = true; job.log.push(`\n[exit ${c}]`); if (onDone) try { onDone(job.log.join(''), c); } catch (e) { job.log.push('onDone ' + e.message); } });
  p.on('error', (e) => { job.log.push('ERR ' + e.message); job.code = 1; job.done = true; });
  return id;
}
function freePorts(ports) { // mata listeners colgados de intentos de OAuth previos (evita EADDRINUSE)
  for (const p of ports) { try { execSync(`powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue; if($c){$c.OwningProcess|Select-Object -Unique|ForEach-Object{Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue}}"`, { stdio: 'ignore', timeout: 8000 }); } catch (e) {} }
}
function voiceStartOf(file) { // segundos hasta que entra la voz (primer fin de silencio en el stem)
  let out = '';
  try { out = execSync(`ffmpeg -hide_banner -nostats -i "${file}" -af "silencedetect=noise=-35dB:d=0.5" -f null - 2>&1`, { timeout: 60000 }).toString(); }
  catch (e) { out = ((e.stdout || '') + (e.stderr || '')).toString(); }
  const m = out.match(/silence_end:\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}
function durationOf(file) { try { return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "${file}"`, { timeout: 20000 }).toString().trim()) || 0; } catch (e) { return 0; } }
function renderCaptionPreviews() { // quema el sample en cada estilo → data/caption_previews/<key>.png
  const cfg = readJson(path.join(ROOT, 'data', 'caption_styles.json'), { styles: [] });
  const pdir = path.join(ROOT, 'data', 'caption_previews'); fs.mkdirSync(pdir, { recursive: true });
  const sample = String(cfg.sample || 'borré tus mensajes').replace(/[\r\n]/g, ' ');
  const HEAD = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
  for (const s of (cfg.styles || [])) {
    const png = path.join(pdir, s.key + '.png');
    if (fs.existsSync(png) && fs.statSync(png).size > 1000) continue;
    const ass = HEAD + s.style + '\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:05.00,K,,0,0,0,,{\\an5}' + sample + '\n';
    fs.writeFileSync(path.join(pdir, '_s.ass'), ass, 'utf8');
    try { execSync(`ffmpeg -y -f lavfi -i color=c=0x12121c:s=1920x1080:d=1 -vf "subtitles=_s.ass" -frames:v 1 -s 854x480 "${s.key}.png"`, { cwd: pdir, stdio: 'ignore', timeout: 30000 }); } catch (e) {}
  }
}
const ext = (fn) => (path.extname(fn || '') || '.bin').toLowerCase();
const sib = (file, name) => { const f = path.join(ROOT, path.dirname(file), name); return fs.existsSync(f) ? f : null; };

// ===== Autenticación (sesión firmada por cookie) =====
function authSecret() {
  const CFGF = path.join(ROOT, 'data', 'admin_config.json'); const cur = readJson(CFGF, {});
  if (!cur.sessionSecret) { cur.sessionSecret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(CFGF, JSON.stringify(cur, null, 2)); }
  return cur.sessionSecret;
}
function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + 7 * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyToken(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [payload, sig] = tok.split('.');
  if (crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url') !== sig) return null;
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString()); return p.exp > Date.now() ? p.u : null; } catch (e) { return null; }
}
const cookie = (req, n) => ((req.headers.cookie || '').split(';').map(s => s.trim()).find(x => x.startsWith(n + '=')) || '').split('=')[1] || null;
const LOGIN_PAGE = `<!doctype html><meta charset=utf-8><title>getvirality · entrar</title><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#0B0B0F;color:#eee;font-family:Segoe UI,system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{background:#15151d;border:1px solid #23232e;border-radius:16px;padding:30px;width:330px}h1{margin:0 0 4px;font-size:20px;font-style:italic;background:linear-gradient(90deg,#FF0066,#00E5FF);-webkit-background-clip:text;color:transparent}
label{display:block;font-size:12px;color:#9aa;margin:12px 0 4px}input{width:100%;padding:10px;border-radius:9px;border:1px solid #2a2a36;background:#0e0e14;color:#fff;box-sizing:border-box}
button{width:100%;margin-top:16px;padding:11px;border:0;border-radius:10px;background:linear-gradient(90deg,#FF0066,#c0004e);color:#fff;font-weight:700;cursor:pointer}small{color:#ff6b6b}</style>
<div class=box><h1>getvirality · admin</h1><small style="color:#9aa">Inicia sesión para continuar</small>
<label>Email</label><input id=e type=email autofocus><label>Contraseña</label><input id=p type=password>
<button onclick="go()">Entrar</button><div id=m style="margin-top:10px"></div></div>
<script>async function go(){const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.value.trim(),password:p.value})});const j=await r.json();if(j.ok)location.href='/';else m.innerHTML='<small>'+(j.error||'error')+'</small>';}
document.addEventListener('keydown',ev=>{if(ev.key==='Enter')go();});</script>`;

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    // login (público)
    if (req.method === 'POST' && u.pathname === '/api/login') {
      const chk = []; for await (const c of req) chk.push(c); const b = JSON.parse(Buffer.concat(chk).toString() || '{}');
      const cfg = readJson(path.join(ROOT, 'data', 'admin_config.json'), {});
      const h = crypto.createHash('sha256').update(b.password || '').digest('hex');
      let user = null;
      if (cfg.passHash && h === cfg.passHash) user = 'admin';
      else { const usr = (cfg.users || []).find(x => (x.email === b.email || x.name === b.email) && x.passHash === h); if (usr) user = usr.name; }
      if (!user) return json(res, { error: 'Email o contraseña incorrectos' }, 401);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `sid=${makeToken(user)}; Path=/; HttpOnly; Max-Age=604800; SameSite=Lax` });
      return res.end(JSON.stringify({ ok: true, user }));
    }
    if (u.pathname === '/api/logout') { res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'sid=; Path=/; Max-Age=0' }); return res.end('{"ok":true}'); }
    // gate: todo lo demás requiere sesión
    if (!verifyToken(cookie(req, 'sid'))) {
      if (u.pathname === '/' || u.pathname === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(LOGIN_PAGE); }
      if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/file') || u.pathname.startsWith('/captionpreview')) return json(res, { error: 'no autenticado' }, 401);
      res.writeHead(302, { Location: '/' }); return res.end();
    }
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
    if (u.pathname === '/api/projects') return json(res, { groups: REG.groups.map(g => ({ key: g.key, title: g.title, projects: g.projects.map(p => ({ id: p.id, name: p.name, handle: p.handle, kind: p.kind, lang: p.lang, desc: p.desc, cmd: !!p.cmd, char: p.char || (p.kind === 'music-zuri' ? 'zuri' : null), connected: tokenExists(p), videos: listMp4(p.outputsDir, p.filter).length })) })) });
    if (u.pathname === '/api/channel') { const p = PROJ[u.searchParams.get('id')]; return p ? json(res, channelInfo(p)) : json(res, { error: 'no' }, 404); }
    if (u.pathname === '/api/calendar') {
      const id = u.searchParams.get('id'); const local = readCal().filter(c => !id || c.project === id);
      const ytf = id ? path.join(ROOT, 'data', 'youtube', `ytcal_${id}.json`) : null;
      const yt = ytf && fs.existsSync(ytf) ? (readJson(ytf, { items: [] }).items || []) : [];
      const ytIds = new Set(yt.map(v => v.id));
      const items = yt.filter(v => v.publishAt || v.privacy === 'public').map(v => ({ title: v.title, when: v.publishAt || v.publishedAt, privacy: v.privacy, url: v.url, source: 'youtube' }))
        .concat(local.filter(c => !ytIds.has(c.videoId)).map(c => ({ title: c.title, when: c.when, privacy: c.privacy, url: c.url, source: 'local' })));
      return json(res, { items, synced: !!yt.length });
    }
    if (u.pathname === '/api/ytsync') {
      const p = PROJ[u.searchParams.get('id')]; if (!p) return json(res, { error: 'no project' }, 400);
      if (!tokenExists(p)) return json(res, { error: 'canal sin conectar' }, 400);
      const outc = path.join(ROOT, 'data', 'youtube', `ytcal_${p.id}.json`);
      const jb = runJob(`sync ${p.id}`, 'python', ['py/yt_sync.py', abs(p.ytToken), outc]);
      return json(res, { job: jb });
    }
    if (u.pathname === '/api/statsync') { const p = PROJ[u.searchParams.get('id')]; if (!p || !tokenExists(p)) return json(res, { error: 'canal sin conectar' }, 400); const jb = runJob(`stats ${p.id}`, 'python', ['py/yt_stats.py', abs(p.ytToken), path.join(ROOT, 'data', 'youtube', `stats_${p.id}.json`)]); return json(res, { job: jb }); }
    if (u.pathname === '/api/stats') { const id = u.searchParams.get('id'); return json(res, readJson(path.join(ROOT, 'data', 'youtube', `stats_${id}.json`), { top: [], all: [] })); }
    if (u.pathname === '/api/accounts') { return json(res, readJson(path.join(ROOT, 'data', 'youtube', 'accounts.json'), { syncedAt: null, totals: {}, channels: [] })); }
    if (u.pathname === '/api/accountsync') { const jb = runJob('accounts', 'python', ['py/yt_accounts_all.py']); return json(res, { job: jb }); }
    if (u.pathname === '/api/mvstatus') { return json(res, readJson(path.join(ROOT, 'data', 'youtube', 'mv_status.json'), { syncedAt: null, totals: {}, channels: [] })); }
    if (u.pathname === '/api/mvstatussync') { const jb = runJob('mvstatus', 'python', ['py/mv_status.py']); return json(res, { job: jb }); }
    if (u.pathname === '/api/job') { const j = jobs.get(Number(u.searchParams.get('id'))); return j ? json(res, { done: j.done, code: j.code, log: j.log.join('') }) : json(res, { error: 'no job' }, 404); }
    if (u.pathname === '/file') { const rel = u.searchParams.get('p') || ''; const a = path.join(ROOT, rel); if (!a.startsWith(ROOT) || !a.endsWith('.mp4') || !fs.existsSync(a)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'video/mp4' }); return fs.createReadStream(a).pipe(res); }
    if (req.method === 'POST' && u.pathname === '/api/upload') {
      const m = (req.headers['content-type'] || '').match(/boundary=(.+)$/); if (!m) return json(res, { error: 'no boundary' }, 400);
      const ch = []; for await (const c of req) ch.push(c); const { fields, files } = parseMultipart(Buffer.concat(ch), m[1]);
      const p = PROJ[fields.project]; const slug = (fields.slug || '').trim().replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
      if (!p || !slug) return json(res, { error: 'falta proyecto o slug' }, 400);
      if (p.kind === 'music-vallenato') {
        const dir = path.join(ROOT, 'data', 'vallenato', slug); fs.mkdirSync(dir, { recursive: true });
        if (files.track) fs.writeFileSync(path.join(dir, 'song' + ext(files.track.filename)), files.track.data);
        if (files.vocal) fs.writeFileSync(path.join(dir, 'vocal' + ext(files.vocal.filename)), files.vocal.data);
        if (files.lyrics) fs.writeFileSync(path.join(dir, 'lyrics.txt'), files.lyrics.data);
        if (files.frameintro) fs.writeFileSync(path.join(dir, 'intro' + ext(files.frameintro.filename)), files.frameintro.data);
        if (files.frame1) fs.writeFileSync(path.join(dir, 'frame1' + ext(files.frame1.filename)), files.frame1.data);
        if (files.frame2) fs.writeFileSync(path.join(dir, 'frame2' + ext(files.frame2.filename)), files.frame2.data);
        if (fields.introprompt) fs.writeFileSync(path.join(dir, 'intro_prompt.txt'), fields.introprompt);
        if (fields.introneg) fs.writeFileSync(path.join(dir, 'intro_neg.txt'), fields.introneg);
        if (fields.introdur) fs.writeFileSync(path.join(dir, 'intro_dur.txt'), fields.introdur);
        if (fields.loopprompt) fs.writeFileSync(path.join(dir, 'loop_prompt.txt'), fields.loopprompt);
        if (fields.loopneg) fs.writeFileSync(path.join(dir, 'loop_neg.txt'), fields.loopneg);
        if (fields.loopdur) fs.writeFileSync(path.join(dir, 'loop_dur.txt'), fields.loopdur);
        if (fields.wave_on != null) fs.writeFileSync(path.join(dir, 'wave.json'), JSON.stringify({ on: fields.wave_on === '1', size: fields.wave_size || 'medium', pos: fields.wave_pos || 'bottom' }));
        if (fields.title) fs.writeFileSync(path.join(dir, 'title.txt'), fields.title);
        if (fields.artist) fs.writeFileSync(path.join(dir, 'artist.txt'), fields.artist);
        return json(res, { ok: true });
      }
      if (p.kind === 'music-zuri') {
        const dir = path.join(ROOT, 'data', 'songs', slug); fs.mkdirSync(dir, { recursive: true });
        const tr = 'track' + ext(files.track?.filename), vo = 'vocal' + ext(files.vocal?.filename);
        if (files.track) fs.writeFileSync(path.join(dir, tr), files.track.data);
        if (files.vocal) fs.writeFileSync(path.join(dir, vo), files.vocal.data);
        const song = { id: slug, title: fields.title || slug, lang: p.lang, audioPath: path.join(dir, tr).replace(/\\/g, '/'), vocalStemPath: path.join(dir, vo).replace(/\\/g, '/'), lyrics: files.lyrics ? files.lyrics.data.toString('utf8') : '', characters: ['zuri'], setting: 'Bosque mágico de Zuri (banco).', scenes: [] };
        fs.writeFileSync(path.join(dir, 'song.json'), JSON.stringify(song, null, 2), 'utf8');
        return json(res, { ok: true });
      }
      return json(res, { error: 'sin subida' }, 400);
    }
    if (req.method === 'POST' && u.pathname === '/api/generate') {
      const ch = []; for await (const c of req) ch.push(c); const b = JSON.parse(Buffer.concat(ch).toString() || '{}');
      const p = PROJ[b.id]; if (!p) return json(res, { error: 'no project' }, 400);
      const slug = (b.slug || '').trim(); const n = Math.max(1, Math.min(20, Number(b.n) || 5));
      let id;
      if (p.kind === 'music-vallenato') id = runJob(`vallenato ${slug}`, 'npx', ['tsx', 'scripts/gen-vallenato.ts', slug]);
      else if (p.kind === 'music-zuri') id = runJob(`zuri ${slug}`, 'cmd', ['/c', `python py\\zuri_music.py ${slug} && python py\\zuri_meta.py ${slug} && python py\\reel_from_master.py ${p.lang} ${slug} 3 24`]);
      else if (p.cmd) id = runJob(`${p.id} x${n}`, 'cmd', ['/c', p.cmd.replace('{n}', n)]);
      else return json(res, { error: 'sin comando' }, 400);
      return json(res, { job: id });
    }
    if (req.method === 'POST' && u.pathname === '/api/schedule') {
      const ch = []; for await (const c of req) ch.push(c); const b = JSON.parse(Buffer.concat(ch).toString() || '{}');
      const p = PROJ[b.id]; if (!p) return json(res, { error: 'no project' }, 400);
      if (!tokenExists(p)) return json(res, { error: 'canal no conectado — falta el token (' + (p.ytToken || '') + ')' }, 400);
      const tok = abs(p.ytToken);
      const vid = path.join(ROOT, b.file || ''); if (!vid.startsWith(ROOT) || !vid.endsWith('.mp4') || !fs.existsSync(vid)) return json(res, { error: 'video inválido' }, 400);
      const when = (b.when && b.when !== 'now') ? new Date(b.when).toISOString() : 'now';
      const title = b.title || path.basename(b.file, '.mp4');
      const desc = sib(b.file, `${p.lang}_desc.txt`) || '-'; const tags = sib(b.file, `${p.lang}_tags.txt`) || '-'; const thumb = sib(b.file, `${p.lang}_thumb.png`) || '';
      const id = runJob(`programar ${p.id}`, 'python', ['py/yt_schedule.py', tok, vid, when, p.lang, title, desc, tags, thumb], (log, code) => {
        const m = log.match(/\{"id".*?\}/); if (code === 0 && m) { const r = JSON.parse(m[0]); const cal = readCal(); cal.push({ project: p.id, channel: p.name, file: b.file, videoId: r.id, url: r.url, when: when === 'now' ? new Date().toISOString() : when, privacy: r.privacy, title, ts: new Date().toISOString() }); writeCal(cal); }
      });
      return json(res, { job: id });
    }
    if (u.pathname === '/api/connections') { const wk = (readJson(path.join(ROOT, 'data', 'weekly.json'), { channels: {} }).channels) || {}; return json(res, { groups: REG.groups.map(g => ({ title: g.title, projects: g.projects.map(p => ({ id: p.id, name: p.name, handle: p.handle || readJson(abs(p.channel || ''), {}).handle || '', lang: p.lang, connected: tokenExists(p), week: !!wk[p.id] })) })) }); }
    if (req.method === 'POST' && u.pathname === '/api/genweek') { const p = PROJ[u.searchParams.get('id')]; if (!p) return json(res, { error: 'no project' }, 400); if (!tokenExists(p)) return json(res, { error: 'canal sin conectar' }, 400); const jb = runJob(`semana ${p.id}`, 'python', ['py/gen_week.py', p.id]); return json(res, { job: jb }); }
    if (u.pathname === '/api/cron') {
      if (req.method === 'POST') { const ch = []; for await (const c of req) ch.push(c); const b = JSON.parse(Buffer.concat(ch).toString() || '{}'); fs.writeFileSync(CRONF, JSON.stringify({ enabled: !!b.enabled }, null, 2)); return json(res, { enabled: !!b.enabled }); }
      return json(res, readJson(CRONF, { enabled: false }));
    }
    if (req.method === 'POST' && u.pathname === '/api/connect') { const p = PROJ[u.searchParams.get('id')]; if (!p) return json(res, { error: 'no project' }, 400); freePorts([8088, 53682]); const jb = runJob(`conectar ${p.id}`, 'cmd', ['/c', authCmd(p)]); return json(res, { job: jb }); }
    if (req.method === 'POST' && u.pathname === '/api/newchannel') {
      const chk = []; for await (const c of req) chk.push(c); const b = JSON.parse(Buffer.concat(chk).toString() || '{}');
      const cid = (b.id || '').trim().replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
      if (!cid || !b.name || !b.type) return json(res, { error: 'faltan datos (tipo, id, nombre)' }, 400);
      const jb = runJob(`canal nuevo ${cid}`, 'python', ['py/new_channel.py', b.type, cid, b.lang || 'es', b.name, b.handle || '', b.niche || '']);
      return json(res, { job: jb });
    }
    if (u.pathname === '/api/config') {
      const CFGF = path.join(ROOT, 'data', 'admin_config.json');
      if (req.method === 'POST') {
        const chk = []; for await (const c of req) chk.push(c); const b = JSON.parse(Buffer.concat(chk).toString() || '{}');
        const cur = readJson(CFGF, { roles: ['superadmin', 'manager', 'editor'] });
        if (b.password) cur.passHash = crypto.createHash('sha256').update(b.password).digest('hex');
        if (Array.isArray(b.roles)) cur.roles = b.roles;
        fs.writeFileSync(CFGF, JSON.stringify(cur, null, 2)); return json(res, { ok: true, hasPass: !!cur.passHash, roles: cur.roles });
      }
      const cur = readJson(CFGF, { roles: ['superadmin', 'manager', 'editor'] }); return json(res, { hasPass: !!cur.passHash, roles: cur.roles || ['superadmin', 'manager', 'editor'] });
    }
    if (u.pathname === '/api/users') {
      const CFGF = path.join(ROOT, 'data', 'admin_config.json'); const cur = readJson(CFGF, {});
      const pub = (list) => (list || []).map(x => ({ name: x.name, email: x.email || '', role: x.role, createdAt: x.createdAt || '' }));
      if (req.method === 'POST') { const chk = []; for await (const c of req) chk.push(c); const b = JSON.parse(Buffer.concat(chk).toString() || '{}');
        cur.users = cur.users || [];
        if (b.del) { cur.users = cur.users.filter(x => x.name !== b.del); fs.writeFileSync(CFGF, JSON.stringify(cur, null, 2)); return json(res, { users: pub(cur.users) }); }
        if (b.name && b.role) {
          const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
          const pwd = Array.from(crypto.randomBytes(12)).map(x => CH[x % CH.length]).join('');
          const passHash = crypto.createHash('sha256').update(pwd).digest('hex');
          cur.users = cur.users.filter(x => x.name !== b.name).concat([{ name: b.name, email: (b.email || '').trim(), role: b.role, passHash, createdAt: new Date().toISOString() }]);
          fs.writeFileSync(CFGF, JSON.stringify(cur, null, 2));
          return json(res, { users: pub(cur.users), password: pwd, name: b.name, email: (b.email || '').trim() });
        }
        return json(res, { users: pub(cur.users) }); }
      return json(res, { users: pub(cur.users) });
    }
    if (u.pathname === '/api/costs') {
      const USAGEF = path.join(ROOT, 'data', 'usage.jsonl');
      let rows = [];
      try { rows = fs.readFileSync(USAGEF, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch (e) {}
      const D30 = Date.now() - 30 * 864e5;
      const byProject = {}, byProvider = {}, byKind = {}, byDay = {}; let total = 0, total30 = 0;
      for (const r of rows) {
        const usd = +r.usd || 0; total += usd; if ((Date.parse(r.ts) || 0) >= D30) total30 += usd;
        const bump = (m, k) => { m[k] = m[k] || { usd: 0, calls: 0 }; m[k].usd += usd; m[k].calls++; };
        bump(byProject, r.project || '?'); bump(byProvider, r.provider || '?'); bump(byKind, r.kind || '?');
        const day = (r.ts || '').slice(0, 10); byDay[day] = (byDay[day] || 0) + usd;
      }
      const bal = readJson(path.join(ROOT, 'data', 'balances.json'), { providers: [] });
      const balances = (bal.providers || []).map(p => { const sp = (byProvider[p.key] || {}).usd || 0; return { key: p.key, label: p.label, note: p.note || '', credit: +(p.credit || 0), spent: +sp.toFixed(4), remaining: +((p.credit || 0) - sp).toFixed(4) }; });
      const mapArr = (m, kn) => Object.entries(m).map(([k, v]) => ({ [kn]: k, name: (PROJ[k] || {}).name || k, usd: +v.usd.toFixed(4), calls: v.calls })).sort((a, b) => b.usd - a.usd);
      const days = Object.entries(byDay).map(([d, v]) => ({ day: d, usd: +v.toFixed(4) })).sort((a, b) => a.day < b.day ? 1 : -1).slice(0, 30);
      return json(res, { total: +total.toFixed(4), total30: +total30.toFixed(4), count: rows.length, projects: mapArr(byProject, 'id'), providers: mapArr(byProvider, 'key'), kinds: mapArr(byKind, 'kind'), days, balances });
    }
    if (u.pathname === '/api/balances') {
      const BF = path.join(ROOT, 'data', 'balances.json');
      if (req.method === 'POST') { const chk = []; for await (const c of req) chk.push(c); const b = JSON.parse(Buffer.concat(chk).toString() || '{}'); const cur = readJson(BF, { providers: [] }); if (Array.isArray(b.providers)) cur.providers = b.providers; fs.writeFileSync(BF, JSON.stringify(cur, null, 2)); return json(res, { ok: true, providers: cur.providers }); }
      return json(res, readJson(BF, { providers: [] }));
    }
    if (u.pathname === '/api/pricing') {
      const PF = path.join(ROOT, 'data', 'pricing.json');
      if (req.method === 'POST') { const chk = []; for await (const c of req) chk.push(c); const b = JSON.parse(Buffer.concat(chk).toString() || '{}'); fs.writeFileSync(PF, JSON.stringify(b, null, 2)); return json(res, { ok: true }); }
      return json(res, readJson(PF, {}));
    }
    if (u.pathname === '/api/voicestart') {
      let vfile = ''; const slug = u.searchParams.get('slug');
      if (req.method === 'POST' && !slug) {
        const m = (req.headers['content-type'] || '').match(/boundary=(.+)$/);
        const ch = []; for await (const c of req) ch.push(c);
        const { files } = parseMultipart(Buffer.concat(ch), m ? m[1] : '');
        if (files.vocal) { const tmp = path.join(ROOT, 'data', '_vs_tmp' + ext(files.vocal.filename)); fs.writeFileSync(tmp, files.vocal.data); vfile = tmp; }
      } else if (slug) {
        const dir = path.join(ROOT, 'data', 'vallenato', slug.replace(/[^a-z0-9\-_]/gi, '-'));
        vfile = ['vocal.wav', 'vocal.mp3'].map(f => path.join(dir, f)).find(p => fs.existsSync(p)) || '';
      }
      if (!vfile) return json(res, { error: 'sube/elige el stem de voz separada' }, 400);
      const start = voiceStartOf(vfile), total = durationOf(vfile);
      if (vfile.includes('_vs_tmp')) { try { fs.rmSync(vfile, { force: true }); } catch (e) {} }
      return json(res, { start: +start.toFixed(1), total: +total.toFixed(1) });
    }
    if (u.pathname === '/api/captionstyles') {
      renderCaptionPreviews();
      const cfg = readJson(path.join(ROOT, 'data', 'caption_styles.json'), { styles: [] });
      const cur = (readJson(path.join(ROOT, 'data', 'caption_style.json'), {}) || {}).vallenato || '';
      return json(res, { current: cur, styles: (cfg.styles || []).map(s => ({ key: s.key, label: s.label, font: s.font })) });
    }
    if (u.pathname === '/api/captionstyle' && req.method === 'POST') {
      const chk = []; for await (const c of req) chk.push(c); const b = JSON.parse(Buffer.concat(chk).toString() || '{}');
      const F = path.join(ROOT, 'data', 'caption_style.json'); const cur = readJson(F, {}); cur.vallenato = b.key; fs.writeFileSync(F, JSON.stringify(cur, null, 2)); return json(res, { ok: true, current: b.key });
    }
    if (u.pathname === '/captionpreview') {
      const key = (u.searchParams.get('key') || '').replace(/[^a-z0-9\-_]/gi, ''); const png = path.join(ROOT, 'data', 'caption_previews', key + '.png');
      if (fs.existsSync(png)) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(fs.readFileSync(png)); }
      res.writeHead(404); return res.end('no');
    }
    if (u.pathname === '/api/bank') {
      const char = u.searchParams.get('char') || 'zuri';
      const bank = readJson(path.join(ROOT, 'data', 'bank', char, 'bank.json'), { scenes: [] });
      return json(res, { char, scenes: (bank.scenes || []).map(s => ({ ...s, path: `data/bank/${char}/${s.file}` })) });
    }
    if (req.method === 'POST' && u.pathname === '/api/scene') {
      const m = (req.headers['content-type'] || '').match(/boundary=(.+)$/); if (!m) return json(res, { error: 'no boundary' }, 400);
      const ch = []; for await (const c of req) ch.push(c); const { fields, files } = parseMultipart(Buffer.concat(ch), m[1]);
      const char = fields.char || 'zuri'; const id = (fields.id || '').trim().replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
      if (!id) return json(res, { error: 'falta id/nombre' }, 400);
      if (!files.frame1 || !files.frame2) return json(res, { error: 'faltan los 2 frames (inicial y final)' }, 400);
      const wk = path.join(ROOT, 'data', 'bank', char, '_intake'); fs.mkdirSync(wk, { recursive: true });
      const f1 = path.join(wk, id + '_1.png'), f2 = path.join(wk, id + '_2.png');
      fs.writeFileSync(f1, files.frame1.data); fs.writeFileSync(f2, files.frame2.data);
      const pf = path.join(wk, id + '_p.txt'), nf = path.join(wk, id + '_n.txt');
      fs.writeFileSync(pf, fields.prompt || ''); fs.writeFileSync(nf, fields.neg || '');
      const jb = runJob(`escena ${char}/${id}`, 'python', ['py/veo_scene.py', char, id, fields.function || 'coro', fields.energy || 'energetica', fields.shot || 'medio', fields.tags || '', f1, f2, pf, nf]);
      return json(res, { job: jb });
    }
    res.writeHead(404); res.end('not found');
  } catch (e) { json(res, { error: String(e && e.message || e) }, 500); }
}).listen(8090, () => console.log('ADMIN de lujo v3 -> http://localhost:8090'));

const PAGE = `<!doctype html><meta charset=utf-8><title>getvirality · admin</title>
<style>
:root{--mag:#FF0066;--cyan:#00E5FF;--neon:#39FF14;--bg:#0B0B0F;--card:#15151d;--mut:#8a8a99}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#eee;font-family:Segoe UI,system-ui,sans-serif}
header{padding:16px 24px;border-bottom:1px solid #222;display:flex;gap:14px;align-items:center}
h1{margin:0;font-size:19px;font-style:italic;background:linear-gradient(90deg,var(--mag),var(--cyan));-webkit-background-clip:text;color:transparent}
.tabs{display:flex;gap:8px;flex:1;margin-left:18px}.tab{flex:1;text-align:center;background:#1a1a24;border:1px solid #2a2a36;color:#ccc;padding:9px 10px;border-radius:9px;cursor:pointer;font-size:13px}.tab.on{background:linear-gradient(90deg,var(--mag),#c0004e);color:#fff;border:0}
.wrap{padding:20px 24px;max-width:1200px;margin:auto}.hide{display:none}
.panel{background:var(--card);border:1px solid #23232e;border-radius:16px;padding:18px;margin:14px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:13px}
.card{background:var(--card);border:1px solid #23232e;border-radius:13px;padding:15px}.card:hover{border-color:var(--mag)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}
.ctbl{width:100%;border-collapse:collapse;font-size:13px}.ctbl td,.ctbl th{padding:7px 10px;border-bottom:1px solid #23232e;text-align:left}.ctbl th{color:#9aa;font-weight:600}.ctbl td.n{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:8px;border-radius:5px;background:linear-gradient(90deg,var(--mag),var(--cyan))}
.cc{display:block;font-size:11px;color:#9aa;text-align:right;margin-top:-4px;margin-bottom:6px}.cc.over{color:#ffb020;font-weight:600}.cc.bad{color:#ff6b6b;font-weight:700}
.card h3{margin:0 0 3px;font-size:14.5px}.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:20px;background:#23232e;color:var(--cyan);margin:3px 4px 0 0}
.btn{background:linear-gradient(90deg,var(--mag),#c0004e);color:#fff;border:0;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer;font-size:12.5px}.btn.g{background:#23232e}.btn:disabled{opacity:.5}
label{display:block;font-size:12px;color:var(--mut);margin:9px 0 4px}input,select{width:100%;background:#0e0e15;border:1px solid #2a2a36;color:#eee;border-radius:8px;padding:8px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}pre{background:#08080c;border:1px solid #1c1c26;border-radius:9px;padding:11px;max-height:240px;overflow:auto;font-size:12px;color:#9fe6b0;white-space:pre-wrap}
.grp{font-size:13px;color:var(--cyan);margin:16px 0 6px;cursor:pointer;user-select:none}.grp:before{content:'▾ '}
.fold.closed{display:none}.grp.cl:before{content:'▸ '}
.con{color:var(--neon)}.noc{color:#ff6b6b}
.vgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px}
.vcell{background:#12121a;border:1px solid #23232e;border-radius:9px;padding:6px;cursor:pointer;position:relative}.vcell:hover{border-color:var(--mag)}
.vcell video{width:100%;height:84px;object-fit:cover;border-radius:6px;background:#000;pointer-events:none}
.vcell .fn{font-size:10px;color:#bdbdc7;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vcell .dot{position:absolute;top:9px;right:9px;width:10px;height:10px;border-radius:50%;background:var(--neon);box-shadow:0 0 6px var(--neon)}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:50;align-items:center;justify-content:center}
.mbox{background:var(--card);border:1px solid var(--mag);border-radius:14px;padding:18px;max-width:680px;width:92%}
.mbox video{width:100%;border-radius:10px;background:#000;max-height:72vh}
.mx{float:right;background:#23232e;border:0;color:#fff;border-radius:7px;padding:4px 10px;cursor:pointer}
.cal td{border:1px solid #23232e;vertical-align:top;height:74px;width:14.2%;padding:4px;font-size:11px}.cal .d{color:var(--mut)}.ev{background:#1d1430;border-left:3px solid var(--mag);border-radius:5px;padding:2px 4px;margin-top:3px;font-size:10.5px}
small{color:var(--mut)}@media(max-width:760px){.vgrid{grid-template-columns:repeat(3,1fr)}}
</style>
<header><h1>getvirality · admin</h1>
<div class=tabs><div class=tab data-t=proj>Proyectos</div><div class=tab data-t=canal>Canales</div><div class=tab data-t=cal>Calendario</div><div class=tab data-t=banco>🎬 Crear escena</div><div class=tab data-t=conex>🔌 Conexiones</div><div class=tab data-t=config>⚙️ Configuración</div><div class=tab data-t=stats>📊 Stats</div><div class=tab data-t=cuentas>🏦 Cuentas</div><div class=tab data-t=gastos>💰 Gastos</div></div><a onclick="fetch('/api/logout').then(()=>location.href='/')" style="cursor:pointer;color:#9aa;font-size:12px;white-space:nowrap;margin-left:10px">Salir ⏻</a></header>
<div class=wrap>
 <section id=proj>
  <div class=panel><b>🎵 Subir canción y generar</b> <small>(pista + voz separada + letra .txt)</small>
   <div class=row><div><label>Proyecto</label><select id=mp></select></div><div><label>Slug / ID</label><input id=slug placeholder="ej: la-distancia"></div></div>
   <label>Título</label><input id=title>
   <div class=row><div><label>Pista (mp3/wav)</label><input id=track type=file accept=audio/*></div><div><label>Voz separada (mp3/wav)</label><input id=vocal type=file accept=audio/*></div></div>
   <label>Letra (.txt)</label><input id=lyrics type=file accept=.txt>
   <div id=vloop class=hide style="margin-top:12px;border-top:1px solid #23232e;padding-top:10px"><b style="font-size:13px">🎬 Visualizer</b> <small>(intro con el título → loop entre 2 imágenes hasta el final, y se repite el intro al cierre)</small>
    <div style="margin:9px 0;padding:8px;background:#15151d;border-radius:8px"><button type=button class="btn g" onclick="analyzeVoice()">📐 ¿Cuántos segundos hasta que entra la voz?</button> <span id=vsres><small>(selecciona arriba la Voz separada y púlsalo — te dice cuánto dura el instrumental del inicio)</small></span></div>
    <label>🖼️ Intro — imagen 1 (con el título + cantante) <small>(imagen o video corto; se anima ~5s o hasta que entra la voz)</small></label><input id=frameintro type=file accept="image/*,video/*">
    <div class=row><div><label>Loop · imagen A (inicio · 8s)</label><input id=frame1 type=file accept=image/*></div><div><label>Loop · imagen B (fin · 8s)</label><input id=frame2 type=file accept=image/*></div></div>
    <div style="margin-top:8px;padding:9px;background:#15151d;border-radius:8px">
     <b style="font-size:12px">✨ Animación de la INTRO (imagen 1)</b>
     <label>Prompt de movimiento</label><input id=introprompt placeholder="ej: zoom lento al título, partículas doradas, luz cálida que respira">
     <label>Prompt negativo</label><input id=introneg placeholder="texto extra, watermark, deformaciones, morphing">
     <label>Duración del clip Veo</label><select id=introdur style="width:auto"><option>4</option><option selected>6</option><option>8</option></select> <small>seg (igual que Veo)</small></div>
    <div style="margin-top:8px;padding:9px;background:#15151d;border-radius:8px">
     <b style="font-size:12px">🔁 Animación del LOOP (imagen A → imagen B)</b>
     <label>Prompt de movimiento</label><input id=loopprompt placeholder="ej: luces suaves que se mueven, bokeh, movimiento mínimo y algún detalle">
     <label>Prompt negativo</label><input id=loopneg placeholder="texto, watermark, deformaciones, manos raras, morphing, logos">
     <label>Duración del clip Veo</label><select id=loopdur style="width:auto"><option>4</option><option>6</option><option selected>8</option></select> <small>seg (igual que Veo)</small></div>
    <div style="margin-top:8px;padding:9px;background:#15151d;border-radius:8px">
     <b style="font-size:12px">🌊 Soundwave</b>
     <div style="margin:6px 0"><label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;margin:0"><input type=checkbox id=wave_on checked style="width:auto"> Incluir soundwave</label></div>
     <div class=row><div><label>Tamaño</label><select id=wave_size><option value=small>Pequeño</option><option value=medium selected>Mediano</option><option value=large>Grande</option></select></div><div><label>Posición</label><select id=wave_pos><option value=bottom selected>Abajo</option><option value=middle>En medio</option><option value=top>Arriba</option></select></div></div></div>
    <label>🎤 Nombre del cantante (opcional)</label><input id=artist placeholder="ej: Octavio Daza"> <small>(SOLO si quieres que el sistema lo superponga; si tu imagen de intro ya trae el título y el cantante, déjalo vacío)</small>
    <div style="margin-top:12px"><b style="font-size:13px">🅰️ Estilo de letra (captions)</b> <small>(elige cómo se ven quemadas — enfocado en música de adultos)</small><div id=capstyles class=cards style="margin-top:8px"></div></div></div>
   <div style="margin-top:12px"><button class=btn id=go>⬆️ Subir y generar</button> <button class="btn g" id=gen>⚙️ Generar (ya subí los archivos)</button> <span id=st><small></small></span></div>
   <pre id=log class=hide></pre><div id=genprev></div></div>
  <div id=groups></div>
 </section>
 <section id=canal class=hide>
  <div class=panel><label>Canal</label><select id=ch></select><div id=chinfo></div></div>
 </section>
 <section id=cal class=hide>
  <div class=panel><label>Calendario de</label><select id=calch></select> <button class="btn g" onclick="syncYT()">🔄 Sincronizar con YouTube</button> <span id=syncst></span><div id=calview></div></div>
 </section>
 <section id=banco class=hide>
  <div class=panel><b>🎬 Crear escena para el banco</b> <small>(Veo 3.1 first/last · mantiene el universo visual · va clasificada al banco)</small>
   <div class=row><div><label>Canal / personaje</label><select id=sc_char><option value=zuri>Zuri</option></select></div><div><label>Nombre / ID</label><input id=sc_id placeholder="ej: coro-giro-confeti"></div></div>
   <div class=row><div><label>Parte de la canción</label><select id=sc_func><option>intro</option><option selected>coro</option><option>verso</option><option>puente</option><option>outro</option></select></div><div><label>Energía</label><select id=sc_en><option>tierna</option><option>juguetona</option><option>soñadora</option><option selected>energetica</option><option>triunfal</option></select></div></div>
   <div class=row><div><label>Plano</label><input id=sc_shot placeholder="wide / medio / cenital / escenario"></div><div><label>Tags (coma)</label><input id=sc_tags placeholder="confeti, salto"></div></div>
   <label>Prompt (qué pasa / movimiento)</label><input id=sc_prompt>
   <label>Prompt negativo</label><input id=sc_neg placeholder="rosas en amigos, deformaciones, texto, watermark">
   <div class=row><div><label>Frame inicial (foto)</label><input id=sc_f1 type=file accept=image/*></div><div><label>Frame final (foto)</label><input id=sc_f2 type=file accept=image/*></div></div>
   <div style="margin-top:12px"><button class=btn id=sc_go>✨ Generar escena → banco</button> <span id=sc_st><small></small></span></div>
   <pre id=sc_log class=hide></pre></div>
  <div class=panel><b>🏦 Banco</b> <select id=sc_bankch style="width:auto;display:inline-block"><option value=zuri>Zuri</option></select><div id=sc_list></div></div>
 </section>
 <section id=conex class=hide>
  <div class=panel><b>⏱️ Cron automático</b> <small>(publica según cadencia + reprograma fallos · sincroniza con YouTube)</small>
   <div style="margin-top:10px"><label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><input type=checkbox id=cronck onchange="toggleCron()" style="width:auto"> <b id=cronlbl>cargando…</b></label></div></div>
  <div class=panel><b>➕ Crear canal nuevo</b> <small>(el sistema crea un motor adaptado + metadata 2026, listo para conectar y publicar)</small>
   <div class=row><div><label>Tipo de motor</label><select id=nc_type><option value=music>🎵 Videos musicales</option><option value=visualizer>🪗 Visualizer</option><option value=faceless>🎯 Faceless</option></select></div><div><label>Idioma</label><select id=nc_lang><option>es</option><option>en</option><option>zh</option><option>hi</option><option>pa</option><option>pt</option><option>it</option></select></div></div>
   <div class=row><div><label>ID (slug)</label><input id=nc_id placeholder="ej: zuri-de"></div><div><label>Nombre del canal</label><input id=nc_name></div></div>
   <div class=row><div><label>Handle</label><input id=nc_handle placeholder="@Canal"></div><div><label>Nicho / de qué va</label><input id=nc_niche placeholder="música infantil pop en alemán"></div></div>
   <div style="margin-top:10px"><button class=btn id=nc_go>✨ Crear canal</button> <span id=nc_st></span></div><pre id=nc_log class=hide></pre></div>
  <div class=panel><b>🔌 Canales</b> <small>(estado en vivo — conecta los que falten en zuripopstarchannel@gmail.com)</small><div id=conmsg></div><div id=conlist></div></div>
 </section>
 <section id=config class=hide>
  <div class=panel><b>🔒 Contraseña del admin</b><label>Nueva contraseña</label><input id=cf_pwd type=password><div style="margin-top:8px"><button class=btn onclick="savePwd()">Guardar contraseña</button> <span id=cf_pst></span></div></div>
  <div class=panel><b>👤 Roles y permisos</b><div id=cf_roles style="margin:8px 0"></div></div>
  <div class=panel><b>➕ Crear usuario</b>
   <div class=row><div><label>Nombre</label><input id=us_name></div><div><label>Email</label><input id=us_email type=email placeholder="usuario@correo.com"></div></div>
   <div class=row><div><label>Rol</label><select id=us_role><option value=superadmin>👑 superadmin</option><option value=manager>manager</option><option value=editor>editor</option></select></div><div></div></div>
   <div style="margin-top:8px"><button class=btn onclick="createUser()">Crear usuario</button></div>
   <div id=us_new></div>
   <div id=us_list style="margin-top:12px"></div></div>
 </section>
 <section id=stats class=hide>
  <div class=panel><label>Estadísticas de</label><select id=stch></select> <button class="btn g" onclick="statSync()">🔄 Sincronizar stats</button> <span id=stst></span><div id=stview></div></div>
 </section>
 <section id=cuentas class=hide>
  <div class=panel><b>🏦 Cuentas de YouTube</b> <small>(datos reales vía API)</small> <button class="btn g" onclick="accountSync()">🔄 Sincronizar todas</button> <span id=acst></span>
   <div id=actotals class=cards style="margin-top:12px"></div></div>
  <div class=panel><b>📊 Red de canales</b><div id=actable></div></div>
  <div id=accards></div>
  <div class=panel><b>🚂 Render (Railway / Supabase)</b> <small>(Caroline + lo que rinde el worker)</small> <button class="btn g" onclick="mvSync()">🔄 Sincronizar</button> <span id=mvst></span><div id=mvview></div></div>
 </section>
 <section id=gastos class=hide>
  <div id=costcards class=cards></div>
  <div class=panel><b>💳 Saldo por API</b> <small>(edita tu crédito real; el sistema resta lo gastado)</small><div id=balbox style="margin:8px 0"></div><button class=btn onclick="saveBalances()">Guardar saldos</button> <span id=balst></span></div>
  <div class=panel><b>📺 Costo por proyecto / canal</b><div id=costproj></div></div>
  <div class=panel><b>🧩 Costo por tipo y proveedor</b><div class=row><div id=costkind></div><div id=costprov></div></div></div>
  <div class=panel><b>📅 Gasto por día (últimos 30)</b><div id=costdays></div></div>
  <div class=panel><b>⚙️ Precios de las APIs</b> <small>(USD por unidad — ajústalos a tu plan real)</small><div id=pricebox style="margin:8px 0"></div><button class=btn onclick="savePricing()">Guardar precios</button> <span id=prst></span></div>
 </section>
</div>
<div id=modal class=modal onclick="if(event.target.id==='modal')closeVid()"></div>
<script>
let D={groups:[]},CH=null;const $=s=>document.querySelector(s);
const LC={es:'#E63946',en:'#1D9BF0',zh:'#E0245E',hi:'#FF9933',pa:'#8A2BE2',pt:'#2EC4B6',it:'#FFD60A',multi:'#9aa'};
const PERMS={superadmin:'Todo · control total',manager:'Proyectos · Canales · Calendario · Stats · Conexiones',editor:'Proyectos · Crear escena · Canales'};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');try{localStorage.setItem('tab',t.dataset.t);}catch(e){}for(const s of['proj','canal','cal','banco','conex','config','stats','cuentas','gastos'])$('#'+s).classList.toggle('hide',s!==t.dataset.t);if(t.dataset.t==='canal')loadChannel();if(t.dataset.t==='cal')loadCal();if(t.dataset.t==='banco')loadBank();if(t.dataset.t==='conex')loadConex();if(t.dataset.t==='config')loadConfig();if(t.dataset.t==='stats')loadStats();if(t.dataset.t==='cuentas'){loadAccounts();loadMv();}if(t.dataset.t==='gastos')loadCosts();});
document.querySelector('.tab').classList.add('on');
function opts(sel,withGroups){let h='';for(const g of D.groups){h+='<optgroup label="'+g.title.replace(/"/g,'')+'">';for(const p of g.projects){if(sel==='mp'&&!(p.kind&&p.kind.indexOf('music')===0))continue;h+='<option value="'+p.id+'">'+p.name+(p.connected?'':' (sin conectar)')+'</option>';}h+='</optgroup>';}return h;}
async function init(){D=await (await fetch('/api/projects')).json();
 $('#mp').innerHTML=opts('mp');$('#ch').innerHTML=opts('ch');$('#calch').innerHTML=opts('calch');$('#stch').innerHTML=opts('stch');
 const chars=[...new Set(D.groups.flatMap(g=>g.projects).filter(p=>p.kind==='music-zuri'&&p.char).map(p=>p.char))];
 const copt=chars.map(c=>'<option value="'+c+'">'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>').join('')||'<option value=zuri>Zuri</option>';
 if($('#sc_char'))$('#sc_char').innerHTML=copt;if($('#sc_bankch'))$('#sc_bankch').innerHTML=copt;
 if(typeof toggleVloop==='function')toggleVloop();
 let g=$('#groups');g.innerHTML='';
 D.groups.forEach((gr,gi)=>{g.innerHTML+='<div class=grp onclick="this.classList.toggle(\\'cl\\');this.nextElementSibling.classList.toggle(\\'closed\\')">'+gr.title+'</div><div class="grid fold" data-g="'+gi+'">'+gr.projects.map(p=>{
   const con=p.connected?'<span class=badge><span class=con>● conectado</span></span>':'<span class=badge><span class=noc>● sin conectar</span></span>';
   const a=p.cmd?'<button class="btn g" onclick="genN(\\''+p.id+'\\')">⚙️ Generar 5</button>':((p.kind&&p.kind.indexOf('music')===0)?'<small>sube canción ↑</small>':'<small>ver en Canales</small>');
   return '<div class=card><h3>'+p.name+'</h3><small>'+(p.handle||'')+'</small><div style="margin:6px 0">'+con+'<span class=badge>'+p.videos+' productos</span></div><p style="font-size:12px;color:#bdbdc7">'+p.desc+'</p>'+a+'</div>';}).join('')+'</div>';});
}
function poll(id,cb){fetch('/api/job?id='+id).then(r=>r.json()).then(r=>{$('#log').classList.remove('hide');$('#log').textContent=r.log||'';$('#log').scrollTop=9e9;if(!r.done)setTimeout(()=>poll(id,cb),1500);else{$('#st').innerHTML='<small>'+(r.code===0?'✅ listo':'⚠️ código '+r.code)+'</small>';$('#go').disabled=false;if(cb)cb(r);}});}
function projKind(id){for(const g of D.groups)for(const p of g.projects)if(p.id===id)return p.kind;return '';}
function toggleVloop(){const v=$('#vloop');if(!v)return;const show=projKind($('#mp').value)==='music-vallenato';v.classList.toggle('hide',!show);if(show&&!v.dataset.cs){v.dataset.cs=1;loadCaptionStyles();}}
let CAPCUR='';
async function loadCaptionStyles(){const box=$('#capstyles');if(!box)return;const r=await (await fetch('/api/captionstyles')).json();CAPCUR=r.current||'';box.innerHTML=(r.styles||[]).map(s=>'<div class=card style="cursor:pointer;padding:8px;'+(s.key===CAPCUR?'border-color:var(--mag);box-shadow:0 0 0 2px var(--mag)':'')+'" onclick="pickCaptionStyle(\\''+s.key+'\\')"><img src="/captionpreview?key='+s.key+'&v='+Date.now()+'" style="width:100%;border-radius:8px;display:block;background:#0c0c12"><div style="font-size:12px;margin-top:6px">'+(s.key===CAPCUR?'✅ ':'')+s.label+'</div></div>').join('');}
async function pickCaptionStyle(key){await fetch('/api/captionstyle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});CAPCUR=key;loadCaptionStyles();}
async function analyzeVoice(){const f=$('#vocal').files[0];if(!f)return alert('Primero selecciona arriba la Voz separada (mp3/wav)');$('#vsres').innerHTML='<small>analizando la voz…</small>';const fd=new FormData();fd.append('vocal',f);const r=await (await fetch('/api/voicestart',{method:'POST',body:fd})).json();if(r.error){$('#vsres').innerHTML='<small>❌ '+r.error+'</small>';return;}const s=r.start;const rec=s<3.5?4:(s<7?6:8);$('#vsres').innerHTML='<b style="color:var(--cyan)">🎤 La voz entra a los '+s+'s</b><br><small>Tienes <b>'+s+'s</b> de instrumental para tu intro. En el selector de la INTRO elige <b>'+rec+'</b>. El karaoke arranca solo a los '+s+'s.</small>';}
$('#mp').onchange=toggleVloop;
// Contador de caracteres para campos Veo (prompt + negativo). rec=recomendado, max=tope sugerido.
function attachCounter(id,rec,max){const el=$('#'+id);if(!el||el.dataset.cc)return;el.dataset.cc=1;const c=document.createElement('span');c.className='cc';el.insertAdjacentElement('afterend',c);const upd=()=>{const n=el.value.length;c.textContent=n+' / '+rec+' caracteres'+(n>max?' · ¡demasiado largo, recórtalo!':n>rec?' · recomendado ≤'+rec:'');c.className='cc'+(n>max?' bad':n>rec?' over':'');};el.addEventListener('input',upd);upd();}
['sc_prompt','introprompt','loopprompt'].forEach(id=>attachCounter(id,1000,2000));
['sc_neg','introneg','loopneg'].forEach(id=>attachCounter(id,400,800));
$('#go').onclick=async()=>{const id=$('#mp').value,slug=$('#slug').value.trim();if(!slug)return alert('pon slug');
 const fd=new FormData();fd.append('project',id);fd.append('slug',slug);fd.append('title',$('#title').value);for(const k of['track','vocal','lyrics']){const f=$('#'+k).files[0];if(f)fd.append(k,f);}
 if(projKind(id)==='music-vallenato'){for(const k of['frameintro','frame1','frame2']){const f=$('#'+k).files[0];if(f)fd.append(k,f);}for(const k of['introprompt','introneg','introdur','loopprompt','loopneg','loopdur','artist']){const el=$('#'+k);if(el&&el.value.trim())fd.append(k,el.value.trim());}if($('#wave_on')){fd.append('wave_on',$('#wave_on').checked?'1':'0');fd.append('wave_size',$('#wave_size').value);fd.append('wave_pos',$('#wave_pos').value);}}
 $('#go').disabled=true;$('#st').innerHTML='<small>subiendo…</small>';const up=await (await fetch('/api/upload',{method:'POST',body:fd})).json();
 if(up.error){$('#st').innerHTML='<small>❌ '+up.error+'</small>';$('#go').disabled=false;return;}$('#st').innerHTML='<small>generando…</small>';
 const gg=await (await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,slug})})).json();if(gg.error){$('#st').innerHTML='<small>❌ '+gg.error+'</small>';$('#go').disabled=false;return;}if(gg.job)poll(gg.job,()=>{init();showGenPreview(id,slug);});};
$('#gen').onclick=async()=>{const id=$('#mp').value,slug=$('#slug').value.trim();if(!slug)return alert('pon el slug que ya subiste (ej: la-silla-vacia)');$('#gen').disabled=true;$('#st').innerHTML='<small>generando (usando los archivos ya subidos)…</small>';
 const gg=await (await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,slug})})).json();
 if(gg.error){$('#st').innerHTML='<small>❌ '+gg.error+'</small>';$('#gen').disabled=false;return;}
 if(gg.job)poll(gg.job,()=>{$('#gen').disabled=false;init();showGenPreview(id,slug);});};
async function showGenPreview(id,slug){try{const c=await (await fetch('/api/channel?id='+id)).json();const vids=(c.videos16||[]).concat(c.reels||[]);if(!vids.length)return;const f=vids.find(v=>slug&&v.toLowerCase().includes(slug.toLowerCase()))||vids[vids.length-1];
 $('#genprev').innerHTML='<div class=panel><b>✅ Resultado — previsualización</b><video src="/file?p='+encodeURIComponent(f)+'" controls playsinline style="width:100%;max-width:760px;border-radius:10px;display:block;margin-top:8px;background:#000"></video><div style="margin-top:8px;font-size:12px">'+f.split('/').pop()+' <a href="/file?p='+encodeURIComponent(f)+'" target=_blank style="color:var(--cyan);margin-left:8px">abrir en pestaña</a> · <a onclick="[...document.querySelectorAll(\\'.tab\\')].find(x=>x.dataset.t===\\'canal\\').click()" style="cursor:pointer;color:var(--cyan)">ir a Canales para programar →</a></div></div>';}catch(e){}}
async function genN(id){const gg=await (await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,n:5})})).json();if(gg.job)poll(gg.job,init);}
function gridFor(arr){return arr.length?'<div class=vgrid>'+arr.map((f)=>{const sc=(CH.scheduled||[]).find(s=>s.file===f);return '<div class=vcell onclick="openVid(\\''+encodeURIComponent(f)+'\\')"><video src="/file?p='+encodeURIComponent(f)+'" preload=metadata muted></video><div class=fn>'+f.split('/').pop().replace('.mp4','')+'</div>'+(sc?'<span class=dot title="en cola/publicado"></span>':'')+'</div>';}).join('')+'</div>':'<small>—</small>';}
async function loadChannel(){const id=$('#ch').value;if(!id)return;CH=await (await fetch('/api/channel?id='+id)).json();const c=CH;
 const con=c.connected?'<span class=con>● conectado</span>':'<span class=noc>● sin conectar (falta login)</span>';
 $('#chinfo').innerHTML='<div class=panel style="margin-top:14px"><h3>'+c.name+' <small>'+(c.handle||'')+'</small> &nbsp; '+con+'</h3><p style="color:#bdbdc7;font-size:12.5px;white-space:pre-wrap">'+(c.description||'').slice(0,420)+'</p>'+(c.keywords||[]).slice(0,12).map(k=>'<span class=badge>'+k+'</span>').join('')+'</div>'
  +'<div class=grp onclick="this.classList.toggle(\\'cl\\');this.nextElementSibling.classList.toggle(\\'closed\\')">🎬 Videos 16:9 ('+c.videos16.length+')</div><div class=fold>'+gridFor(c.videos16)+'</div>'
  +'<div class=grp onclick="this.classList.toggle(\\'cl\\');this.nextElementSibling.classList.toggle(\\'closed\\')">⚡ Reels / Shorts ('+c.reels.length+')</div><div class=fold>'+gridFor(c.reels)+'</div>';
}
$('#ch').onchange=loadChannel;
function openVid(ef){const f=decodeURIComponent(ef);const id=CH&&CH.id;const sc=CH&&(CH.scheduled||[]).find(s=>s.file===f);
 const ctrl=!id?'':sc?'<div style="margin-top:10px"><b class=con>✅ '+(sc.privacy==='public'?'Publicado':'Programado')+'</b> · '+new Date(sc.when).toLocaleString('es')+' — <a href="'+sc.url+'" target=_blank style="color:var(--cyan)">abrir en YouTube</a></div>'
   :(CH.connected?'<div style="margin-top:10px"><label>Fecha y hora</label><input type=datetime-local id=mdt><div style="margin-top:8px"><button class=btn onclick="sched(\\''+id+'\\',\\''+encodeURIComponent(f)+'\\')">📅 Programar al canal</button> <button class="btn g" onclick="sched(\\''+id+'\\',\\''+encodeURIComponent(f)+'\\',1)">▶ Publicar ya</button></div></div>':'<div style="margin-top:10px"><small class=noc>Canal sin conectar — primero conéctalo (login).</small></div>');
 $('#modal').innerHTML='<div class=mbox><button class=mx onclick="closeVid()">✕</button><h3 style="font-size:14px">'+f.split('/').pop()+'</h3><video src="/file?p='+encodeURIComponent(f)+'" controls autoplay></video>'+ctrl+'</div>';
 $('#modal').style.display='flex';}
function closeVid(){$('#modal').style.display='none';$('#modal').innerHTML='';}
async function sched(id,ef,now){const f=decodeURIComponent(ef);const when=now?'now':($('#mdt')?.value);if(!now&&!when)return alert('elige fecha y hora');
 if(!confirm((now?'¿Publicar YA':'¿Programar')+' este video en el canal?'))return;
 const r=await (await fetch('/api/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,file:f,when:now?'now':when,title:f.split('/').pop().replace('.mp4','')})})).json();
 if(r.error)return alert('❌ '+r.error);closeVid();alert('Subiendo a YouTube… mira el log en Proyectos, luego el Calendario.');document.querySelector('.tab').click();poll(r.job,()=>{loadChannel();loadCal();});}
async function loadCal(){const id=$('#calch').value;const r=await (await fetch('/api/calendar?id='+id)).json();const it=r.items||[];
 const now=new Date(),y=now.getFullYear(),mo=now.getMonth();const first=new Date(y,mo,1).getDay(),days=new Date(y,mo+1,0).getDate();const byd={};
 it.forEach(e=>{const d=new Date(e.when);if(d.getFullYear()===y&&d.getMonth()===mo)(byd[d.getDate()]=byd[d.getDate()]||[]).push(e);});
 let h='<h3 style="margin:14px 0 8px">'+now.toLocaleString('es',{month:'long',year:'numeric'})+'</h3><table class=cal style="width:100%;border-collapse:collapse"><tr>'+['D','L','M','M','J','V','S'].map(d=>'<td class=d style="height:auto;text-align:center">'+d+'</td>').join('')+'</tr><tr>';let cell=0;
 for(let i=0;i<first;i++){h+='<td></td>';cell++;}
 for(let d=1;d<=days;d++){if(cell%7===0&&cell>0)h+='</tr><tr>';h+='<td><div class=d>'+d+'</div>'+(byd[d]||[]).map(e=>'<div class=ev>'+new Date(e.when).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})+' '+(e.title||'').slice(0,14)+'</div>').join('')+'</td>';cell++;}
 h+='</tr></table>'+(it.length?'<div class=grp>📋 Programados</div>'+it.slice(-20).reverse().map(e=>'<div style="font-size:12px;margin:5px 0"><small>'+new Date(e.when).toLocaleString('es')+' · '+e.privacy+'</small> — <b>'+e.title+'</b> <a href="'+e.url+'" target=_blank style="color:var(--cyan)">'+e.url+'</a></div>').join(''):'<p><small>nada programado aún</small></p>');
 $('#calview').innerHTML=h;}
$('#calch').onchange=loadCal;
async function loadStats(){const id=$('#stch').value;if(!id)return;const d=await (await fetch('/api/stats?id='+id)).json();
 $('#stview').innerHTML='<div class=row style="margin-top:12px;grid-template-columns:1fr 1fr 1fr"><div class=card style="text-align:center"><h3>'+(d.subs||0).toLocaleString()+'</h3><small>suscriptores</small></div><div class=card style="text-align:center"><h3>'+(d.channelViews||0).toLocaleString()+'</h3><small>vistas del canal</small></div><div class=card style="text-align:center"><h3>'+(d.videoCount||0)+'</h3><small>videos</small></div></div><div class=grp>🏆 Top 3 videos</div>'+((d.top||[]).map((v,i)=>'<div class=vid><b>#'+(i+1)+' '+v.title+'</b><br><small>'+(v.views||0).toLocaleString()+' vistas · '+(v.likes||0)+' likes · '+(v.comments||0)+' coment.</small> <a href="'+v.url+'" target=_blank style="color:var(--cyan)">ver</a></div>').join('')||'<small>pulsa “Sincronizar stats”.</small>')+'<small>💰 Ingresos: requieren monetización + YouTube Analytics API (se añade cuando moneticen). Por ahora vistas/engagement = qué funciona.</small>';}
$('#stch').onchange=loadStats;
async function statSync(){const id=$('#stch').value;$('#stst').innerHTML='<small>sincronizando…</small>';const r=await (await fetch('/api/statsync?id='+id,{method:'POST'})).json();if(r.error){$('#stst').innerHTML='<small>❌ '+r.error+'</small>';return;}const t=setInterval(async()=>{const j=await (await fetch('/api/job?id='+r.job)).json();if(j.done){clearInterval(t);$('#stst').innerHTML='<small>'+(j.code===0?'✅ actualizado':'⚠️ error')+'</small>';loadStats();}},1500);}
const NF=n=>(n||0).toLocaleString();
async function loadAccounts(){const d=await (await fetch('/api/accounts')).json();const t=d.totals||{};
 $('#acst').innerHTML=d.syncedAt?'<small>últ. sync: '+d.syncedAt.replace('T',' ')+'</small>':'<small>pulsa “Sincronizar todas”.</small>';
 $('#actotals').innerHTML='<div class=card style="text-align:center"><h3>'+NF(t.subs)+'</h3><small>suscriptores (red)</small></div><div class=card style="text-align:center"><h3>'+NF(t.views)+'</h3><small>vistas totales</small></div><div class=card style="text-align:center"><h3>'+NF(t.videos)+'</h3><small>videos publicados</small></div><div class=card style="text-align:center"><h3>'+(t.connected||0)+'/'+(t.channels||0)+'</h3><small>canales conectados</small></div>';
 const rows=(d.channels||[]).slice().sort((a,b)=>(b.subs||0)-(a.subs||0));
 $('#actable').innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px"><thead><tr style="text-align:left;color:var(--mut)"><th style="padding:6px">Canal</th><th>Handle</th><th>País</th><th style="text-align:right">Subs</th><th style="text-align:right">Vistas</th><th style="text-align:right">Videos</th></tr></thead><tbody>'+rows.map(c=>{if(!c.connected)return '<tr style="border-top:1px solid #23232e;color:#777"><td style="padding:6px">'+c.name+'</td><td colspan=5><small>sin conectar</small></td></tr>';if(!c.ok)return '<tr style="border-top:1px solid #23232e"><td style="padding:6px">'+c.name+'</td><td colspan=5><small>⚠️ '+(c.error||'error')+'</small></td></tr>';return '<tr style="border-top:1px solid #23232e"><td style="padding:6px"><b>'+(c.title||c.name)+'</b><br><small style="color:'+(LC[c.lang]||'#9aa')+'">'+c.lang+' · '+c.kind+'</small></td><td>'+(c.handle||'—')+'</td><td>'+(c.country||'—')+'</td><td style="text-align:right">'+NF(c.subs)+'</td><td style="text-align:right">'+NF(c.views)+'</td><td style="text-align:right">'+NF(c.videos)+'</td></tr>';}).join('')+'</tbody></table>';
 $('#accards').innerHTML=rows.filter(c=>c.ok&&(c.recent||[]).length).map(c=>'<div class=panel><b>'+(c.title||c.name)+'</b> <small>'+(c.handle||'')+' · '+NF(c.subs)+' subs</small>'+(c.recent||[]).map(v=>'<div class=vid><b>'+v.title+'</b> <small style="color:'+(v.privacy==='public'?'#39FF14':'#FFD60A')+'">'+v.privacy+'</small><br><small>'+NF(v.views)+' vistas · '+NF(v.likes)+' likes · '+NF(v.comments)+' coment.</small> <a href="'+v.url+'" target=_blank style="color:var(--cyan)">ver</a></div>').join('')+'</div>').join('');}
async function accountSync(){$('#acst').innerHTML='<small>consultando la API de cada canal… (puede tardar ~30s)</small>';const r=await (await fetch('/api/accountsync?id=all',{method:'POST'})).json();if(r.error){$('#acst').innerHTML='<small>❌ '+r.error+'</small>';return;}const t=setInterval(async()=>{const j=await (await fetch('/api/job?id='+r.job)).json();if(j.done){clearInterval(t);$('#acst').innerHTML='<small>'+(j.code===0?'✅ actualizado':'⚠️ error')+'</small>';loadAccounts();}},2000);}
async function loadMv(){const d=await (await fetch('/api/mvstatus')).json();const t=d.totals||{};if(d.error){$('#mvview').innerHTML='<small>⚠️ '+d.error+'</small>';return;}
 $('#mvview').innerHTML='<div class=cards style="margin:8px 0"><div class=card style="text-align:center"><h3>'+(t.connected||0)+'/'+(t.channels||0)+'</h3><small>conectados</small></div><div class=card style="text-align:center"><h3>'+(t.videos||0)+'</h3><small>en pipeline</small></div><div class=card style="text-align:center"><h3>'+(t.published||0)+'</h3><small>publicados</small></div></div>'+((d.channels||[]).map(c=>'<div class=vid><b>'+c.handle+'</b> <small style="color:'+(c.connected?'#39FF14':'#777')+'">'+(c.connected?'conectado':'sin conexión')+'</small> <small>· '+(c.project||'')+' · '+c.lang+'</small><br><small>'+c.published+' publicados / '+c.total+' en pipeline'+(Object.keys(c.counts||{}).length?' · '+Object.entries(c.counts).map(([k,v])=>v+' '+k).join(', '):'')+'</small></div>').join('')||'<small>pulsa “Sincronizar”.</small>')+(d.syncedAt?'<small>últ. sync: '+d.syncedAt.replace('T',' ')+'</small>':'');}
async function mvSync(){$('#mvst').innerHTML='<small>leyendo Supabase…</small>';const r=await (await fetch('/api/mvstatussync',{method:'POST'})).json();if(r.error){$('#mvst').innerHTML='<small>❌ '+r.error+'</small>';return;}const t=setInterval(async()=>{const j=await (await fetch('/api/job?id='+r.job)).json();if(j.done){clearInterval(t);$('#mvst').innerHTML='<small>'+(j.code===0?'✅ actualizado':'⚠️ error')+'</small>';loadMv();}},2000);}
async function syncYT(){const id=$('#calch').value;$('#syncst').innerHTML='<small>sincronizando con YouTube…</small>';const r=await (await fetch('/api/ytsync?id='+id,{method:'POST'})).json();if(r.error){$('#syncst').innerHTML='<small>❌ '+r.error+'</small>';return;}const t=setInterval(async()=>{const j=await (await fetch('/api/job?id='+r.job)).json();if(j.done){clearInterval(t);$('#syncst').innerHTML='<small>'+(j.code===0?'✅ sincronizado (fiel a YouTube)':'⚠️ error')+'</small>';loadCal();}},1500);}
async function loadBank(){const char=$('#sc_bankch').value;const r=await (await fetch('/api/bank?char='+char)).json();
 const next=String((r.scenes.length||0)+1).padStart(4,'0');
 if(!$('#sc_id').value)$('#sc_id').value=char+'-'+next;
 if(!$('#sc_shot').value)$('#sc_shot').value='medio';
 if(!$('#sc_tags').value)$('#sc_tags').value=$('#sc_func').value+', '+$('#sc_en').value;
 $('#sc_list').innerHTML='<div class=grp>'+r.scenes.length+' escenas en el banco</div><div class=vgrid>'+r.scenes.map(s=>'<div class=vcell onclick="openVid(\\''+encodeURIComponent(s.path)+'\\')"><video src="/file?p='+encodeURIComponent(s.path)+'" preload=metadata muted></video><div class=fn>'+s.id+'</div><div class=fn style="color:var(--cyan)">'+(s.function||'')+' · '+(s.energy||'')+'</div></div>').join('')+'</div>';}
$('#sc_bankch').onchange=loadBank;
async function loadConex(){const cr=await (await fetch('/api/cron')).json();$('#cronck').checked=!!cr.enabled;$('#cronlbl').textContent=cr.enabled?'CRON ENCENDIDO ✅':'cron apagado';
 const r=await (await fetch('/api/connections')).json();
 $('#conlist').innerHTML=r.groups.map(g=>'<div class=grp style="cursor:default">'+g.title+'</div>'+g.projects.map(p=>{const lc=LC[p.lang]||'#9aa';return '<div class=vid style="display:flex;align-items:center;gap:12px;border-left:6px solid '+lc+';margin-bottom:9px"><span style="background:'+lc+';color:#111;font-weight:700;font-size:11px;padding:4px 8px;border-radius:6px;min-width:36px;text-align:center">'+(p.lang||'').toUpperCase()+'</span><b style="flex:1;font-size:14px">'+p.name+'<br><small style="opacity:.8;font-weight:400">'+(p.handle||'')+'</small></b>'+(p.connected?('<span style="color:#39FF14;font-size:12px;font-weight:600">● conectado</span>'+(p.week?' <button class=btn style="background:var(--cyan);color:#111" onclick="genWeek(\\''+p.id+'\\',\\''+p.name.replace(/\\x27/g,"")+'\\')">📅 Generar semana</button>':'')):'<button class=btn style="background:#ff6b6b;color:#111" onclick="connect(\\''+p.id+'\\',\\''+p.name.replace(/\\x27/g,"")+'\\')">● Conectar este</button>')+'</div>';}).join('')).join('');}
async function genWeek(id,name){if(!confirm('¿Generar y PROGRAMAR 1 semana de "'+name+'"? Genera lo que falte y deja todo programado (publishAt). Corre en segundo plano.'))return;$('#conmsg').innerHTML='<div class=vid style="border-left:4px solid var(--cyan);margin-bottom:10px"><b>📅 Generando semana de '+name+'…</b><div id=gw_log style="margin-top:6px"><small>arrancando… (puede tardar varios minutos)</small></div></div>';const r=await (await fetch('/api/genweek?id='+id,{method:'POST'})).json();if(r.error){$('#conmsg').innerHTML='<div class=vid style="border-left:4px solid #ff6b6b;margin-bottom:10px">❌ '+r.error+'</div>';return;}const t=setInterval(async()=>{const j=await (await fetch('/api/job?id='+r.job)).json();const gl=$('#gw_log');if(gl)gl.innerHTML='<small>'+(((j.log||'').trim().split('\\n').slice(-1)[0])||'').slice(0,120)+'</small>';if(j.done){clearInterval(t);$('#conmsg').innerHTML='<div class=vid style="border-left:4px solid '+(j.code===0?'#39FF14':'#ff6b6b')+';margin-bottom:10px">'+(j.code===0?'✅ Semana de '+name+' generada y PROGRAMADA en 7 días':'⚠️ error — revisa el log')+'</div>';}},2500);}
async function toggleCron(){const en=$('#cronck').checked;await fetch('/api/cron',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:en})});$('#cronlbl').textContent=en?'CRON ENCENDIDO ✅':'cron apagado';}
$('#nc_go').onclick=async()=>{const b={type:$('#nc_type').value,id:$('#nc_id').value,lang:$('#nc_lang').value,name:$('#nc_name').value,handle:$('#nc_handle').value,niche:$('#nc_niche').value};
 if(!b.id||!b.name)return alert('pon id y nombre');$('#nc_st').innerHTML='<small>creando motor + metadata 2026…</small>';
 const r=await (await fetch('/api/newchannel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})).json();
 if(r.error){$('#nc_st').innerHTML='<small>❌ '+r.error+'</small>';return;}const lg=$('#nc_log');lg.classList.remove('hide');
 (function pj(){fetch('/api/job?id='+r.job).then(x=>x.json()).then(x=>{lg.textContent=x.log||'';lg.scrollTop=9e9;if(!x.done)setTimeout(pj,1200);else{$('#nc_st').innerHTML='<small>'+(x.code===0?'✅ canal creado — conéctalo abajo':'⚠️ código '+x.code)+'</small>';init();loadConex();}});})();};
let CFG={roles:[]};
async function loadConfig(){CFG=await (await fetch('/api/config')).json();$('#cf_pst').innerHTML=CFG.hasPass?'<small>(hay contraseña puesta)</small>':'';renderRoles();loadUsers();}
function renderRoles(){$('#cf_roles').innerHTML=(CFG.roles||[]).map(r=>'<div class=vid style="display:flex;gap:10px;align-items:center"><b style="min-width:130px">'+(r==='superadmin'?'👑 ':'')+r+'</b><small>'+(PERMS[r]||'')+'</small></div>').join('');}
async function loadUsers(){const r=await (await fetch('/api/users')).json();$('#us_list').innerHTML=(r.users||[]).length?(r.users.map(u=>'<div class=vid style="display:flex;gap:10px;align-items:center"><b style="flex:1">'+u.name+(u.email?' <small style="font-weight:400;opacity:.8">· '+u.email+'</small>':'')+'</b><span class=badge>'+(u.role==='superadmin'?'👑 ':'')+u.role+'</span> <a onclick="delUser(\\''+u.name.replace(/\\x27/g,"")+'\\')" style="cursor:pointer;color:#ff6b6b">✕</a></div>').join('')):'<small>sin usuarios aún</small>';}
async function createUser(){const name=$('#us_name').value.trim(),email=$('#us_email').value.trim();if(!name)return alert('pon un nombre');if(!email)return alert('pon el email del usuario');
 const r=await (await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,role:$('#us_role').value})})).json();
 if(r.password){$('#us_new').innerHTML='<div class=panel style="border-color:var(--neon);margin:10px 0"><b>✅ Usuario creado</b><div style="font-size:13px;margin-top:6px">👤 '+name+' · 📧 '+email+'</div><div style="display:flex;gap:8px;align-items:center;margin-top:8px"><label style="margin:0">Contraseña inicial</label><input id=us_pwd readonly value="'+r.password+'" style="flex:1;font-family:monospace;font-size:15px;letter-spacing:1px"><button class=btn onclick="copyPwd()">📋 Copiar</button></div><small>Cópiala y envíasela al usuario — no se vuelve a mostrar.</small></div>';}
 $('#us_name').value='';$('#us_email').value='';loadUsers();}
function copyPwd(){const el=$('#us_pwd');el.select();navigator.clipboard.writeText(el.value).then(()=>{const b=event.target;b.textContent='✅ Copiada';setTimeout(()=>b.textContent='📋 Copiar',1500);}).catch(()=>{document.execCommand('copy');});}
async function delUser(n){await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({del:n})});loadUsers();}
async function savePwd(){const p=$('#cf_pwd').value;if(!p)return;await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});$('#cf_pst').innerHTML='<small>✅ guardada</small>';$('#cf_pwd').value='';}
async function addRole(){const r=$('#cf_newrole').value.trim();if(!r)return;CFG.roles=[...(CFG.roles||[]),r];await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roles:CFG.roles})});$('#cf_newrole').value='';renderRoles();}
async function delRole(r){CFG.roles=(CFG.roles||[]).filter(x=>x!==r);await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roles:CFG.roles})});renderRoles();}
async function connect(id,name){
 const w=window.open('about:blank','_blank');           // abre YA (gesto del usuario → no se bloquea el popup)
 if(w){try{w.document.write('<p style="font-family:system-ui;padding:24px;font-size:16px">Abriendo el inicio de sesión de Google para <b>'+name+'</b>…</p>');}catch(e){}}
 $('#conmsg').innerHTML='<div class=vid style="border-left:4px solid var(--cyan);margin-bottom:10px"><b>Conectando '+name+'…</b> <span class=clink><small>obteniendo link…</small></span></div>';
 const r=await (await fetch('/api/connect?id='+id,{method:'POST'})).json();
 if(r.error){if(w)try{w.close();}catch(e){}$('#conmsg').innerHTML='<div class=vid style="border-left:4px solid #ff6b6b;margin-bottom:10px">❌ '+r.error+'</div>';return;}
 let opened=false;
 const t=setInterval(async()=>{const j=await (await fetch('/api/job?id='+r.job)).json();const m=(j.log||'').match(/https:\\/\\/accounts\\.google\\.com\\S+/);
  if(m&&!opened){opened=true;if(w){try{w.location.href=m[0];}catch(e){}}const cl=$('#conmsg').querySelector('.clink');if(cl)cl.innerHTML='<a href="'+m[0]+'" target=_blank style="color:var(--cyan)">▶ Inicia sesión y ELIGE el canal '+name+'. Si no abrió la pestaña, haz clic aquí.</a>';}
  if(j.done){clearInterval(t);const ok=j.code===0;$('#conmsg').innerHTML='<div class=vid style="border-left:4px solid '+(ok?'#39FF14':'#ff6b6b')+';margin-bottom:10px">'+(ok?'✅ '+name+' conectado — ya aparece abajo':'⚠️ no se conectó '+name+' — vuelve a intentar')+'</div>';loadConex();}},1200);}
$('#sc_go').onclick=async()=>{if(!$('#sc_id').value.trim())return alert('pon nombre/ID');if(!$('#sc_f1').files[0]||!$('#sc_f2').files[0])return alert('sube los 2 frames (inicial y final)');
 const fd=new FormData();fd.append('char',$('#sc_char').value);fd.append('id',$('#sc_id').value);fd.append('function',$('#sc_func').value);fd.append('energy',$('#sc_en').value);fd.append('shot',$('#sc_shot').value);fd.append('tags',$('#sc_tags').value);fd.append('prompt',$('#sc_prompt').value);fd.append('neg',$('#sc_neg').value);
 fd.append('frame1',$('#sc_f1').files[0]);fd.append('frame2',$('#sc_f2').files[0]);
 $('#sc_go').disabled=true;$('#sc_st').innerHTML='<small>generando en Veo… (1-2 min)</small>';
 const r=await (await fetch('/api/scene',{method:'POST',body:fd})).json();
 if(r.error){$('#sc_st').innerHTML='<small>❌ '+r.error+'</small>';$('#sc_go').disabled=false;return;}
 const lg=$('#sc_log');lg.classList.remove('hide');
 (function pj(){fetch('/api/job?id='+r.job).then(x=>x.json()).then(x=>{lg.textContent=x.log||'';lg.scrollTop=9e9;if(!x.done)setTimeout(pj,1500);else{$('#sc_st').innerHTML='<small>'+(x.code===0?'✅ agregada al banco':'⚠️ código '+x.code)+'</small>';$('#sc_go').disabled=false;if(x.code===0){$('#sc_id').value='';$('#sc_shot').value='';$('#sc_tags').value='';}loadBank();}});})();};
// ===== 💰 Centro de Gastos =====
const money=n=>'$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
let PRICING={},BAL={providers:[]};
async function loadCosts(){
 const c=await (await fetch('/api/costs')).json();
 PRICING=await (await fetch('/api/pricing')).json();
 $('#costcards').innerHTML=
   '<div class=card><small>Gasto total</small><div style="font-size:26px;font-weight:800;color:var(--cyan)">'+money(c.total)+'</div></div>'+
   '<div class=card><small>Últimos 30 días</small><div style="font-size:26px;font-weight:800">'+money(c.total30)+'</div></div>'+
   '<div class=card><small>Llamadas a APIs</small><div style="font-size:26px;font-weight:800">'+(c.count||0)+'</div></div>'+
   (c.balances||[]).map(b=>'<div class=card style="border-color:'+(b.remaining<0?'#ff6b6b':b.remaining<10?'#ffb020':'#39FF14')+'"><small>'+b.label+'</small><div style="font-size:22px;font-weight:800;color:'+(b.remaining<0?'#ff6b6b':'#39FF14')+'">'+money(b.remaining)+'</div><small style="opacity:.7">gastado '+money(b.spent)+' de '+money(b.credit)+'</small></div>').join('');
 // saldos editables
 BAL={providers:(c.balances||[]).map(b=>({key:b.key,label:b.label,credit:b.credit,note:b.note}))};
 $('#balbox').innerHTML='<table class=ctbl><tr><th>API</th><th>Crédito disponible (USD)</th><th>Gastado</th><th>Restante</th></tr>'+
   (c.balances||[]).map((b,i)=>'<tr><td>'+b.label+'</td><td><input data-bk="'+i+'" value="'+b.credit+'" style="width:110px"></td><td class=n>'+money(b.spent)+'</td><td class=n style="color:'+(b.remaining<0?'#ff6b6b':'#39FF14')+'">'+money(b.remaining)+'</td></tr>').join('')+'</table>';
 // por proyecto
 const mx=Math.max(...(c.projects||[]).map(p=>p.usd),0.0001);
 $('#costproj').innerHTML=(c.projects||[]).length?'<table class=ctbl><tr><th>Proyecto / canal</th><th>Llamadas</th><th>Costo</th><th></th></tr>'+
   c.projects.map(p=>'<tr><td>'+p.name+'</td><td class=n>'+p.calls+'</td><td class=n>'+money(p.usd)+'</td><td style="width:120px"><div class=bar style="width:'+Math.max(4,p.usd/mx*100)+'%"></div></td></tr>').join('')+'</table>':'<small>aún no hay gastos registrados. Se llenará automáticamente al generar (escenas Veo, metadata, imágenes, voz).</small>';
 const tbl=(arr,kn,t1)=>arr.length?'<table class=ctbl><tr><th>'+t1+'</th><th>Llamadas</th><th>Costo</th></tr>'+arr.map(x=>'<tr><td>'+x[kn]+'</td><td class=n>'+x.calls+'</td><td class=n>'+money(x.usd)+'</td></tr>').join('')+'</table>':'<small>—</small>';
 $('#costkind').innerHTML='<b style="font-size:13px">Por tipo</b>'+tbl(c.kinds||[],'kind','Tipo');
 $('#costprov').innerHTML='<b style="font-size:13px">Por proveedor</b>'+tbl(c.providers||[],'key','Proveedor');
 const dmx=Math.max(...(c.days||[]).map(d=>d.usd),0.0001);
 $('#costdays').innerHTML=(c.days||[]).length?'<table class=ctbl>'+c.days.map(d=>'<tr><td>'+d.day+'</td><td class=n>'+money(d.usd)+'</td><td style="width:160px"><div class=bar style="width:'+Math.max(4,d.usd/dmx*100)+'%"></div></td></tr>').join('')+'</table>':'<small>sin datos aún</small>';
 // precios editables
 const rows=[];for(const prov of Object.keys(PRICING)){if(prov[0]==='_'||typeof PRICING[prov]!=='object')continue;for(const m of Object.keys(PRICING[prov])){const r=PRICING[prov][m];if(typeof r!=='object')continue;rows.push('<tr><td>'+prov+'</td><td>'+m+'</td><td>'+(r.per||'')+'</td><td><input data-pp="'+prov+'|'+m+'|usd" value="'+(r.usd!=null?r.usd:'')+'" style="width:90px"></td><td>'+('usd_in'in r?'<input data-pp="'+prov+'|'+m+'|usd_in" value="'+r.usd_in+'" style="width:90px">':'')+'</td></tr>');}}
 $('#pricebox').innerHTML='<table class=ctbl><tr><th>Proveedor</th><th>Modelo</th><th>Unidad</th><th>USD/unidad</th><th>USD/1k entrada</th></tr>'+rows.join('')+'</table>';
}
async function saveBalances(){BAL.providers.forEach((p,i)=>{const el=document.querySelector('[data-bk="'+i+'"]');if(el)p.credit=parseFloat(el.value)||0;});await fetch('/api/balances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(BAL)});$('#balst').innerHTML='<small>✅ guardado</small>';loadCosts();}
async function savePricing(){document.querySelectorAll('[data-pp]').forEach(el=>{const[prov,m,f]=el.dataset.pp.split('|');if(PRICING[prov]&&PRICING[prov][m])PRICING[prov][m][f]=parseFloat(el.value)||0;});await fetch('/api/pricing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(PRICING)});$('#prst').innerHTML='<small>✅ precios guardados</small>';}
// Persistencia: guarda/restaura todos los campos de texto y selects en localStorage (los archivos no se pueden guardar por seguridad del navegador).
function persistInputs(){
  const skip={cronck:1};
  document.querySelectorAll('input,select,textarea').forEach(el=>{
    if(!el.id||skip[el.id]||el.type==='file'||el.type==='password'||el.type==='checkbox')return;
    const key='f_'+el.id; let v=null; try{v=localStorage.getItem(key);}catch(e){}
    if(v!==null)el.value=v;
    const save=()=>{try{localStorage.setItem(key,el.value);}catch(e){}};
    el.addEventListener('input',save);el.addEventListener('change',save);
  });
  if(typeof toggleVloop==='function')toggleVloop();
  document.querySelectorAll('input,textarea').forEach(el=>{if(el.id&&el.type!=='file'&&el.type!=='password')el.dispatchEvent(new Event('input'));});
  try{const tb=localStorage.getItem('tab');if(tb){const el=[...document.querySelectorAll('.tab')].find(x=>x.dataset.t===tb);if(el)el.click();}}catch(e){}
}
init().then(persistInputs);
</script>`;
