/**
 * reels-render — turns a topic/song into an ADDICTIVE vertical Short.
 *
 * Retention engineering baked in:
 *  - ~1 image per second cuts (rhythm) + Ken Burns zoom (alive)
 *  - impact curve: 0-3s HOOK · 4s reason-to-stay · 9s reward · 16s re-hook ·
 *    23s reward · then CTA  (open loops + payoffs = addiction)
 *  - tech mode: solid spoken topic (ElevenLabs) + "retencion-tiktok" music ducked
 *  - bold attractive captions
 *
 * CLI:
 *   tsx src/reels-render.ts tech "El hackeo que casi nadie nota"
 *   tsx src/reels-render.ts tech --bank        (toma un tema sin usar del banco)
 *   tsx src/reels-render.ts music retencion-tiktok
 *   tsx src/reels-render.ts kids "qué es un bucle"
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { generateImage, veoTextToVideo } from './veo';
import { kids, music } from './reels-strategist';
import { ffmpeg, ffprobeDur, genVoiceTimed, srtFromSegments, wordsToSrt, verticalImageClip, type TimedWord } from './media';

const cfg = {
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  bucket: process.env.MV_BUCKET ?? 'assets',
  cut: Number(process.env.REELS_CUT_SEC ?? 1.0),
  model: process.env.MV_STRATEGIST_MODEL ?? 'gpt-4o',
  musicVol: Number(process.env.REELS_MUSIC_VOL ?? 0.18),
};
const db: SupabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const log = (m: string, e: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), svc: 'reels', msg: m, ...e }));

async function signedUrl(p: string): Promise<string> {
  const { data, error } = await db.storage.from(cfg.bucket).createSignedUrl(p, 3600);
  if (error || !data) throw new Error(`signedUrl ${p}`);
  return data.signedUrl;
}
async function download(url: string): Promise<Buffer> { return Buffer.from(await (await fetch(url)).arrayBuffer()); }

interface Plan {
  rm: any;            // retencion_map
  imgPrompts: string[];
  voz?: string;       // narration (tech/kids)
  trackPath?: string; // bg music storage path (tech/music)
  slug: string;
}

/** Tech mode: a solid spoken topic engineered for CTR + retention. */
async function techPlan(topic: string): Promise<Plan> {
  const sys = 'Eres guionista de Shorts tech faceless ADICTIVOS (CPM alto). Para el tema dado escribe un guion vertical de ~24s en español, una sola idea, con DATOS concretos y giros, que dé clic y retenga hasta el final. Aplica psicología de retención: open loops, recompensas, curiosidad. Devuelve JSON: {"retencion_map":{"hook_0_3s":"gancho brutal 0-3s","quedate_4s":"razón para quedarse","recompensa_9s":"primer payoff/dato fuerte","reenganche_16s":"nuevo gancho","recompensa_23s":"segundo payoff","cta":"CTA potente"},"voz":"narración fluida de ~24s que se lee en voz alta (incluye los beats anteriores en orden, natural)","imagen":["8 prompts EN INGLÉS cinematic vertical tech, sin texto, alta calidad"]}.';
  const res = await openai.chat.completions.create({
    model: cfg.model, temperature: 0.85, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: sys }, { role: 'user', content: `Tema: ${topic}` }],
  });
  const j = JSON.parse(res.choices[0]?.message?.content ?? '{}');
  // bg music from the viral mood
  const { data } = await db.from('mv_music_library').select('storage_path').eq('mood', 'retencion-tiktok').limit(20);
  const pick = (data ?? [])[Math.floor(Math.random() * Math.max(1, (data ?? []).length))];
  return { rm: j.retencion_map ?? {}, imgPrompts: j.imagen ?? [], voz: j.voz, trackPath: pick?.storage_path, slug: 'tech' };
}

async function fromStrategist(mode: 'kids' | 'music', content: string): Promise<Plan & { _trackDur?: number }> {
  const strat = mode === 'kids' ? await kids(content) : await music(content);
  const pick = (strat.seleccion ?? [])[0];
  if (!pick) throw new Error('estratega sin formatos');
  const b = pick.brief ?? {};
  const f: string[] = b.generadores?.frase ?? [];
  const rm = b.retencion_map ?? {
    hook_0_3s: b.hook_0_3s || b.hook_0_5s || f[0], quedate_4s: f[1], recompensa_9s: f[2],
    reenganche_16s: f[3], recompensa_23s: f[4], cta: mode === 'kids' ? 'Sigue el canal y aprende mas' : 'Sigueme para mas',
  };
  return { rm, imgPrompts: b.generadores?.imagen ?? [], voz: mode === 'kids' ? b.generadores?.voz : undefined, trackPath: strat._track?.storage_path, slug: pick.slug };
}

