/**
 * faceless-render — render engine for faceless narrated videos (tech/IA niche).
 *
 * Reuses the mv_* pipeline (same tables, channels, publish, notify) but produces
 * a NARRATED slideshow instead of a music video:
 *   topic → script (GPT) → voiceover (ElevenLabs) → images (gpt-image via veo.ts)
 *   → ffmpeg slideshow + burned captions → master 16:9 + Short 9:16 → mark rendered.
 *
 * Separate process from index.ts (Zuri music). Claims only kind='faceless'.
 * Run:  pnpm --filter @viralytic/mv-render faceless
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { generateImage } from './veo';
import { buildVideoMetadata, type Lang } from './metadata';

const exec = promisify(execFile);

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const cfg = {
  supabaseUrl: req('SUPABASE_URL'),
  supabaseKey: req('SUPABASE_SERVICE_ROLE_KEY'),
  openaiKey: req('OPENAI_API_KEY'),
  elevenKey: process.env.ELEVENLABS_API_KEY ?? '',
  elevenVoice: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM', // default multilingual voice
  elevenModel: process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2',
  bucket: process.env.MV_BUCKET ?? 'assets',
  scriptModel: process.env.MV_SCRIPT_MODEL ?? 'gpt-4o',
  images: Number(process.env.FACELESS_IMAGES ?? 7),
  pollMs: Number(process.env.FACELESS_POLL_MS ?? 10000),
  reclaimMinutes: Number(process.env.MV_RECLAIM_MINUTES ?? 30),
};

const db: SupabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: cfg.openaiKey });
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: 'faceless', msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LANG_NAME: Record<string, string> = { es: 'Spanish', en: 'English', zh: 'Simplified Chinese' };

// ---- small storage/ffmpeg helpers (self-contained) ----
async function signedUrl(p: string): Promise<string> {
  if (/^https?:\/\//.test(p)) return p;
  const { data, error } = await db.storage.from(cfg.bucket).createSignedUrl(p, 3600);
  if (error || !data) throw new Error(`signedUrl failed for ${p}`);
  return data.signedUrl;
}
async function download(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}
async function ffmpeg(args: string[]): Promise<void> { await exec('ffmpeg', ['-y', ...args], { maxBuffer: 1 << 26 }); }
async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { maxBuffer: 1 << 20 });
    return Number(String(stdout).trim()) || 0;
  } catch { return 0; }
}

// ---- generation steps ----
async function genScript(topic: string, lang: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: cfg.scriptModel,
    temperature: 0.8,
    messages: [
      { role: 'system', content: `You write tight, high-retention faceless YouTube narration scripts about tech/AI in ${LANG_NAME[lang] ?? 'English'}. Strong 1-line hook, then value-packed, punchy sentences. ~140-170 words. No stage directions, no headings, no emojis — just the spoken narration.` },
      { role: 'user', content: `Topic: ${topic}` },
    ],
  });
  return (res.choices[0]?.message?.content ?? '').trim();
}

async function genVoice(text: string): Promise<Buffer> {
  if (!cfg.elevenKey) throw new Error('ELEVENLABS_API_KEY not set');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.elevenVoice}`, {
    method: 'POST',
    headers: { 'xi-api-key': cfg.elevenKey, 'Content-Type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: cfg.elevenModel, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function genVisualPrompts(script: string, n: number): Promise<string[]> {
  const res = await openai.chat.completions.create({
    model: cfg.scriptModel,
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `Given a tech/AI narration script, output ${n} concise ENGLISH image prompts for a faceless video slideshow: clean, modern, cinematic tech/abstract visuals (devices, UIs, data, futuristic scenes) that match the script beats in order. NO text/words in the images, no people's faces. Return JSON {"prompts":["...", ...]} with exactly ${n} items.` },
      { role: 'user', content: script.slice(0, 3000) },
    ],
  });
  const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as { prompts?: string[] };
  const p = (parsed.prompts ?? []).filter(Boolean);
  while (p.length < n) p.push('clean modern abstract technology background, cinematic lighting, blue and magenta tones');
  return p.slice(0, n);
}

function buildSrt(script: string, duration: number): string {
  const lines = script.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return '';
  const totalChars = lines.reduce((a, l) => a + l.length, 0);
  const ts = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.floor((s - Math.floor(s)) * 1000);
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${p(h)}:${p(m)}:${p(sec)},${p(ms, 3)}`;
  };
  let cursor = 0;
  return lines.map((text, i) => {
    const dur = (text.length / totalChars) * duration;
    const start = cursor; cursor += dur;
    return `${i + 1}\n${ts(start)} --> ${ts(cursor)}\n${text}\n`;
  }).join('\n');
}

async function makeVerticalShort(horizontalPath: string): Promise<string> {
  const out = horizontalPath.replace(/\.mp4$/, '_short.mp4');
  await ffmpeg(['-i', horizontalPath, '-filter_complex', '[0:v]scale=1080:1920,boxblur=40:5[bg];[0:v]scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2', '-c:a', 'copy', out]);
  return out;
}

async function assemble(dir: string, images: Buffer[], voPath: string, srtPath: string): Promise<string> {
  const voDur = (await probeDuration(voPath)) || images.length * 5;
  const per = Math.max(2, voDur / images.length);
  const clips: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = path.join(dir, `img_${i}.png`);
    await fs.writeFile(img, images[i]!);
    const clip = path.join(dir, `clip_${i}.mp4`);
    await ffmpeg(['-loop', '1', '-i', img, '-t', per.toFixed(2), '-r', '30',
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,format=yuv420p',
      '-an', '-c:v', 'libx264', clip]);
    clips.push(clip);
  }
  const list = path.join(dir, 'list.txt');
  await fs.writeFile(list, clips.map((c) => `file '${c}'`).join('\n'));
  const video = path.join(dir, 'video.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);

  const out = path.join(dir, 'final.mp4');
  const vf = `subtitles=${srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')}:force_style='Alignment=2,MarginV=80,Fontsize=24,Outline=3,Bold=1'`;
  await ffmpeg(['-i', video, '-i', voPath, '-vf', vf, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-shortest', out]);
  return out;
}

async function renderVariant(vl: any, video: any, project: any): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fc_${vl.id}_`));
  try {
    // 1) script
    let script = vl.script as string | null;
    if (!script) {
      script = await genScript(video.title, vl.language);
      await db.from('mv_video_languages').update({ script }).eq('id', vl.id);
    }
    // 2) voiceover
    let voPath = path.join(dir, 'vo.mp3');
    if (vl.voiceover_url) {
      await fs.writeFile(voPath, await download(await signedUrl(vl.voiceover_url)));
    } else {
      const vo = await genVoice(script);
      await fs.writeFile(voPath, vo);
      const voStorage = `mv/${project.id}/${video.id}/${vl.language}_vo.mp3`;
      const { error } = await db.storage.from(cfg.bucket).upload(voStorage, vo, { contentType: 'audio/mpeg', upsert: true });
      if (error) throw new Error(`vo upload: ${error.message}`);
      await db.from('mv_video_languages').update({ voiceover_url: voStorage }).eq('id', vl.id);
    }
    const voDur = await probeDuration(voPath);

    // 3) visuals
    const prompts = await genVisualPrompts(script, cfg.images);
    const images = await Promise.all(prompts.map((p) => generateImage(p)));
    log('faceless.visuals', { vlId: vl.id, n: images.length });

    // 4) captions + assemble
    const srtPath = path.join(dir, 'cap.srt');
    await fs.writeFile(srtPath, buildSrt(script, voDur || cfg.images * 5));
    const finalPath = await assemble(dir, images, voPath, srtPath);

    // 5) upload master + short
    const masterStorage = `mv/${project.id}/${vl.id}/final.mp4`;
    const { error: mErr } = await db.storage.from(cfg.bucket).upload(masterStorage, await fs.readFile(finalPath), { contentType: 'video/mp4', upsert: true });
    if (mErr) throw new Error(`master upload: ${mErr.message}`);

    const shortLocal = await makeVerticalShort(finalPath);
    const shortStorage = `mv/${project.id}/${vl.id}/final_short.mp4`;
    await db.storage.from(cfg.bucket).upload(shortStorage, await fs.readFile(shortLocal), { contentType: 'video/mp4', upsert: true });

    // 6) algorithm-tuned YouTube metadata (native per language) → stored for the publisher.
    const metadata = await buildVideoMetadata({
      kind: 'faceless',
      language: (vl.language as Lang) ?? 'en',
      workingTitle: video.title,
      body: script,
      brand: project.name ?? 'Signal',
      niche: 'tech / IA / future',
      lore: '#SignalFromTheFuture',
    });

    await db.from('mv_video_languages').update({ status: 'rendered', final_video_path: masterStorage, short_video_path: shortStorage, metadata }).eq('id', vl.id);
    log('faceless.variant.rendered', { vlId: vl.id });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function tick(): Promise<void> {
  const staleBefore = new Date(Date.now() - cfg.reclaimMinutes * 60_000).toISOString();
  await db.from('mv_videos').update({ status: 'generating', updated_at: new Date().toISOString() })
    .eq('status', 'rendering').eq('kind', 'faceless').lt('updated_at', staleBefore);

  const { data: video } = await db.from('mv_videos').select('*')
    .eq('status', 'generating').eq('kind', 'faceless').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!video) return;

  const { data: claimed } = await db.from('mv_videos').update({ status: 'rendering', updated_at: new Date().toISOString() })
    .eq('id', video.id).eq('status', 'generating').select('id');
  if (!claimed?.length) return;

  const { data: project } = await db.from('mv_projects').select('*').eq('id', video.project_id).single();
  const { data: variants } = await db.from('mv_video_languages').select('*').eq('video_id', video.id).neq('status', 'rendered');

  for (const vl of variants ?? []) {
    try {
      await renderVariant(vl, video, project);
    } catch (err) {
      log('faceless.variant.failed', { vlId: vl.id, error: (err as Error).message });
      await db.from('mv_video_languages').update({ status: 'failed' }).eq('id', vl.id);
    }
  }

  const { data: vls } = await db.from('mv_video_languages').select('status').eq('video_id', video.id);
  const all = vls ?? [];
  const allRendered = all.length > 0 && all.every((v: any) => v.status === 'rendered');
  const anyFailed = all.some((v: any) => v.status === 'failed');
  const next = allRendered ? 'ready' : anyFailed ? 'failed' : 'ready';
  await db.from('mv_videos').update({ status: next }).eq('id', video.id);
  log('faceless.completion', { videoId: video.id, next });
}

async function main(): Promise<void> {
  log('faceless-render.started', { model: cfg.scriptModel, images: cfg.images });
  let running = true;
  process.on('SIGTERM', () => { running = false; });
  while (running) {
    try { await tick(); } catch (err) { log('tick.error', { error: (err as Error).message }); }
    await sleep(cfg.pollMs);
  }
  process.exit(0);
}

main().catch((err) => { log('fatal', { error: (err as Error).message }); process.exit(1); });
