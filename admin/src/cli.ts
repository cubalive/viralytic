import path from 'node:path';
import { verify } from './verify';
import { runSong } from './pipeline';
import { buildCanon } from './stages/canon';
import { CHARACTERS_DIR, OUTPUT_DIR } from './config';
import { readJson, writeJson } from './lib/files';
import { selectEduFormats, selectMusicFormats } from './formats/selector';
import { log } from './lib/log';
import type { Character } from './types';

const [cmd, arg] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case 'verify':
      await verify();
      break;

    case 'canon': {
      if (!arg) throw new Error('Uso: npm run canon -- <character-id>  (p.ej. principal)');
      const dir = path.join(CHARACTERS_DIR, arg);
      const char = await readJson<Character | null>(path.join(dir, 'character.json'), null);
      if (!char) throw new Error(`Falta ${path.join(dir, 'character.json')}`);
      char.refDir = path.join(dir, 'refs');
      char.canonDir = path.join(dir, 'canon');
      await buildCanon(char);
      break;
    }

    case 'run': {
      if (!arg) throw new Error('Uso: npm run run -- <song-id>  (p.ej. demo)');
      await runSong(arg);
      break;
    }

    case 'brief': {
      const subject = process.argv[4];
      if (!arg || !subject) {
        throw new Error('Uso: npm run brief -- edu "<tema>"   |   npm run brief -- music "<cancion>" [mood] [bpm]');
      }
      const res = arg === 'music'
        ? await selectMusicFormats(subject, {
            mood: process.argv[5],
            bpm: process.argv[6] ? Number(process.argv[6]) : undefined,
          })
        : await selectEduFormats(subject);
      const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      const out = path.join(OUTPUT_DIR, 'briefs', `${arg}_${slug}.json`);
      await writeJson(out, res);
      log.ok(`${res.seleccion.length} formatos "usar" · ${res.descartados.length} descartados`);
      log.info(`Guardado: ${out}`);
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    default:
      log.info('Comandos disponibles:');
      log.info('  npm run verify                  → revisa entorno (ADC, ffmpeg, Gemini)');
      log.info('  npm run canon -- <id>           → construye el canon de un personaje');
      log.info('  npm run run -- <song-id>        → genera el video musical completo');
      log.info('  npm run brief -- edu "<tema>"   → selecciona formatos + briefs (informática)');
      log.info('  npm run brief -- music "<cancion>" [mood] [bpm] → briefs musicales');
  }
}

main().catch((e) => {
  log.err(e?.message ?? e);
  process.exit(1);
});
