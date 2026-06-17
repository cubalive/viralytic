// MOTOR DE AUTO-OPTIMIZACIÓN: lee las vistas reales (mv_channel_stats), decide
// qué pilares/temas funcionan y, con ChatGPT, genera la próxima estrategia por
// canal (temas frescos sesgados a lo que rinde + ajuste de hook). La guarda en
// mv_settings (key=strategy_<slot>) para que los motores la lean y repitan lo
// que funciona. Corre a diario antes de generar. Uso: tsx scripts/optimize.ts
import 'dotenv/config';
import { geminiJson } from '../src/ai/gemini';
import { log } from '../src/lib/log';

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) throw new Error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en admin/.env');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// canales con generación autónoma de temas (los faceless)
const SLOTS = ['wealth', 'signal', 'kat-es', 'kat-en'];

async function rest(method: string, q: string, body?: unknown): Promise<any> {
  const r = await fetch(`${SUPA}/rest/v1/${q}`, {
    method, headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && method === 'GET') throw new Error(`rest GET ${q}: ${r.status}`);
  if (!r.ok) log.warn(`rest ${method} ${q}: ${r.status} ${(await r.text()).slice(0, 120)}`);
  return method === 'GET' ? r.json() : null;
}

const orgs = await rest('GET', 'organizations?select=id&limit=1');
const orgId = orgs?.[0]?.id ?? null;

const SCHEMA = {
  type: 'object',
  properties: {
    winningPillars: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' } },
    hookNote: { type: 'string' },
  },
  required: ['winningPillars', 'topics', 'hookNote'],
};

for (const slot of SLOTS) {
  const rows = await rest('GET', `mv_channel_stats?channel_key=eq.${slot}&select=title,pillar,views&order=views.desc&limit=80`);
  if (!rows?.length) { log.warn(`${slot}: sin datos aún — salto`); continue; }
  const channelName = (await rest('GET', `mv_channel_stats?channel_key=eq.${slot}&select=channel_name&limit=1`))?.[0]?.channel_name ?? slot;

  // resumen por pilar (promedio de vistas) + top títulos
  const byPillar: Record<string, { n: number; views: number }> = {};
  for (const r of rows) { const p = r.pillar || '—'; (byPillar[p] ??= { n: 0, views: 0 }); byPillar[p].n++; byPillar[p].views += Number(r.views || 0); }
  const pillarLines = Object.entries(byPillar)
    .map(([p, v]) => `${p}: ${Math.round(v.views / v.n)} vistas/video (${v.n})`)
    .sort().join('\n');
  const topLines = rows.slice(0, 25).map((r: any) => `${r.views}  [${r.pillar || '—'}]  ${r.title}`).join('\n');

  const sys = `Eres un estratega de crecimiento de YouTube Shorts para el canal "${channelName}". Te doy sus videos con vistas reales y su pilar. Decide qué FUNCIONA y qué no, y produce la próxima estrategia. Devuelve SOLO JSON:
- winningPillars: pilares ordenados de mejor a peor por rendimiento real.
- topics: 12 títulos/temas FRESCOS y específicos, sesgados hacia lo que más vistas tiene (repite ángulos ganadores con variaciones; evita lo que no rinde). Mismo idioma y nicho del canal.
- hookNote: 1-2 frases concretas para afinar el GANCHO del guion según lo que está atrayendo vistas.`;
  const prompt = `Rendimiento por pilar:\n${pillarLines}\n\nTop videos (vistas | pilar | título):\n${topLines}`;

  try {
    const strat: any = await geminiJson(prompt, SCHEMA, sys);
    const value = { ...strat, generatedAt: new Date().toISOString() };
    await rest('POST', 'mv_settings?on_conflict=organization_id,key', [{ organization_id: orgId, key: `strategy_${slot}`, value }]);
    log.ok(`${channelName} (${slot}): pilares→[${(strat.winningPillars || []).slice(0, 3).join(', ')}] · ${strat.topics?.length || 0} temas · hook: ${String(strat.hookNote).slice(0, 60)}…`);
  } catch (e) { log.err(`${slot}: ${(e as Error).message.slice(0, 120)}`); }
}
console.log('\n✅ optimize: estrategias actualizadas en mv_settings.');
