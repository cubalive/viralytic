/**
 * mv-render — Music Video render worker (Railway, CPU service).
 *
 * Polls Supabase for music-video jobs and runs the full pipeline per language
 * variant: scene plan (ChatGPT) -> scene keyframes (gpt-image-1, canon refs)
 * -> motion (Veo 3 / Vertex) -> lip-sync on close-ups (Wav2Lip via Replicate,
 * serverless GPU) -> captions/SRT -> ffmpeg assembly with intro/outro -> upload
 * to Supabase storage -> mark mv_video_languages.rendered.
 *
 * Heavy GPU work (Wav2Lip) is serverless/pay-per-render, so this service itself
 * is plain CPU (ffmpeg) and fits the cheap Railway plan; nothing runs idle.
 *
 * Swappable defaults (see env): TRIGGER=poll Supabase, LIPSYNC=Replicate Wav2Lip,
 * captions = even-timed v1 (WhisperX forced alignment is a later upgrade).
 *
 * UNVERIFIED until the first real run (isolated below): the exact Veo 3 Vertex
 * model id + response shape, and the Replicate Wav2Lip model version.
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
  replicateToken: req('REPLICATE_API_TOKEN'),
  wav2lipVersion: req('WAV2LIP_REPLICATE_VERSION'), // Replicate model version hash
  bucket: process.env.MV_BUCKET ?? 'assets',
  pollMs: Number(process.env.POLL_MS ?? 10000),
  veoCostCents: Number(process.env.MV_VEO_COST_CENTS ?? 500),  // rough Veo cost per scene
  maxCostCents: process.env.MV_MAX_COST_CENTS ? Number(process.env.MV_MAX_COST_CENTS) : null,
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

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

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
async function generateSceneImage(prompt: string, refs: Buffer[]): Promise<Buffer> {
  // images.edit accepts reference images to keep the character on-canon.
  const files = await Promise.all(
    refs.slice(0, 4).map(async (buf, i) => await OpenAI.toFile(buf, `ref_${i}.png`, { type: 'image/png' })),
  );
  const result = await openai.images.edit({
    model: 'gpt-image-1',
    image: files as any,
    prompt,
    size: '1536x1024', // 16:9 landscape, matches the horizontal assembly
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('gpt-image-1 returned no image');
  return Buffer.from(b64, 'base64');
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
// 4. Wav2Lip lip-sync (UNVERIFIED — confirm Replicate model version).
//    Serverless GPU: pay per render, $0 idle.
// ===========================================================================
async function wav2lip(faceVideoUrl: string, audioUrl: string): Promise<Buffer> {
  const create = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.replicateToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: cfg.wav2lipVersion, input: { face: faceVideoUrl, audio: audioUrl } }),
  });
  let pred = (await create.json()) as any;
  if (!create.ok) throw new Error(`Replicate create ${create.status}: ${JSON.stringify(pred).slice(0, 200)}`);

  while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
    await sleep(4000);
    pred = await (await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${cfg.replicateToken}` } })).json();
  }
  if (pred.status !== 'succeeded') throw new Error(`Wav2Lip ${pred.status}: ${pred.error ?? ''}`);
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  return Buffer.from(await (await fetch(out)).arrayBuffer());
}

// ===========================================================================
// 5. Captions / SRT (v1 even-timed; WhisperX forced alignment later).
// ===========================================================================
function buildSrt(lyrics: string, durationSeconds: number): string {
  const lines = lyrics.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  const per = durationSeconds / lines.length;
  const ts = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60),
      ms = Math.floor((s - Math.floor(s)) * 1000);
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${p(h)}:${p(m)}:${p(sec)},${p(ms, 3)}`;
  };
  return lines
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

async function assemble(opts: {
  dir: string;
  sceneClips: string[];     // ordered local mp4 paths
  musicPath: string;        // full mix
  srtPath: string | null;
  introPath: string | null;
  outroPath: string | null;
}): Promise<string> {
  const { dir, sceneClips, musicPath, srtPath, introPath, outroPath } = opts;
  const clips = [introPath, ...sceneClips, outroPath].filter(Boolean) as string[];

  // Normalize EVERY clip to 1920x1080 (16:9 horizontal) / 30fps / yuv420p (audio
  // stripped) before concat — Veo/lip-sync clips can come back at varying
  // dims/fps, which would corrupt a concat-demuxer join. Letterbox/pillarbox to
  // fit; never trust the source dimensions.
  const normalized: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const n = path.join(dir, `norm_${i}.mp4`);
    await ffmpeg([
      '-i', clips[i]!,
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-r', '30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-an', n,
    ]);
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

    const vocalUrl = await signedUrl(vl.vocal_stem_url ?? vl.music_url);
    const sceneClips: string[] = [];

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
        veoBuf = await veoImageToVideo(img.toString('base64'), scene.prompt ?? scenePrompt(scene, project, characters));
        const veoPath = `mv/${project.id}/${video.id}/scene_${scene.ordinal}_veo.mp4`;
        await db.storage.from(cfg.bucket).upload(veoPath, veoBuf, { contentType: 'video/mp4', upsert: true });
        await db.from('mv_scenes').update({ veo_clip_path: veoPath }).eq('id', scene.id);
        scene.veo_clip_path = veoPath;
      }

      // Lip-sync IS language-specific. mv_scenes is per-video, so we never reuse
      // lipsync across languages — always re-run wav2lip (cheap) with this
      // language's vocal, storing a language-suffixed object.
      let clipBuf = veoBuf;
      if (scene.is_closeup) {
        clipBuf = await wav2lip(await signedUrl(scene.veo_clip_path), vocalUrl);
        const lsPath = `mv/${project.id}/${video.id}/scene_${scene.ordinal}_lipsync_${vl.language}.mp4`;
        await db.storage.from(cfg.bucket).upload(lsPath, clipBuf, { contentType: 'video/mp4', upsert: true });
        await db.from('mv_scenes').update({ lipsync_clip_path: lsPath }).eq('id', scene.id);
      }

      await fs.writeFile(scenePath, clipBuf);
      sceneClips.push(scenePath);
      log('scene.done', { vlId: vl.id, ordinal: scene.ordinal, closeup: scene.is_closeup, reusedVeo });
    }

    // Music + captions.
    const musicPath = path.join(dir, 'music.mp3');
    await fs.writeFile(musicPath, await download(await signedUrl(vl.music_url)));
    let srtPath: string | null = null;
    if (vl.lyrics) {
      const srt = buildSrt(vl.lyrics, Number(video.duration_seconds) || sceneClips.length * 8);
      srtPath = path.join(dir, 'captions.srt');
      await fs.writeFile(srtPath, srt);
      await uploadAsset(project.id, `mv/${project.id}/${vl.id}/captions.srt`, Buffer.from(srt), 'text/plain', vl, 'srt_path');
    }

    // Intro / outro.
    const introPath = await localizeAsset(dir, project.id, 'intro');
    const outroPath = await localizeAsset(dir, project.id, 'outro');

    const finalPath = await assemble({ dir, sceneClips, musicPath, srtPath, introPath, outroPath });
    const finalBuf = await fs.readFile(finalPath);
    const storagePath = `mv/${project.id}/${vl.id}/final.mp4`;
    await uploadAsset(project.id, storagePath, finalBuf, 'video/mp4', vl, 'final_video_path');

    // Spanish: also produce a 9:16 Short (blurred bg). Other languages later.
    if (vl.language === 'es') {
      const shortLocal = await makeVerticalShort(finalPath);
      const shortStorage = `mv/${project.id}/${vl.id}/final_short.mp4`;
      await db.storage.from(cfg.bucket).upload(shortStorage, await fs.readFile(shortLocal), { contentType: 'video/mp4', upsert: true });
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

function scenePrompt(scene: any, project: any, characters: any[]): string {
  const protagonist = characters.find((c) => c.role === 'protagonist')?.dna?.basePrompt ?? '';
  const stage = project.scenario_bible?.stageBasePrompt ?? '';
  return [protagonist, `Camera: ${scene.camera_position ?? 'front'}.`, scene.prompt ?? '', stage]
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
  await db.storage.from(cfg.bucket).upload(storagePath, buf, { contentType, upsert: true });
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
  // Find the oldest queued video.
  const { data: video } = await db
    .from('mv_videos').select('*').eq('status', 'generating').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!video) return;

  // Atomic claim: flip generating -> rendering only if still generating. If no
  // row comes back, another instance grabbed it first — bail out (no double render).
  const { data: claimed } = await db
    .from('mv_videos').update({ status: 'rendering' })
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
    try {
      await renderVideoLanguage(vl, video, project, characters ?? [], refs);
    } catch (err) {
      log('video_language.failed', { vlId: vl.id, error: (err as Error).message });
      await db.from('mv_video_languages').update({ status: 'failed' }).eq('id', vl.id);
    }
  }

  // Completion: ready only when zero variants remain unrendered; otherwise back
  // to generating so a later tick retries the failed ones.
  const { count } = await db
    .from('mv_video_languages').select('id', { count: 'exact', head: true }).eq('video_id', video.id).neq('status', 'rendered');
  if (count === 0) {
    await db.from('mv_videos').update({ status: 'ready' }).eq('id', video.id);
    log('video.ready', { videoId: video.id });
  } else {
    await db.from('mv_videos').update({ status: 'generating' }).eq('id', video.id);
    log('video.incomplete', { videoId: video.id, remaining: count });
  }
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
