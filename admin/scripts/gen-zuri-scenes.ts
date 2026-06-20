// gen-zuri-scenes.ts — suma escenas NUEVAS al banco de Zuri desde el CANON (Veo first/last).
// Genera frame inicial+final canon-locked (gpt-image + refs) y los anima con py/veo_scene.py,
// que antepone el ADN canon, esquiva el filtro de rostros y clasifica en data/bank/zuri.
// Uso: tsx scripts/gen-zuri-scenes.ts [N=2] [offset=0]
import path from 'node:path';
import fs from 'node:fs';
import { geminiImage } from '../src/ai/gemini-image';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile);

const N = Number(process.argv[2] || 2);
const OFF = Number(process.argv[3] || 0);
const REFS = ['IMG_8730.PNG', 'IMG_8731.PNG', 'zuri_closeup_manos_abierta.png']
  .map((f) => path.join(ROOT, 'data', 'characters', 'zuri', 'refs', f)).filter((p) => fs.existsSync(p));
const WORK = path.join(ROOT, 'data', 'bank', 'zuri', '_intake'); fs.mkdirSync(WORK, { recursive: true });
const FOREST = 'in a magical glowing forest universe with lanterns, fireflies and floating neon music notes, soft bokeh blurred background, Pixar-quality 3D render, cinematic, 16:9';
const CANON = 'Zuri the caramel-furred meerkat girl pop star — KEEP HER EXACT CANON: two pink roses on her head, yellow long-sleeve crop sweater with a blue heart containing a gold star, black shorts, red rose sandals; big brown eyes; small figure framed in the scene (not a big frontal close-up)';
const NEG = 'morphing, distorted face, extra limbs, text, watermark, changing the outfit, big frontal face close-up, guitar, musical instrument, holding objects';

// Pool de escenas (función, energía, toma, tags, acción frame1 → frame2)
const SCENES = [
  { fn: 'coro', en: 'high', shot: 'wide', tags: 'cantar,mic,energia', a: 'singing into a glowing microphone with arms raised', b: 'jumping with joy, arms wide, mid-dance' },
  { fn: 'verso', en: 'medium', shot: 'side', tags: 'guitarra,caminar', a: 'walking and holding her gold star-shaped guitar, side view', b: 'stopped, strumming the star guitar, looking up softly' },
  { fn: 'puente', en: 'low', shot: 'medium', tags: 'ternura,mirar', a: 'standing still looking up tenderly with hands near her heart', b: 'closing her eyes, gentle smile, fireflies around' },
  { fn: 'coro', en: 'high', shot: 'wide', tags: 'baile,giro', a: 'starting to spin, dress flowing', b: 'mid twirl, joyful, arms out' },
  { fn: 'verso', en: 'medium', shot: 'back', tags: 'caminar,espalda', a: 'seen from behind walking toward glowing lanterns', b: 'seen from behind, pausing, looking at the forest lights' },
  { fn: 'puente', en: 'low', shot: 'medium', tags: 'amigos,bosque', a: 'sitting on a mushroom with a small forest animal friend', b: 'gently waving, soft warm light' },
  { fn: 'coro', en: 'high', shot: 'wide', tags: 'mic,saltar', a: 'holding the mic, one fist up, confident', b: 'jumping, big smile, notes floating' },
  { fn: 'verso', en: 'medium', shot: 'side', tags: 'pasos,faroles', a: 'walking past glowing lanterns, side view', b: 'turning her head, soft smile' },
  { fn: 'puente', en: 'low', shot: 'medium', tags: 'emocion,luciernagas', a: 'hands open catching fireflies, tender', b: 'looking at the fireflies in her hands, glowing' },
  { fn: 'coro', en: 'high', shot: 'wide', tags: 'escenario,baile', a: 'on a small natural stage, dancing', b: 'arms up, celebrating, sparkles' },
  { fn: 'verso', en: 'medium', shot: 'medium', tags: 'guitarra,sentada', a: 'sitting on a glowing rock playing her star guitar', b: 'looking up while strumming, soft smile' },
  { fn: 'puente', en: 'low', shot: 'wide', tags: 'mirar,cielo', a: 'standing small under a big starry sky in the forest, looking up', b: 'hand on chest, peaceful, glowing stars' },
  { fn: 'coro', en: 'high', shot: 'side', tags: 'salto,energia', a: 'running happily through the forest, side view', b: 'leaping with joy, music notes trailing' },
  { fn: 'verso', en: 'medium', shot: 'back', tags: 'farol,espalda', a: 'from behind reaching toward a floating glowing lantern', b: 'from behind, holding the lantern light, warm glow' },
  { fn: 'puente', en: 'low', shot: 'medium', tags: 'lluvia,suave', a: 'standing under soft glowing rain in the forest, tender', b: 'eyes closed, gentle, droplets sparkling' },
  { fn: 'coro', en: 'high', shot: 'wide', tags: 'amigos,fiesta', a: 'dancing with two little forest animal friends', b: 'all jumping together, confetti of light' },
  { fn: 'verso', en: 'medium', shot: 'side', tags: 'pensar,caminar', a: 'walking slowly with a thoughtful look, side view', b: 'stopping, a small hopeful smile appears' },
  { fn: 'puente', en: 'low', shot: 'medium', tags: 'corazon,ternura', a: 'hands forming a heart shape, tender expression', b: 'releasing glowing heart sparkles into the air' },
  { fn: 'coro', en: 'high', shot: 'wide', tags: 'mic,final', a: 'holding the mic with both hands, powerful pose', b: 'arms thrown up in a triumphant finale, lights burst' },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function frame(prompt: string, out: string) {
  await geminiImage(`${CANON}, ${prompt}, ${FOREST}`, out, { aspectRatio: '16:9', refImagePaths: REFS });
}

let made = 0;
for (let k = 0; k < N; k++) {
  const sc = SCENES[(OFF + k) % SCENES.length];
  const id = `auto_${sc.fn}_${sc.shot}_${OFF + k}`;
  const f1 = path.join(WORK, id + '_a.png');
  const f2 = path.join(WORK, id + '_b.png');
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    try {
      log.step(`Escena ${OFF + k + 1}${attempt > 1 ? ` (intento ${attempt})` : ''}: ${sc.fn}/${sc.en}/${sc.shot} — ${sc.a.slice(0, 38)}…`);
      if (!(fs.existsSync(f1) && fs.statSync(f1).size > 10000)) await frame(sc.a, f1);
      if (!(fs.existsSync(f2) && fs.statSync(f2).size > 10000)) await frame(sc.b, f2);
      const prompt = `${sc.a} transitioning to ${sc.b}. Smooth Pixar-quality motion, keep the character identical, no morphing.`;
      const { stdout } = await exec('python', ['py/veo_scene.py', 'zuri', id, sc.fn, sc.en, sc.shot, sc.tags, f1, f2, prompt, NEG], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 1 << 24 });
      log.ok(stdout.trim().split('\n').slice(-1).join(' '));
      made++; ok = true;
    } catch (e) {
      log.warn(`escena ${OFF + k} intento ${attempt}: ${(e as Error).message.slice(0, 100)}`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  if (!ok) log.err(`escena ${OFF + k}: falló tras 3 intentos`);
}
console.log(`\n✅ Zuri: ${made}/${N} escenas nuevas al banco`);
