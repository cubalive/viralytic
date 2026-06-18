// usage.ts — REGISTRO DE GASTOS de APIs (Centro de Gastos), lado TypeScript.
// recordUsage(...) añade una línea a data/usage.jsonl calculando el USD según data/pricing.json.
// Lo usan los generadores TS (Veo en faceless/sabikids, gpt-image-1). Nunca lanza: si falla, no rompe nada.
import fs from 'node:fs';
import path from 'node:path';

const ADMIN = process.cwd(); // los scripts del admin corren con cwd = raíz del admin
const USAGEF = path.join(ADMIN, 'data', 'usage.jsonl');
const PRICEF = path.join(ADMIN, 'data', 'pricing.json');

function pricing(): any {
  try { return JSON.parse(fs.readFileSync(PRICEF, 'utf8')); } catch { return {}; }
}
function rate(provider: string, model: string): any {
  const pr = pricing()[provider] || {};
  return pr[model] || pr.default || {};
}

export function recordUsage(
  project: string, kind: string, provider: string, model: string,
  units: number, usd?: number, note?: string,
): number {
  const r = rate(provider, model);
  const u = usd == null ? Number(((units || 0) * (r.usd || 0)).toFixed(6)) : usd;
  const line = {
    ts: new Date().toISOString(), project: project || '?', kind, provider, model,
    units: Number((units || 0).toFixed(3)), unit: r.per || 'unit',
    usd: Number((u || 0).toFixed(6)), note: String(note || '').slice(0, 120),
  };
  try { fs.mkdirSync(path.dirname(USAGEF), { recursive: true }); fs.appendFileSync(USAGEF, JSON.stringify(line) + '\n'); } catch { /* noop */ }
  return line.usd;
}

export function recordTokens(project: string, kind: string, model: string, tin: number, tout: number, note?: string): number {
  const r = rate('openai', model);
  const usd = Number(((tin / 1000) * (r.usd_in || 0) + (tout / 1000) * (r.usd || 0)).toFixed(6));
  return recordUsage(project, kind, 'openai', model, (tin || 0) + (tout || 0), usd, note);
}
