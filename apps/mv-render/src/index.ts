/**
 * mv-render — Music Video render worker (Railway, CPU service).
 *
 * Polls Supabase for music-video jobs and runs the full pipeline per language
 * variant: scene plan (ChatGPT) -> scene keyframes (gpt-image-1, canon refs)
 * -> motion (Veo 3 / Vertex) -> lip-sync on close-ups (sync.so, better close-up
 * quality) -> captions/SRT -> ffmpeg assembly with intro/outro -> upload
 * to Supabase storage -> mark mv_video_languages.rendered.
 *
 * Lip-sync runs on sync.so (serverless/pay-per-render), so this service itself
 * is plain CPU (ffmpeg) and fits the cheap Railway plan; nothing runs idle.
 *
 * Swappable defaults (see env): TRIGGER=poll Supabase, LIPSYNC=sync.so,
 * captions = even-timed v1 (WhisperX forced alignment is a later upgrade).
 *
 * UNVERIFIED until the first real run (isolated below): the exact Veo 3 Vertex
 * model id + response shape, and the sync.so SDK field names / output shape.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { SyncClient, SyncError } from '@sync.so/sdk';

const exec = promisify(execFile);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const cfg = {
  supabaseUrl: req('SUPABASE_URL'),
  supabaseKey: req('SUPABASE_SERVICE_ROLE_KEY'),
  openaiKey: req('OPENAI_API_KEY'),
  vertexProject: process.env.VERTEX_PROJECT ?? 'jmorenolive',
  vertexLocation: process.env.VERTEX_LOCATION ?? 'us-central1',
  vertexSaJson: req('GOOGLE_VERTEX_SA'),          // the service-account JSON (string)
  veoModel: process.env.VEO_MODEL ?? 'veo-3.0-generate-001',
  syncApiKey: req('SYNC_API_KEY'),
  syncModel: process.env.SYNC_MODEL ?? 'lipsync-2',
  // Lip-sync master switch. When 'off', closeups use Veo's mouth motion directly
  // (no sync.so call) — used while the sync.so quota is exhausted / for regens.
  lipsyncEnabled: (process.env.MV_LIPSYNC ?? 'on').toLowerCase() !== 'off',
  // Caption burn-in switch. When 'off', no SRT is built/burned — used for
  // validation renders (the v1 centered captions covered the character).
  captionsEnabled: (process.env.MV_CAPTIONS ?? 'on').toLowerCase() !== 'off',
  bucket: process.env.MV_BUCKET ?? 'assets',
  pollMs: Number(process.env.POLL_MS ?? 10000),
  veoCostCents: Number(process.env.MV_VEO_COST_CENTS ?? 500),  // rough Veo cost per scene
  maxCostCents: process.env.MV_MAX_COST_CENTS ? Number(process.env.MV_MAX_COST_CENTS) : null,
  reclaimMinutes: Number(process.env.MV_RECLAIM_MINUTES ?? 30),  // re-queue videos stuck in 'rendering'
};

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const db: SupabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
  auth: { persistSession: false },
});
const openai = new OpenAI({ apiKey: cfg.openaiKey });
const syncClient = new SyncClient({ apiKey: cfg.syncApiKey });

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

// Prepended to every Veo prompt: Veo only receives the short scene line (which
// names "Zuri" but not her species), so on a weak/empty keyframe it would invent
// a human performer. This forces the meerkat identity at the motion stage too.
const VEO_CHARACTER_PREFIX =
  '3D animated anthropomorphic MEERKAT named Zuri, an animal character NOT a human, caramel fur, do not transform into a human.';

// ===========================================================================
// 1. Vertex auth (VERIFIED) — JWT -> access token, cached until expiry.
// ===========================================================================
let tokenCache: { token: string; exp: number } | null = null;
async function vertexToken(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > nowSec) return tokenCache.token;

  const sa = JSON.parse(cfg.vertexSaJson) as { client_email: string; private_key: string; token_uri: string };
  const b64u = (b: string | Buffer) => Buffer.from(b).toString('base64url');
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: sa.token_uri,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${signer.sign(sa.private_key).toString('base64url')}`;

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error(`Vertex token failed: ${JSON.stringify(j).slice(0, 200)}`);
  tokenCache = { token: j.access_token, exp: nowSec + (j.expires_in ?? 3600) };
  return j.access_token;
}

// ===========================================================================
// 2. Scene keyframe image (VERIFIED) — gpt-image-1 with canon photos as refs.
// ===========================================================================
// gpt-image-1's safety classifier is non-deterministic: the SAME prompt can be
// rejected (HTTP 400 "rejected by the safety system") on one call and pass on a
// fresh one. We retry ONLY that specific rejection — never other errors.
function isSafetyRejection(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; message?: unknown };
  const status = e?.status ?? e?.statusCode;
  const msg = String(e?.message ?? '');
  return (status === 400 || /^\s*400\b/.test(msg)) && /safety system/i.test(msg);
}

async function generateSceneImage(prompt: string, refs: Buffer[]): Promise<Buffer> {
  // images.edit accepts reference images to keep the character on-canon.
  const files = await Promise.all(
    refs.slice(0, 4).map(async (buf, i) => await OpenAI.toFile(buf, `ref_${i}.png`, { type: 'image/png' })),
  );
  // Up to 3 attempts: retry only the flaky safety-400 (fresh request usually
  // passes), ~2s apart. A 4th-and-final failure is treated as a real rejection.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await openai.images.edit({
        model: 'gpt-image-1',
        image: files as any,
        prompt,
        size: '1536x1024', // 16:9 landscape, matches the horizontal assembly
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error('gpt-image-1 returned no image');
      return Buffer.from(b64, 'base64');
    } catch (err) {
      if (isSafetyRejection(err) && attempt < maxAttempts) {
        log('image.safety_retry', { attempt, maxAttempts });
        await sleep(2000);
        continue;
      }
      throw err;
    }
  }
  // Loop either returns or throws; this only satisfies the type checker.
  throw new Error('gpt-image-1 failed after safety retries');
}

// ===========================================================================
// 3. Veo 3 motion (UNVERIFIED — confirm model id + response on first run).
//    Vertex predictLongRunning: submit, then poll the operation.
// ===========================================================================
async function veoImageToVideo(imageB64: string, prompt: string): Promise<Buffer> {
  const token = await vertexToken();
  const base = `https://${cfg.vertexLocation}-aiplatform.googleapis.com/v1/projects/${cfg.vertexProject}/locations/${cfg.vertexLocation}/publishers/google/models/${cfg.veoModel}`;

  const submit = await fetch(`${base}:predictLongRunning`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt, image: { bytesBase64Encoded: imageB64, mimeType: 'image/png' } }],
      parameters: { aspectRatio: '16:9', durationSeconds: 8, sampleCount: 1 },
    }),
  });
  if (!submit.ok) throw new Error(`Veo submit ${submit.status}: ${(await submit.text()).slice(0, 200)}`);
  const op = (await submit.json()) as { name: string };

  // Poll the long-running operation.
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const poll = await fetch(`${base}:fetchPredictOperation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName: op.name }),
    });
    const data = (await poll.json()) as any;
    if (data.done) {
      const vid = data.response?.videos?.[0] ?? data.response?.predictions?.[0];
      const b64 = vid?.bytesBase64Encoded ?? vid?.video?.bytesBase64Encoded;
      if (b64) return Buffer.from(b64, 'base64');
      const uri = vid?.gcsUri ?? vid?.uri;
      if (uri) return await downloadGcs(uri, token);
      throw new Error(`Veo op done but no video in response: ${JSON.stringify(data).slice(0, 300)}`);
    }
  }
  throw new Error('Veo operation timed out');
}

async function downloadGcs(gsUri: string, token: string): Promise<Buffer> {
  const m = gsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Bad gcs uri ${gsUri}`);
  const url = `https://storage.googleapis.com/storage/v1/b/${m[1]}/o/${encodeURIComponent(m[2]!)}?alt=media`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return Buffer.from(await r.arrayBuffer());
}

// ===========================================================================
// 4. Lip-sync via sync.so (better close-up quality than Wav2Lip).
//    Serverless: pay per render, $0 idle. (UNVERIFIED — confirm SDK field
//    names / output shape on the first real run.)
// ===========================================================================
async function sync(faceVideoUrl: string, audioUrl: string): Promise<Buffer> {
  try {
    const res = await syncClient.generations.create({
      input: [
        { type: 'video', url: faceVideoUrl },
        { type: 'audio', url: audioUrl },
      ],
      model: cfg.syncModel,
      options: { sync_mode: 'cut_off' },
      outputFileName: 'zuri_lipsync',
    } as any);

    const jobId = res.id;
    let gen: any;
    let status: string | undefined;
    while (status !== 'COMPLETED' && status !== 'FAILED' && status !== 'REJECTED') {
      await sleep(10000);
      gen = await syncClient.generations.get(jobId);
      status = gen.status;
    }
    if (status !== 'COMPLETED') throw new Error(`Sync lipsync ${status}`);
    return Buffer.from(await (await fetch(gen.outputUrl)).arrayBuffer());
  } catch (err) {
    if (err instanceof SyncError) {
      const e = err as any;
      log('sync.error', { status_code: e.statusCode ?? e.status_code, body: e.body });
    }
    throw err;
  }
}

// ===========================================================================
// 5. Captions / SRT — sourced ONLY from the approved lyrics, NEVER from audio
//    transcription (which can hallucinate). v1 is even-timed; if WhisperX is
//    added later it must run in FORCED ALIGNMENT (transcribe=false) — it
//    contributes timings only, never new text.
// ===========================================================================

/**
 * Clean the approved lyrics before captioning so no section tag, production
 * parenthetical, or credit/metadata line ever shows up as a subtitle. Returns
 * only the singable lines. buildSrt() must be fed THIS, never raw lyrics.
 */
