// ADMIN de un botón: genera + publica los videos del día de UN canal (o de todos).
// Uso:
//   tsx scripts/admin.ts <canal> [cantidad=5]
//   tsx scripts/admin.ts all [cantidad=5]
// Canales: wealth | kat-es | kat-en | sabikids | all
import { spawn } from 'node:child_process';
import { log } from '../src/lib/log';

interface ChannelDef { name: string; type: 'faceless' | 'sabikids'; gen?: string; lang?: string; pub?: string }
const CHANNELS: Record<string, ChannelDef> = {
  'wealth': { name: 'World Wealth Mindset', type: 'faceless', gen: 'gen-wealth-batch.ts', lang: 'en', pub: 'wealth' },
  'kat-es': { name: 'Katharsis Oficial (ES)', type: 'faceless', gen: 'gen-awakening-batch.ts', lang: 'es', pub: 'kat-es' },
  'kat-en': { name: 'Katharsis Code (EN)', type: 'faceless', gen: 'gen-awakening-batch.ts', lang: 'en', pub: 'kat-en' },
  'sabikids': { name: 'SabiKids (ES/EN/IT/ZH)', type: 'sabikids' },
};
const ORDER = ['wealth', 'kat-es', 'kat-en', 'sabikids'];

const arg = process.argv[2];
const COUNT = String(Number(process.argv[3] || 5));
if (!arg || (!CHANNELS[arg] && arg !== 'all')) {
  console.log('Uso: tsx scripts/admin.ts <wealth|kat-es|kat-en|sabikids|all> [cantidad=5]');
  process.exit(1);
}

function run(script: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['tsx', `scripts/${script}`, ...args], { stdio: 'inherit', shell: true });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${script} salió con código ${c}`))));
  });
}

async function doChannel(id: string) {
  const def = CHANNELS[id];
  if (def.type === 'faceless') {
    log.step(`━━━ ${def.name} — generando ${COUNT} videos frescos ━━━`);
    await run(def.gen!, [COUNT, def.lang!]);
    log.step(`━━━ ${def.name} — publicando (drip ${COUNT}/día) ━━━`);
    await run('yt-kat-publish.ts', [def.pub!, COUNT]);
  } else {
    // SabiKids: publica desde el backlog ya renderizado, round-robin en los 4 idiomas, programado.
    log.step(`━━━ ${def.name} — publicando ${COUNT}/canal desde el backlog ━━━`);
    await run('yt-publish-all.ts', [COUNT, 'schedule']);
  }
  log.ok(`${def.name}: listo ✅`);
}

const targets = arg === 'all' ? ORDER : [arg];
for (const id of targets) {
  try { await doChannel(id); }
  catch (e) { log.err(`${id}: ${(e as Error).message}`); }
}
// Organiza el BANCO GENERAL (por canal → idioma → Publicados/Generados) tras generar/publicar.
log.step('━━━ Organizando banco de videos ━━━');
try { await run('organize-bank.ts', []); } catch (e) { log.err(`organize-bank: ${(e as Error).message}`); }
console.log(`\n✅ ADMIN terminado para: ${targets.join(', ')}`);
