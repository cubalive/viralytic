import { Clapperboard, Trash2, Download, RefreshCw, Youtube } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { Button, buttonVariants } from '@/components/ui/button';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { cn } from '@/lib/cn';
import { createReel, deleteReel, retryReel } from './actions';

export const dynamic = 'force-dynamic';

const ASSETS_BUCKET = 'assets';

const MODE_LABEL: Record<string, string> = { tech: 'Tech / IA', music: 'Música', kids: 'Infantil' };

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'text-zinc-400' },
  generating: { label: 'En cola', cls: 'text-cyan-brand animate-pulse-glow' },
  rendering: { label: 'Renderizando…', cls: 'text-cyan-brand animate-pulse-glow' },
  ready: { label: 'Listo', cls: 'text-neon' },
  publishing: { label: 'Publicando…', cls: 'text-magenta-400' },
  published: { label: 'Publicado', cls: 'text-magenta-400' },
  failed: { label: 'Falló', cls: 'text-red-400' },
};

export default async function ReelsPage() {
  const { orgId, db } = await requireAdmin();

  const { data: reelsRaw } = await db
    .from('mv_reels')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  // Channels (with connection state) for the publish target dropdown.
  const { data: channels } = await db
    .from('mv_channels')
    .select('id, language, youtube_handle, mv_projects!inner(name, organization_id), mv_youtube_connections(connection_status)')
    .eq('mv_projects.organization_id', orgId);

  const chanOpts = (channels ?? []).map((c: any) => {
    const proj = Array.isArray(c.mv_projects) ? c.mv_projects[0] : c.mv_projects;
    const conn = Array.isArray(c.mv_youtube_connections) ? c.mv_youtube_connections[0] : c.mv_youtube_connections;
    return {
      id: c.id,
      label: `${proj?.name ?? '—'} · ${c.youtube_handle ?? c.language}`,
      connected: conn?.connection_status === 'connected',
    };
  });

  const reels = await Promise.all(
    (reelsRaw ?? []).map(async (r: any) => {
      let download: string | null = null;
      if (r.video_path) {
        const { data } = await db.storage.from(ASSETS_BUCKET).createSignedUrl(r.video_path, 3600);
        download = data?.signedUrl ?? null;
      }
      return { ...r, download };
    })
  );

  return (
    <div className="mx-auto max-w-5xl">
      <Reveal>
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Shorts adictivos</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl">
            <Clapperboard className="text-magenta" size={32} />
            <span className="text-gradient">Reels</span>
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-400">
            Verticales con curva de retención (hook → recompensa → re-enganche → CTA). El motor renderiza solo;
            si asignas un canal conectado, se publican como <span className="text-zinc-200">#Shorts</span> automáticamente.
          </p>
        </header>
      </Reveal>

      <form action={createReel} className="vx-card mb-8 flex flex-wrap items-end gap-3 p-5">
        <div>
          <label className="vx-label">Tipo</label>
          <select name="mode" className="vx-input" defaultValue="tech">
            <option value="tech">Tech / IA</option>
            <option value="music">Música</option>
            <option value="kids">Infantil</option>
          </select>
        </div>
        <div className="flex-1 min-w-[240px]">
          <label className="vx-label">Tema (o mood para música)</label>
          <input name="topic" required placeholder="El hackeo que casi nadie nota" className="vx-input" />
        </div>
        <div className="min-w-[200px]">
          <label className="vx-label">Canal (opcional)</label>
          <select name="channelId" className="vx-input" defaultValue="">
            <option value="">— Sin publicar —</option>
            {chanOpts.map((c) => (
              <option key={c.id} value={c.id}>{c.label}{c.connected ? '' : ' (sin conectar)'}</option>
            ))}
          </select>
        </div>
        <Button type="submit">Generar reel</Button>
      </form>

      {reels.length === 0 ? (
        <div className="vx-card border-dashed p-10 text-center text-sm text-zinc-500">
          Aún no hay reels. Crea el primero arriba.
        </div>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2">
          {reels.map((r: any) => {
            const st = STATUS[r.status] ?? { label: String(r.status), cls: 'text-zinc-400' };
            return (
              <StaggerItem key={r.id}>
                <div className="vx-card flex h-full flex-col p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="vx-badge border-cyan-brand/20 bg-cyan-brand/10 text-cyan-brand">
                      {MODE_LABEL[r.mode] ?? r.mode}
                    </span>
                    <span className={cn('vx-badge', st.cls)}>{st.label}</span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 font-display text-lg">{r.metadata?.title ?? r.topic}</h3>
                  {r.error && <p className="mt-1 line-clamp-2 text-xs text-red-400/80">{r.error}</p>}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {r.download && (
                      <a href={r.download} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
                        <Download size={14} /> Ver
                      </a>
                    )}
                    {r.youtube_video_id && (
                      <a
                        href={`https://youtu.be/${r.youtube_video_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                      >
                        <Youtube size={14} /> YouTube
                      </a>
                    )}
                    {r.status === 'failed' && (
                      <form action={retryReel}>
                        <input type="hidden" name="reelId" value={r.id} />
                        <Button type="submit" variant="secondary" size="sm"><RefreshCw size={14} /> Reintentar</Button>
                      </form>
                    )}
                    <form action={deleteReel} className="ml-auto">
                      <input type="hidden" name="reelId" value={r.id} />
                      <Button type="submit" variant="ghost" size="sm"><Trash2 size={14} /></Button>
                    </form>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