function sanitizeLyrics(raw: string): string {
  let lines = (raw ?? '').split(/\r?\n/);

  // Cut everything from the last [Outro]/[End] marker onward (Suno parks
  // credits/fades there).
  let endIdx = -1;
  lines.forEach((l, i) => { if (/\[\s*(outro|end)\s*\]/i.test(l)) endIdx = i; });
  if (endIdx >= 0) lines = lines.slice(0, endIdx);

  const creditRe = /(\bby\s|詞曲|作詞|作曲|©|copyright|\bsuno\b|\blyrics\b|music:|\bproduced\b)/i;
  const prodParenRe = /\(\s*(fade\s*out|fade\s*in|instrumental|outro|intro|end)\s*\)/gi;

  const cleaned: string[] = [];
  for (let line of lines) {
    line = line.replace(/\[[^\]]*\]/g, '');     // section tags [Intro][Hook]...
    line = line.replace(prodParenRe, '');       // production parentheticals
    line = line.replace(/\s+/g, ' ').trim();    // collapse whitespace / blanks
    if (!line) continue;
    if (creditRe.test(line)) continue;          // credit / metadata lines
    cleaned.push(line);
  }

  // Strip a trailing isolated proper-name credit (≤3 capitalized words, no
  // sentence punctuation) sometimes left as an artist signature.
  const last = cleaned[cleaned.length - 1];
  if (last && last.length <= 30 && !/[.!?,;:]$/.test(last) &&
      /^[\p{Lu}][\p{L}'’.-]*(\s+[\p{Lu}][\p{L}'’.-]*){0,2}$/u.test(last)) {
    cleaned.pop();
  }

  return cleaned.join('\n');
}

