// Estrategia de auto-optimización por canal: la escribe optimize.ts (analizando
// las vistas reales de mv_channel_stats) y la leen los motores para sesgar la
// generación hacia lo que funciona. Si no hay estrategia, devuelve null (los
// motores caen a sus defaults).
export interface Strategy {
  winningPillars?: string[];
  topics?: string[];   // temas frescos sugeridos (sesgados a lo que rinde)
  hookNote?: string;   // 1-2 frases para afinar el gancho del guion
  generatedAt?: string;
}

/** Lee strategy_<channelKey> de mv_settings (Supabase REST, service role). */
export async function loadStrategy(channelKey: string): Promise<Strategy | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(
      `${url}/rest/v1/mv_settings?key=eq.strategy_${encodeURIComponent(channelKey)}&select=value&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as { value?: Strategy }[];
    return rows?.[0]?.value ?? null;
  } catch {
    return null;
  }
}
