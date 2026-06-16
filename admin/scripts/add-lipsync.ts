// Aplica lip sync (Sync.so) a un reel YA generado, sin regenerar Veo.
// Uso: tsx scripts/add-lipsync.ts <carpeta-del-reel> [lang]
import path from 'node:path';
import { syncLips } from '../src/edu/lipsync-sync';
import { burnCaptionsAndAudio } from '../src/edu/captions';
import { exists } from '../src/lib/files';

const dir = process.argv[2];
const lang = process.argv[3] || 'es';
if (!dir) throw new Error('Uso: tsx scripts/add-lipsync.ts <carpeta-del-reel> [lang]');

const motion = path.join(dir, 'motion.mp4');
const voz = path.join(dir, 'voz.mp3');
const audio = path.join(dir, 'audio.mp3');
const srt = path.join(dir, 'captions.srt');
const synced = path.join(dir, 'synced.mp4');

console.log('Lip sync sobre', motion);
await syncLips(motion, voz, synced);
const out = path.join(dir, 'reel_9x16_synced.mp4');
await burnCaptionsAndAudio(synced, audio, exists(srt) ? srt : null, lang, out);
console.log('\n=== REEL SINCRONIZADO ===\n' + out);