function buildSrt(sanitizedLyrics: string, durationSeconds: number): string {
  const lines = sanitizedLyrics.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  // Anti-hallucination guard: a cue's text MUST be an approved lyric line.
  // Trivially true here (cues ARE the lyric lines), but enforces the rule if a
  // forced-alignment source is ever wired in — any unknown text is dropped.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const allowed = new Set(lines.map(norm));
  const cues = lines.filter((t) => allowed.has(norm(t)));
  if (cues.length === 0) return '';

  const per = durationSeconds / cues.length;
  const ts = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60),
      ms = Math.floor((s - Math.floor(s)) * 1000);
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${p(h)}:${p(m)}:${p(sec)},${p(ms, 3)}`;
  };
  return cues
    .map((text, i) => `${i + 1}\n${ts(i * per)} --> ${ts((i + 1) * per)}\n${text}\n`)
    .join('\n');
}

// ===========================================================================
// 6. ffmpeg assembly — concat scene clips, lay music, burn captions, add
//    intro/outro. Captions: centered, bottom, 2 lines (the .srt force_style).
// ===========================================================================
async function ffmpeg(args: string[]): Promise<void> {
  await exec('ffmpeg', ['-y', ...args], { maxBuffer: 1 << 26 });
}

async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ], { maxBuffer: 1 << 20 });
    return Number(String(stdout).trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Build the per-scene vocal segment for lip-sync: trim the full vocal to this
 * closeup's window [start_seconds, +duration_seconds], capped at the Veo clip's
 * real length so sync.so receives audio that matches the video duration (and
 * stays under the plan's per-clip limit). Uploads to a scratch path and returns
 * a signed URL; the scratch object is removed in renderVideoLanguage's finally.
 */
async function sceneVocalSegmentUrl(
  dir: string, vl: any, scene: any, vocalLocal: string, clipDurationSeconds: number,
): Promise<string> {
  const start = Math.max(0, Number(scene.start_seconds) || 0);
  const window = Number(scene.duration_seconds) || clipDurationSeconds || 8;
  const len = Math.min(window, clipDurationSeconds || window);
  const segLocal = path.join(dir, `scene_${scene.ordinal}_vocal.wav`);
  // -ss before -i: fast seek; re-encode to pcm so the cut is sample-accurate.
  await ffmpeg(['-ss', String(start), '-i', vocalLocal, '-t', String(len), '-c:a', 'pcm_s16le', segLocal]);
  const segPath = `mv/_tmp/${vl.id}/scene_${scene.ordinal}_vocal_${vl.language}.wav`;
  await db.storage.from(cfg.bucket).upload(segPath, await fs.readFile(segLocal), { contentType: 'audio/wav', upsert: true });
  log('sync.segment', { vlId: vl.id, ordinal: scene.ordinal, start, len });
  return await signedUrl(segPath);
}

async function assemble(opts: {
  dir: string;
  sceneClips: string[];        // ordered local mp4 paths
  sceneDurations: number[];    // target seconds per scene clip (its song window)
  musicPath: string;           // full mix
  srtPath: string | null;
  introPath: string | null;
  outroPath: string | null;
}): Promise<string> {
  const { dir, sceneClips, sceneDurations, musicPath, srtPath, introPath, outroPath } = opts;

  // Each item carries an optional fit target: scene clips are stretched to cover
  // their song window (Veo only returns ~8s, but a scene may span 12-33s, so the
  // video would be short and the 131s song cut off). Intro/outro keep their own
  // length (fit = null).
  const items: { path: string; fit: number | null }[] = [
    ...(introPath ? [{ path: introPath, fit: null }] : []),
    ...sceneClips.map((p, i) => ({ path: p, fit: sceneDurations[i] && sceneDurations[i]! > 0 ? sceneDurations[i]! : null })),
    ...(outroPath ? [{ path: outroPath, fit: null }] : []),
  ];

  // Normalize EVERY clip to 1920x1080 (16:9 horizontal) / 30fps / yuv420p (audio
  // stripped) before concat — Veo/lip-sync clips can come back at varying
  // dims/fps, which would corrupt a concat-demuxer join. Letterbox/pillarbox to
  // fit; never trust the source dimensions.
  const baseVf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1';
  const normalized: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const { path: clip, fit } = items[i]!;
    const n = path.join(dir, `norm_${i}.mp4`);
    if (fit) {
      // Loop the short clip to cover its scene window at NATURAL speed, cutting
      // the final repeat to the exact length (-stream_loop loops the input, -t
      // trims). Music-video friendly: Zuri keeps moving at normal speed instead
      // of the frozen slow-motion that setpts produced on long windows (e.g. a
      // 33s outro from an 8s clip = 4x slow). Clean cut between loops (no
      // crossfade — variable loop count makes xfade fragile).
      await ffmpeg([
        '-stream_loop', '-1', '-i', clip,
        '-vf', baseVf,
        '-r', '30', '-t', fit.toFixed(3), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-an', n,
      ]);
    } else {
      await ffmpeg([
        '-i', clip,
        '-vf', baseVf,
        '-r', '30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-an', n,
      ]);
    }
    normalized.push(n);
  }

  // Concat the now-uniform clips (safe stream copy).
  const listFile = path.join(dir, 'concat.txt');
  await fs.writeFile(listFile, normalized.map((c) => `file '${c}'`).join('\n'));
  const concat = path.join(dir, 'concat.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concat]);

  // Mux music + burn captions.
  const out = path.join(dir, 'final.mp4');
  const vf = srtPath
    ? `subtitles=${srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')}:force_style='Alignment=2,MarginV=120,Fontsize=22,Outline=2,Bold=1'`
    : null;
  await ffmpeg([
    '-i', concat, '-i', musicPath,
    ...(vf ? ['-vf', vf] : []),
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', out,
  ]);
  return out;
}

