import { tts } from '../src/ai/elevenlabs';
import { probeDuration } from '../src/lib/ffmpeg';

const out = await tts(
  'Hola, soy Sabi. Hoy vamos a aprender qué es un bucle, ¡acompáñame!',
  './data/output/_tts_test.mp3',
);
console.log('TTS OK →', out, (await probeDuration(out)).toFixed(1) + 's');
