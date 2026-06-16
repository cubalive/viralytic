// Prueba: Veo genera a Sabi HABLANDO (voz + boca sincronizada nativa).
import path from 'node:path';
import { generateVideo } from '../src/ai/veo';
import { CHARACTERS_DIR } from '../src/config';

const canon = path.join(CHARACTERS_DIR, 'sabi', 'canon');
const out = path.join('data', 'output', '_veo_talk_test.mp4');

const r = await generateVideo(
  'The cute teal-and-yellow robot Sabi looks at the camera and says cheerfully in Spanish: ' +
    '"¡Hola amiguitos! Hoy vamos a aprender los animales de la granja." ' +
    'Sabi opens and moves its mouth clearly and naturally in sync while speaking, with friendly gestures. ' +
    'Children cartoon, vertical 9:16, clean colorful background, no text.',
  out,
  { firstFrame: path.join(canon, 'sabi_06_neutral.png'), aspectRatio: '9:16', generateAudio: true },
);
console.log('OK →', r);
