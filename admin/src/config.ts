import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(dir, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CHARACTERS_DIR = path.join(DATA_DIR, 'characters');
export const SONGS_DIR = path.join(DATA_DIR, 'songs');
export const OUTPUT_DIR = path.join(DATA_DIR, 'output');
export const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

const env = (name: string, def = '') => process.env[name]?.trim() || def;

const LIAM = 'TX3LPaxmHKxFdv7VOQHJ'; // voz masculina multiidioma por defecto (Sabi)

export const config = {
  gcp: {
    projectId: env('GCP_PROJECT_ID', 'passkal'),
    location: env('GCP_LOCATION', 'us-central1'),
  },
  models: {
    imagen: env('IMAGEN_MODEL', 'imagen-3.0-generate-002'),
    imagenCustom: env('IMAGEN_CUSTOM_MODEL', 'imagen-3.0-capability-001'),
    veo: env('VEO_MODEL', 'veo-3.0-fast-generate-001'),
    gemini: env('GEMINI_MODEL', 'gemini-2.5-flash'),
    geminiVision: env('GEMINI_VISION_MODEL', 'gemini-2.5-flash'),
    geminiImage: env('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image'),
  },
  lipsync: {
    provider: env('LIPSYNC_PROVIDER'),
    apiUrl: env('LIPSYNC_API_URL'),
    apiKey: env('LIPSYNC_API_KEY'),
  },
  ffmpeg: {
    ffmpeg: env('FFMPEG_PATH', 'ffmpeg'),
    ffprobe: env('FFPROBE_PATH', 'ffprobe'),
  },
  elevenlabs: {
    apiKey: env('ELEVENLABS_API_KEY'),
    voiceId: env('ELEVENLABS_VOICE_ID', LIAM),
    modelId: env('ELEVENLABS_MODEL', 'eleven_multilingual_v2'),
    // Un voice ID por idioma (sobrescribible). Default: Liam multiidioma.
    voices: {
      es: env('ELEVENLABS_VOICE_ES', LIAM),
      en: env('ELEVENLABS_VOICE_EN', LIAM),
      it: env('ELEVENLABS_VOICE_IT', LIAM),
      zh: env('ELEVENLABS_VOICE_ZH', LIAM),
    } as Record<string, string>,
  },
  fonts: {
    latin: env('FONT_LATIN', 'C:/Windows/Fonts/arialbd.ttf'),
    cjk: env('FONT_CJK', 'C:/Windows/Fonts/msyh.ttc'),
  },
  sync: {
    apiKey: env('SYNC_API_KEY'),
    model: env('SYNC_MODEL', 'lipsync-2'),
  },
  youtube: {
    clientId: env('YT_CLIENT_ID'),
    clientSecret: env('YT_CLIENT_SECRET'),
    redirectUri: env('YT_REDIRECT_URI', 'http://localhost:8088/oauth2callback'),
  },
  sounds: {
    url: env('SOUNDS_SUPABASE_URL'),
    key: env('SOUNDS_SUPABASE_KEY'),
    bucket: env('SOUNDS_BUCKET', 'reels-music'),
    moods: ['arrullo', 'calido-folk', 'calmado', 'emotivo', 'ensueno',
      'esperanzador', 'exotico-premium', 'nostalgia', 'retencion-tiktok', 'tenso-suave'] as const,
  },
  video: {
    clipSeconds: 8,
    fps: 24,
    masterSize: { w: 1920, h: 1080 }, // 16:9
    reelSize: { w: 1080, h: 1920 },   // 9:16
  },
  languages: ['es', 'pt', 'it', 'en'] as const,
};

export type Lang = (typeof config.languages)[number];
