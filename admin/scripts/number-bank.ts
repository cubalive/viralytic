// Numera los videos del BANCO por antigüedad (mtime): el más viejo = 001.
// Formato: "NNN - <nombre>.mp4", por carpeta <Canal>/<IDIOMA>/Generados.
// ESTABLE: conserva los números ya asignados y solo numera los NUEVOS (mtime
// mayor → número mayor), así al copiar nuevos sabes cuáles son por su número.
// Además limpia duplicados: si llega un "<x>.mp4" sin número y ya existe
// "NNN - <x>.mp4", borra el sin numerar (re-copia de un sync). Reanudable.
// Uso: tsx scripts/number-bank.ts
import fs from 'node:fs';
import path from 'node:path';
import { BANK_DIR } from './bank';

const NUM_RE = /^(\d{3,}) - (.+\.mp4)$/i;
const PAD = 3;

function numberDir(dir: string): void {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.mp4'));
  if (!files.length) return;
  const numbered = files.filter((f) => NUM_RE.test(f));
  const fresh = files.filter((f) => !NUM_RE.test(f));
  if (!fresh.length) return;

  const numberedBases = new Set(numbered.map((f) => f.match(NUM_RE)![2]));
  let maxNum = numbered.reduce((m, f) => Math.max(m, parseInt(f.match(NUM_RE)![1], 10)), 0);

  // más viejos primero
  fresh.sort((a, b) => fs.statSync(path.join(dir, a)).mtimeMs - fs.statSync(path.join(dir, b)).mtimeMs);

  for (const f of fresh) {
    const src = path.join(dir, f);
    if (numberedBases.has(f)) {
      // ya existe numerado → es una re-copia, borra el sin numerar
      fs.unlinkSync(src);
      console.log(`  dup borrado: ${f}`);
      continue;
    }
    const n = String(++maxNum).padStart(PAD, '0');
    fs.renameSync(src, path.join(dir, `${n} - ${f}`));
    console.log(`  ${f}  ->  ${n} - ${f}`);
  }
}

function walk(root: string): void {
  if (!fs.existsSync(root)) {
    console.error(`No existe el banco: ${root}`);
    process.exit(1);
  }
  for (const canal of fs.readdirSync(root)) {
    const cdir = path.join(root, canal);
    if (!fs.statSync(cdir).isDirectory()) continue;
    for (const lang of fs.readdirSync(cdir)) {
      const gen = path.join(cdir, lang, 'Generados');
      if (fs.existsSync(gen) && fs.statSync(gen).isDirectory()) {
        const before = fs.readdirSync(gen).filter((f) => f.toLowerCase().endsWith('.mp4')).length;
        console.log(`${canal}/${lang}/Generados (${before} mp4):`);
        numberDir(gen);
      }
    }
  }
}

walk(BANK_DIR);
console.log('\n✅ Numeración completa.');