/**
 * Derive a 9:16 Short (1080x1920) from the 16:9 master: a blurred, upscaled copy
 * fills the vertical frame; the original is overlaid centered. Returns the local
 * output path (audio copied from the master).
 */
async function makeVerticalShort(horizontalPath: string): Promise<string> {
  const out = horizontalPath.replace(/\.mp4$/, '_short.mp4');
  await ffmpeg([
    '-i', horizontalPath,
    '-filter_complex',
    '[0:v]scale=1080:1920,boxblur=40:5[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2',
    '-c:a', 'copy', out,
  ]);
  return out;
}

// ===========================================================================
// 7. Per-video pipeline
// ===========================================================================
async function renderVideoLanguage(vl: any, video: any, project: any, characters: any[], refs: Buffer[]): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `mv_${vl.id}_`));
  try {
    // Scenes are pre-planned in mv_scenes (by the planning step). Render each.
    const { data: scenes } = await db
      .from('mv_scenes').select('*').eq('video_id', video.id).order('ordinal', { ascending: true });
    if (!scenes?.length) throw new Error('No scenes planned for this video');

    // For closeups we lip-sync per scene: download the full vocal once, then
    // trim each closeup's window (capped at its Veo clip length) so sync.so gets
    // only that scene's voice — fits the plan's per-clip limit AND aligns the
    // mouth to the right lyric (the full 131s vocal both exceeded the plan and
    // synced the wrong segment).
    // Only need the vocal if some closeup still has to be synced (no cached
    // lipsync for THIS language). If every closeup is already synced, skip the
    // download entirely — and we never touch sync.so again.
    const needsVocal = cfg.lipsyncEnabled && scenes.some((s: any) => s.is_closeup &&
      !(s.lipsync_clip_path && String(s.lipsync_clip_path).endsWith(`_${vl.language}.mp4`)));
    const vocalLocal = path.join(dir, 'vocal_full.wav');
    if (needsVocal) {
      const vocalUrl = await signedUrl(vl.vocal_stem_url ?? vl.music_url);
      await fs.writeFile(vocalLocal, await download(vocalUrl));
    }
    const sceneClips: string[] = [];
    const sceneDurations: number[] = [];   // each scene's song window (seconds)

    for (const scene of scenes) {
      const scenePath = path.join(dir, `scene_${scene.ordinal}.mp4`);
      const reusedVeo = !!scene.veo_clip_path;

      // Veo motion is language-agnostic → reuse across language variants and
      // retries (the expensive step). Generate the keyframe + Veo only if not
      // cached, persisting image_path / veo_clip_path on the scene.
      let veoBuf: Buffer;
      if (scene.veo_clip_path) {
        veoBuf = await download(await signedUrl(scene.veo_clip_path));
      } else {
        const img = scene.image_path
          ? await download(await signedUrl(scene.image_path))
          : await generateSceneImage(scenePrompt(scene, project, characters), refs);
        if (!scene.image_path) {
          const imgPath = `mv/${project.id}/${video.id}/scene_${scene.ordinal}.png`;
          await db.storage.from(cfg.bucket).upload(imgPath, img, { contentType: 'image/png', upsert: true });
          await db.from('mv_scenes').update({ image_path: imgPath }).eq('id', scene.id);
        }
        const veoPrompt = `${VEO_CHARACTER_PREFIX} ${scene.prompt ?? scenePrompt(scene, project, characters)}`;
        veoBuf = await veoImageToVideo(img.toString('base64'), veoPrompt);
        const veoPath = `mv/${project.id}/${video.id}/scene_${scene.ordinal}_veo.mp4`;
        await db.storage.from(cfg.bucket).upload(veoPath, veoBuf, { contentType: 'video/mp4', upsert: true });
        await db.from('mv_scenes').update({ veo_clip_path: veoPath }).eq('id', scene.id);
        scene.veo_clip_path = veoPath;
      }

      // Lip-sync IS language-specific (stored as a language-suffixed object on
      // the per-video scene row). It's idempotent and sync.so is pay/quota-
      // limited, so reuse this language's cached clip if present — re-running
      // sync.so on an already-synced scene burned the free quota and caused 402s.
      let clipBuf = veoBuf;
      if (scene.is_closeup && cfg.lipsyncEnabled) {
        const lsPath = `mv/${project.id}/${video.id}/scene_${scene.ordinal}_lipsync_${vl.language}.mp4`;
        if (scene.lipsync_clip_path && String(scene.lipsync_clip_path).endsWith(`_${vl.language}.mp4`)) {
          clipBuf = await download(await signedUrl(scene.lipsync_clip_path));
          log('lipsync.reused', { vlId: vl.id, ordinal: scene.ordinal });
        } else {
          // Cut THIS scene's vocal window, capped at the Veo clip's real duration
          // so audio and video are ~equal length (sync.so needs that to align).
          const veoLocal = path.join(dir, `scene_${scene.ordinal}_veo.mp4`);
          await fs.writeFile(veoLocal, veoBuf);
          const clipDur = await probeDuration(veoLocal);
          const segUrl = await sceneVocalSegmentUrl(dir, vl, scene, vocalLocal, clipDur);
          clipBuf = await sync(await signedUrl(scene.veo_clip_path), segUrl);
          await db.storage.from(cfg.bucket).upload(lsPath, clipBuf, { contentType: 'video/mp4', upsert: true });
          await db.from('mv_scenes').update({ lipsync_clip_path: lsPath }).eq('id', scene.id);
        }
      }

      await fs.writeFile(scenePath, clipBuf);
      sceneClips.push(scenePath);
      sceneDurations.push(Number(scene.duration_seconds) || 0);
      log('scene.done', { vlId: vl.id, ordinal: scene.ordinal, closeup: scene.is_closeup, reusedVeo });
    }

    // Music + captions.
    const musicPath = path.join(dir, 'music.mp3');
    await fs.writeFile(musicPath, await download(await signedUrl(vl.music_url)));
    let srtPath: string | null = null;
    const cleanLyrics = sanitizeLyrics(vl.lyrics ?? '');
    // The video now spans the sum of the scene windows (each clip is stretched to
    // its duration_seconds), so caption timing must use that real length — not the
    // old 8s-per-scene fallback that drifted once clips were extended.
    const totalSceneSeconds = sceneDurations.reduce((a, b) => a + (b || 0), 0);
    if (cfg.captionsEnabled && cleanLyrics) {
      const srt = buildSrt(cleanLyrics, Number(video.duration_seconds) || totalSceneSeconds || sceneClips.length * 8);
      srtPath = path.join(dir, 'captions.srt');
      await fs.writeFile(srtPath, srt);
      await uploadAsset(project.id, `mv/${project.id}/${vl.id}/captions.srt`, Buffer.from(srt), 'text/plain', vl, 'srt_path');
    }

    // Intro / outro.
    const introPath = await localizeAsset(dir, project.id, 'intro');
    const outroPath = await localizeAsset(dir, project.id, 'outro');

    const finalPath = await assemble({ dir, sceneClips, sceneDurations, musicPath, srtPath, introPath, outroPath });
    const finalBuf = await fs.readFile(finalPath);
    const storagePath = `mv/${project.id}/${vl.id}/final.mp4`;
    await uploadAsset(project.id, storagePath, finalBuf, 'video/mp4', vl, 'final_video_path');

    // Spanish: also produce a 9:16 Short (blurred bg). Other languages later.
    if (vl.language === 'es') {
      const shortLocal = await makeVerticalShort(finalPath);
      const shortStorage = `mv/${project.id}/${vl.id}/final_short.mp4`;
      const { error: shortErr } = await db.storage.from(cfg.bucket).upload(shortStorage, await fs.readFile(shortLocal), { contentType: 'video/mp4', upsert: true });
      if (shortErr) throw new Error(`upload failed for ${shortStorage}: ${shortErr.message}`);
      await db.from('mv_video_languages').update({ short_video_path: shortStorage }).eq('id', vl.id);
      log('short.created', { vlId: vl.id, storagePath: shortStorage });
    }

    await db.from('mv_video_languages').update({ status: 'rendered', final_video_path: storagePath }).eq('id', vl.id);
    log('video_language.rendered', { vlId: vl.id, sizeBytes: finalBuf.length });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    // Best-effort: drop this variant's scratch objects from the bucket.
    try {
      const { data: tmp } = await db.storage.from(cfg.bucket).list(`mv/_tmp/${vl.id}`);
      if (tmp?.length) {
        await db.storage.from(cfg.bucket).remove(tmp.map((f) => `mv/_tmp/${vl.id}/${f.name}`));
      }
    } catch { /* ignore cleanup errors */ }
  }
}

