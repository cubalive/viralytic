// Genera el CANON de Sabi (poses consistentes de anfitrión educativo) a partir
// del concepto elegido (concept_01_teal_yellow). Usa la imagen como referencia.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { geminiImage } from '../src/ai/gemini-image';
import { CHARACTERS_DIR } from '../src/config';
import { ensureDir, exists, loadManifest, saveManifest } from '../src/lib/files';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dir = path.join(CHARACTERS_DIR, 'sabi');
const ref = path.join(dir, 'concepts', 'concept_01_teal_yellow.png');
const canonDir = path.join(dir, 'canon');
await ensureDir(canonDir);

// Guarda el concepto elegido como referencia oficial.
await fsp.copyFile(ref, path.join(dir, 'reference.png'));

const STYLE =
  'Same cute robot character "Sabi": teal rounded TV-screen head with a yellow face inside, ' +
  'big friendly eyes, small antenna with a yellow ball, chubby teal body with yellow hands and feet. ' +
  'Keep the design EXACTLY consistent with the reference image. Clean flat cartoon style, ' +
  'plain white background, full body, kid-friendly, bright. ';

const POSES: { id: string; prompt: string }[] = [
  { id: '01_wave',     prompt: STYLE + 'Waving hello with one hand, happy welcoming pose.' },
  { id: '02_present',  prompt: STYLE + 'Presenting: turned slightly, one arm extended with open palm to the side as if showing something.' },
  { id: '03_celebrate',prompt: STYLE + 'Both arms raised up, celebrating, very happy, eyes sparkling.' },
  { id: '04_think',    prompt: STYLE + 'Curious thinking pose, one hand near the chin, head slightly tilted.' },
  { id: '05_clap',     prompt: STYLE + 'Clapping hands, joyful and proud.' },
  { id: '06_neutral',  prompt: STYLE + 'Neutral standing pose, arms relaxed, gentle smile (default pose).' },
  { id: '07_face',     prompt: STYLE + 'Close-up of the face only, big happy smile, friendly.' },
  { id: '08_point',    prompt: STYLE + 'Pointing with one hand toward the lower side, inviting to look.' },
];

const made: string[] = [];
for (const p of POSES) {
  const out = path.join(canonDir, `sabi_${p.id}.png`);
  if (exists(out)) { made.push(out); console.log(`[canon] (ya existe) ${p.id}`); continue; }
  await geminiImage(p.prompt, out, { aspectRatio: '1:1', refImagePaths: [ref] });
  made.push(out);
  console.log(`[canon] ${out}`);
  await sleep(6_000); // espacia las llamadas para no topar la cuota por minuto
}

const m = await loadManifest();
m.characters['sabi'] = { canonImages: made, updatedAt: new Date().toISOString() };
await saveManifest(m);
console.log(`\n[canon] ${made.length} poses guardadas en ${canonDir}`);
