import { BarChart3, Youtube, Clapperboard, Coins, CheckCircle2, Video } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const LANG_LABEL: Record<string, string> = { es: 'ES', en: 'EN', zh: '中文', it: 'IT' };
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function StatsPage() {
  const { db, orgId } = await requireAdmin();

  // Canales + conexión + proyecto
  const { data: channels } = await db
    .from('mv_channels')
    .select('id, language, youtube_handle, mv_projects!inner(name, organization_id), mv_youtube_connections(connection_status, youtube_title)')
    .eq('mv_projects.organization_id', orgId)
    .order('language', { ascending: true });
  const list: any[] = channels ?? [];
  const ids = list.map((c) => c.id);
  const connOf = (c: any) => (Array.isArray(c.mv_youtube_connections) ? c.mv_youtube_connections[0] : c.mv_youtube_connections);
  const projName = (c: any) => {
    const p = Array.isArray(c.mv_projects) ? c.mv_projects[0] : c.mv_projects;
    return p?.name ?? '—';
  };

  // Videos por canal (music/faceless)
  const { data: langs } = ids.length
    ? await db.from('mv_video_languages').select('channel_id, final_video_path, youtube_video_id').in('channel_id', ids)
    : { data: [] as any[] };
  const perChannel = new Map<string, { rendered: number; published: number }>();
  for (const vl of (langs ?? []) as any[]) {
    const e = perChannel.get(vl.channel_id) ?? { rendered: 0, published: 0 };
    if (vl.final_video_path) e.rendered++;
    if (vl.youtube_video_id) e.published++;
    perChannel.set(vl.channel_id, e);
  }

  // Caroline (mv_songs) por canal
  const { data: songs } = ids.length
    ? await db.from('mv_songs').select('channel_id, final_path, youtube_video_id').in('channel_id', ids)
    : { data: [] as any[] };
  for (const s of (songs ?? []) as any[]) {
    if (!s.channel_id) continue;
    const e = perChannel.get(s.channel_id) ?? { rendered: 0, published: 0 };
    if (s.final_path) e.rendered++;
    if (s.youtube_video_id) e.published++;
    perChannel.set(s.channel_id, e);
  }

  // Créditos de IA (usage_events) + presupuesto opcional (mv_settings)
  const { data: usage } = await db.from('usage_events').select('cost_cents, type').eq('organization_id', orgId);
  const spentCents = (usage ?? []).reduce((a: number, u: any) => a + (u.cost_cents ?? 0), 0);
  const { data: budgetRow } = await db
    .from('mv_settings').select('value').eq('organization_id', orgId).eq('key', 'ai_budget_cents').maybeSingle();
  const budgetCents = Number((budgetRow as any)?.value ?? 0) || 0;
  const remainingCents = budgetCents ? Math.max(0, budgetCents - spentCents) : 0;

  const connected = list.filter((c) => connOf(c)?.connection_status === 'connected').length;
  const totalRendered = [...perChannel.values()].reduce((a, e) => a + e.rendered, 0);
  const totalPublished = [...perChannel.values()].reduce((a, e) => a + e.published, 0);

  const kpis = [
    { icon: <Youtube size={18} />, label: 'Canales conectados', value: `${connected}/${list.length}` },
    { icon: <Video size={18} />, label: 'Videos renderizados', value: String(totalRendered) },
    { icon: <Clapperboard size={18} />, label: 'Publicados en YouTube', value: String(totalPublished) },
    { icon: <Coins size={18} />, label: budgetCents ? 'Créditos IA restantes' : 'Gasto IA total', value: budgetCents ? usd(remainingCents) : usd(spentCents) },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Reveal>
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Inteligencia</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl">
            <BarChart3 className="text-magenta" size={34} />
            <span className="text-gradient">Estadísticas</span>
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-400">Visión general y por canal: rendimiento, publicación y consumo de créditos de IA.</p>
        </header>
      </Reveal>

      {/* KPIs */}
      <Stagger className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <StaggerItem key={k.label}>
            <div className="vx-card p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-white/5 bg-white/5 text-cyan-brand">{k.icon}</div>
              <div className="font-display text-3xl">{k.value}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">{k.label}</div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Gasto IA detalle */}
      <Reveal>
        <div className="vx-card mb-8 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">Créditos de IA</h2>
            <span className="text-xs text-zinc-500">{(usage ?? []).length} eventos</span>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <div className="font-display text-2xl">{usd(spentCents)}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Gastado</div>
            </div>
            {budgetCents > 0 && (
              <>
                <div>
                  <div className="font-display text-2xl text-neon">{usd(remainingCents)}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Restante</div>
                </div>
                <div>
                  <div className="font-display text-2xl text-zinc-400">{usd(budgetCents)}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Presupuesto</div>
                </div>
              </>
            )}
          </div>
          {budgetCents === 0 && (
            <p className="mt-3 text-xs text-zinc-600">
              Define un presupuesto guardando <code className="text-zinc-400">ai_budget_cents</code> en mv_settings para ver el saldo restante.
            </p>
          )}
        </div>
      </Reveal>

      {/* Por canal */}
      <Reveal>
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-zinc-500">Por canal</h2>
        {list.length === 0 ? (
          <div className="vx-card border-dashed p-10 text-center text-sm text-zinc-500">Aún no hay canales.</div>
        ) : (
          <div className="vx-card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  <th className="px-5 py-3">Canal</th>
                  <th className="px-3 py-3">Idioma</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3 text-right">Renderizados</th>
                  <th className="px-5 py-3 text-right">Publicados</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const conn = connOf(c);
                  const isConn = conn?.connection_status === 'connected';
                  const e = perChannel.get(c.id) ?? { rendered: 0, published: 0 };
                  return (
                    <tr key={c.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-5 py-3">{conn?.youtube_title ?? c.youtube_handle ?? projName(c)}</td>
                      <td className="px-3 py-3 text-zinc-400">{LANG_LABEL[c.language] ?? c.language}</td>
                      <td className="px-3 py-3">
                        <span className={cn('vx-badge', isConn ? 'border-neon/20 bg-neon/10 text-neon' : 'text-zinc-500')}>
                          {isConn ? <><CheckCircle2 size={12} /> conectado</> : 'sin conectar'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{e.rendered}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{e.published}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Reveal>

      <p className="mt-6 text-xs text-zinc-600">
        Nota: los canales faceless del admin (World Wealth Mindset, Katharsis, SabiKids, Signal) publican por el sistema
        local y aparecerán aquí al unificarlos en Supabase. Las métricas de vistas (para el ajuste automático de prompts)
        requieren la recolección de YouTube Analytics.
      </p>
    </div>
  );
}