export async function renderReel(mode: string, content: string): Promise<{ dest: string }> {
  let plan: Plan;
  if (mode === 'tech') plan = await techPlan(content);
  else if (mode === 'music' || mode === 'kids') plan = await fromStrategist(mode, content);
  else throw new Error('modo inválido');

  const hasVoice = !!plan.voz;
  const hasMusic = !!plan.trackPath;
  const style = mode === 'kids'
    ? 'Colorful flat friendly children educational illustration, bold simple shapes, no text, '
    : 'Cinematic high-contrast vertical tech visual, dramatic lighting, modern, no text, ';

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reels_'));
  try {
    // audio first (defines total length when there's a voiceover)
    let T = 27;
    let words: TimedWord[] = [];
    const audio = path.join(dir, 'audio.m4a');
    if (hasVoice) {
      const voiceMp3 = path.join(dir, 'voice.mp3');
      const tv = await genVoiceTimed(String(plan.voz));
      await fs.writeFile(voiceMp3, tv.mp3);
      words = tv.words;
      const vd = await ffprobeDur(voiceMp3);
      T = Math.min(34, Math.max(12, vd || 24));
      if (hasMusic) {
        const tr = path.join(dir, 'track.mp3');
        await fs.writeFile(tr, await download(await signedUrl(plan.trackPath!)));
        const mloop = path.join(dir, 'mloop.m4a');
        await ffmpeg(['-stream_loop', '-1', '-i', tr, '-t', T.toFixed(2), '-af', `volume=${cfg.musicVol}`, '-c:a', 'aac', mloop]);
        await ffmpeg(['-i', voiceMp3, '-i', mloop, '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]', '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', audio]);
      } else {
        await ffmpeg(['-i', voiceMp3, '-c:a', 'aac', '-b:a', '160k', audio]);
      }
    } else {
      const tr = path.join(dir, 'track.mp3');
      await fs.writeFile(tr, await download(await signedUrl(plan.trackPath!)));
      await ffmpeg(['-stream_loop', '-1', '-i', tr, '-t', T.toFixed(2), '-c:a', 'aac', '-b:a', '160k', audio]);
    }
    log('audio', { mode, T: +T.toFixed(1), voice: hasVoice, music: hasMusic });

    const nCuts = Math.max(6, Math.ceil(T / cfg.cut));
    const veoN = Number(process.env.REELS_VEO ?? (mode === 'tech' ? 3 : 0));
    const cutClips: string[] = [];

    if (veoN > 0) {
      // PREMIUM: real Veo motion → normalize vertical → concat → jump-cut 1s windows
      const prompts = plan.imgPrompts.length ? plan.imgPrompts : [content];
      const norms: string[] = [];
      for (let k = 0; k < veoN; k++) {
        log('veo', { k: k + 1, of: veoN });
        const buf = await veoTextToVideo((prompts[k % prompts.length] || content) + ', cinematic premium vertical, no text, no words', '9:16');
        const raw = path.join(dir, `veo_${k}.mp4`); await fs.writeFile(raw, buf);
        const norm = path.join(dir, `vn_${k}.mp4`);
        // Veo is already 9:16 → just normalize to exact 1080x1920 (no crop, no upscale pixelation)
        await ffmpeg(['-i', raw, '-vf', 'scale=1080:1920:flags=lanczos,setsar=1,fps=30,format=yuv420p', '-an', '-c:v', 'libx264', '-crf', '18', norm]);
        norms.push(norm);
      }
      const nlist = path.join(dir, 'nlist.txt'); await fs.writeFile(nlist, norms.map((c) => `file '${c}'`).join('\n'));
      const motion = path.join(dir, 'motion.mp4');
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', nlist, '-c', 'copy', motion]);
      const md = (await ffprobeDur(motion)) || veoN * 8;
      const stride = 1.9; // jump-cut stride for rhythm
      for (let i = 0; i < nCuts; i++) {
        const off = (i * stride) % Math.max(0.1, md - cfg.cut);
        const c = path.join(dir, `c_${i}.mp4`);
        await ffmpeg(['-ss', off.toFixed(2), '-i', motion, '-t', cfg.cut.toFixed(2), '-r', '30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', c]);
        cutClips.push(c);
      }
    } else {
      // FALLBACK: gpt-image stills + Ken Burns zoom
      const nImg = Math.min(Math.max(plan.imgPrompts.length, 6), 10);
      const pool: Buffer[] = [];
      for (let i = 0; i < nImg; i++) { pool.push(await generateImage(style + (plan.imgPrompts[i] || content), '1024x1536')); log('image', { i: i + 1, of: nImg }); }
      for (let i = 0; i < nCuts; i++) cutClips.push(await verticalImageClip(dir, i, pool[i % pool.length]!, cfg.cut, i % 2 === 0));
    }

    const list = path.join(dir, 'list.txt');
    await fs.writeFile(list, cutClips.map((c) => `file '${c}'`).join('\n'));
    const video = path.join(dir, 'video.mp4');
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);

    // Captions: word-synced karaoke from the voice timestamps (Eleven/Whisper);
    // if there's no voice (music mode), fall back to the retention-map overlay.
    const srt = path.join(dir, 'beats.srt');
    if (words.length) {
      await fs.writeFile(srt, wordsToSrt(words, 3, 1.4));
      log('captions', { mode: 'word-synced', words: words.length });
    } else {
      const f = T / 27;
      const rm = plan.rm ?? {};
      const segs = [
        { s: 0, e: 3.5 * f, text: rm.hook_0_3s || content },
        { s: 3.5 * f, e: 9 * f, text: rm.quedate_4s || '' },
        { s: 9 * f, e: 16 * f, text: rm.recompensa_9s || '' },
        { s: 16 * f, e: 23 * f, text: rm.reenganche_16s || '' },
        { s: 23 * f, e: Math.max(23 * f, T - 3.2), text: rm.recompensa_23s || '' },
        { s: Math.max(23 * f, T - 3.2), e: T, text: rm.cta || '' },
      ];
      await fs.writeFile(srt, srtFromSegments(segs));
    }

    // burn attractive captions (big, bold, bright, mid-upper) + mux
    const out = path.join(dir, 'short.mp4');
    const style2 = "Fontname=Arial Black,Fontsize=30,Bold=1,PrimaryColour=&H0000F5FF,OutlineColour=&H00000000,BorderStyle=1,Outline=6,Shadow=2,Alignment=2,MarginV=620";
    const vf = `subtitles=beats.srt:force_style='${style2}'`;
    await ffmpeg(['-i', video, '-i', audio, '-vf', vf, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-shortest', out], { cwd: dir });

    const stamp = String(Date.now());
    const dest = `mv/reels/${mode}/${plan.slug}_${stamp}.mp4`;
    const { error } = await db.storage.from(cfg.bucket).upload(dest, await fs.readFile(out), { contentType: 'video/mp4', upsert: true });
    if (error) throw new Error(`upload: ${error.message}`);
    log('done', { dest });
    return { dest };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const mode = process.argv[2] ?? '';
  let content = process.argv.slice(3).join(' ').trim();
  let pickedId: string | null = null;
  if (mode === 'tech' && (content === '--bank' || !content)) {
    const { data } = await db.from('mv_topic_bank').select('id, topic').eq('used', false).eq('niche', 'tech').limit(1);
    const t = (data ?? [])[0];
    if (!t) throw new Error('no hay temas sin usar en el banco');
    content = t.topic; pickedId = t.id;
    log('bank.pick', { topic: content });
  }
  if (!['tech', 'music', 'kids'].includes(mode) || !content) {
    console.error('Uso: reels-render.ts <tech "<tema>"|tech --bank|music <mood>|kids "<tema>">');
    process.exit(1);
  }
  const { dest } = await renderReel(mode, content);
  console.log('\n✅ REEL LISTO:', dest);
  console.log('▶️  ', await signedUrl(dest));
  if (pickedId) await db.from('mv_topic_bank').update({ used: true }).eq('id', pickedId); // marca solo tras éxito
}

// Only run the CLI when invoked directly, not when imported by the poller.
if (process.argv[1] && /reels-render\.(ts|js)$/.test(process.argv[1])) {
  main().catch((e) => { console.error('ERR', e?.message ?? e); process.exit(1); });
}