function scenePrompt(scene: any, _project: any, characters: any[]): string {
  // We intentionally do NOT append project.scenario_bible.stageBasePrompt here:
  // it contains "no main character on stage", which made gpt-image-1 render the
  // empty set (Zuri absent) for scenes that must contain her. The protagonist
  // basePrompt already describes the stage; the stage-plate prompt is only for
  // character-free background plates.
  const protagonist = characters.find((c) => c.role === 'protagonist')?.dna?.basePrompt ?? '';
  return [protagonist, `Camera: ${scene.camera_position ?? 'front'}.`, scene.prompt ?? '']
    .filter(Boolean).join('\n');
}

// ---- storage helpers (VERIFIED pattern) ----
async function signedUrl(storagePathOrUrl: string): Promise<string> {
  if (/^https?:\/\//.test(storagePathOrUrl)) return storagePathOrUrl;
  const { data, error } = await db.storage.from(cfg.bucket).createSignedUrl(storagePathOrUrl, 3600);
  if (error || !data) throw new Error(`signedUrl failed for ${storagePathOrUrl}`);
  return data.signedUrl;
}
async function download(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}
async function uploadAsset(projectId: string, storagePath: string, buf: Buffer, contentType: string, vl: any, field: string): Promise<void> {
  // MUST check the error: a swallowed upload failure (e.g. file over the bucket
  // size limit) previously reported false success — the DB field was set to a
  // path whose object never landed. Throw so the variant is marked failed.
  const { error } = await db.storage.from(cfg.bucket).upload(storagePath, buf, { contentType, upsert: true });
  if (error) throw new Error(`upload failed for ${storagePath} (${buf.length} bytes): ${error.message}`);
  await db.from('mv_video_languages').update({ [field]: storagePath }).eq('id', vl.id);
}
async function localizeAsset(dir: string, projectId: string, kind: 'intro' | 'outro'): Promise<string | null> {
  const { data } = await db.from('mv_assets').select('storage_path').eq('project_id', projectId).eq('type', `${kind}_image`).limit(1).maybeSingle();
  if (!data?.storage_path) return null;
  const p = path.join(dir, `${kind}.mp4`);
  // Still image -> 3s clip (intro/outro audio muxed in a later pass if provided).
  const img = path.join(dir, `${kind}.png`);
  await fs.writeFile(img, await download(await signedUrl(data.storage_path)));
  await ffmpeg(['-loop', '1', '-i', img, '-t', '3', '-r', '30', '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1', '-pix_fmt', 'yuv420p', p]);
  return p;
}

// ===========================================================================
// 8. Poll loop — claim a video in `generating`, render its language variants.
// ===========================================================================
async function tick(): Promise<void> {
  // Reclaim videos stuck in 'rendering' beyond the timeout (a worker crashed
  // mid-render): flip them back to 'generating' so they get retried.
  const staleBefore = new Date(Date.now() - cfg.reclaimMinutes * 60_000).toISOString();
  const { data: reclaimed } = await db
    .from('mv_videos').update({ status: 'generating', updated_at: new Date().toISOString() })
    .eq('status', 'rendering').lt('updated_at', staleBefore).select('id');
  if (reclaimed?.length) log('video.reclaimed', { count: reclaimed.length, ids: reclaimed.map((r: any) => r.id) });

  // Find the oldest queued video.
  const { data: video } = await db
    .from('mv_videos').select('*').eq('status', 'generating').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!video) return;

  // Atomic claim: flip generating -> rendering only if still generating, stamping
  // updated_at so a crash mid-render becomes reclaimable. If no row comes back,
  // another instance grabbed it first — bail out (no double render).
  const { data: claimed } = await db
    .from('mv_videos').update({ status: 'rendering', updated_at: new Date().toISOString() })
    .eq('id', video.id).eq('status', 'generating').select('id');
  if (!claimed || claimed.length === 0) {
    log('video.claimed_elsewhere', { videoId: video.id });
    return;
  }

  const { data: project } = await db.from('mv_projects').select('*').eq('id', video.project_id).single();
  const { data: characters } = await db.from('mv_characters').select('*').eq('project_id', video.project_id);
  const protagonist = characters?.find((c: any) => c.role === 'protagonist');
  const refs = await Promise.all(((protagonist?.canon_photos ?? []) as string[]).slice(0, 4).map(async (p) => download(await signedUrl(p))));

  const { data: variants } = await db
    .from('mv_video_languages').select('*').eq('video_id', video.id).neq('status', 'rendered');

  // Cost guard: estimate Veo spend (scenes × variants × per-scene) and refuse to
  // render if it exceeds the optional ceiling.
  const { count: sceneCount } = await db
    .from('mv_scenes').select('id', { count: 'exact', head: true }).eq('video_id', video.id);
  const estCents = (sceneCount ?? 0) * (variants?.length ?? 0) * cfg.veoCostCents;
  log('cost.estimate', { videoId: video.id, scenes: sceneCount ?? 0, variants: variants?.length ?? 0, estCents });
  if (cfg.maxCostCents !== null && estCents > cfg.maxCostCents) {
    log('cost.exceeded', { videoId: video.id, estCents, maxCents: cfg.maxCostCents });
    await db.from('mv_videos').update({ status: 'failed' }).eq('id', video.id);
    return;
  }

  for (const vl of variants ?? []) {
    // Skip (don't fail) variants whose audio isn't loaded yet — they stay in
    // their current status and render on a later tick once music_url is set.
    if (!vl.music_url) {
      log('variant.skipped_no_audio', { vlId: vl.id, language: vl.language });
      continue;
    }
    try {
      await renderVideoLanguage(vl, video, project, characters ?? [], refs);
    } catch (err) {
      log('video_language.failed', { vlId: vl.id, error: (err as Error).message });
      await db.from('mv_video_languages').update({ status: 'failed' }).eq('id', vl.id);
    }
  }

  // Completion. Re-queue to 'generating' ONLY if real renderable work remains —
  // a variant that HAS audio and is neither rendered nor failed. Variants with
  // no audio are just waiting (not loopable), and failed ones must NOT auto-retry
  // (that was the infinite, quota-burning loop). So:
  //   • all rendered                  -> ready
  //   • renderable pending exists      -> generating (legit next pass)
  //   • otherwise (only awaiting-audio
  //     and/or failed remain)          -> failed if any failed, else ready
  // Awaiting-audio languages render on a later, user-triggered pass once their
  // music_url is set (re-arm by setting the video back to 'generating').
  const { data: vls } = await db
    .from('mv_video_languages').select('status, music_url').eq('video_id', video.id);
  const all = vls ?? [];
  const allRendered = all.length > 0 && all.every((v: any) => v.status === 'rendered');
  const renderablePending = all.some((v: any) => v.music_url && v.status !== 'rendered' && v.status !== 'failed');
  const anyFailed = all.some((v: any) => v.status === 'failed');
  let next: string;
  if (allRendered) next = 'ready';
  else if (renderablePending) next = 'generating';
  else next = anyFailed ? 'failed' : 'ready';
  await db.from('mv_videos').update({ status: next }).eq('id', video.id);
  log('video.completion', { videoId: video.id, next, rendered: all.filter((v: any) => v.status === 'rendered').length, total: all.length, anyFailed });
}

async function main(): Promise<void> {
  log('mv-render.started', { project: cfg.vertexProject, location: cfg.vertexLocation, pollMs: cfg.pollMs });
  let running = true;
  process.on('SIGTERM', () => { running = false; log('mv-render.sigterm'); });
  while (running) {
    try { await tick(); } catch (err) { log('tick.error', { error: (err as Error).message }); }
    await sleep(cfg.pollMs);
  }
  process.exit(0);
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

main().catch((err) => { log('fatal', { error: (err as Error).message }); process.exit(1); });
