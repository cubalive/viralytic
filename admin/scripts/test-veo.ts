// Prueba de Veo: un clip de 8s con movimiento, encadenando dos poses de Sabi.
import path from 'node:path';
import { generateVideo } from '../src/ai/veo';
import { CHARACTERS_DIR, config } from '../src/config';

const canon = path.join(CHARACTERS_DIR, 'sabi', 'canon');
const out = path.join('data', 'output', '_veo_test.mp4');

console.log(`Modelo Veo: ${config.models.veo} · región ${config.gcp.location}`);
console.log('Generando clip (puede tardar 1-3 min)...');

const r = await generateVideo(
  'The cute teal-and-yellow robot Sabi waves hello and bounces happily with smooth lively motion, ' +
    'children cartoon style, vertical 9:16, clean background, no text.',
  out,
  {
    firstFrame: path.join(canon, 'sabi_01_wave.png'),
    lastFrame: path.join(canon, 'sabi_03_celebrate.png'),
    aspectRatio: '9:16',
    generateAudio: false,
  },
);
console.log('VEO OK →', r);
