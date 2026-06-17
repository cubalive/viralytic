import { Youtube, CheckCircle2, AlertCircle, Plug, ShieldCheck, KeyRound } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { buttonVariants } from '@/components/ui/button';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { cn } from '@/lib/cn';
import { VerifyButton } from './VerifyButton';

export const dynamic = 'force-dynamic';

const LANG_LABEL: Record<string, string> = { es: 'ES', en: 'EN', zh: '中文' };

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { db, orgId } = await requireAdmin();
  const sp = await searchParams;

  const { data: channels } = await db
    .from('mv_channels')
    .select(
      'id, language, youtube_handle, youtube_channel_id, mv_projects!inner(name, organization_id), mv_youtube_connections(connection_status, youtube_title, connected_at)',
    )
    .eq('mv_projects.organization_id', orgId)
    .order('language', { ascending: true });

  const list = channels ?? [];
  const connOf = (c: any) =>
    Array.isArray(c.mv_youtube_connections) ? c.mv_youtube_connections[0] : c.mv_youtube_connections;
  const projName = (c: any): string => {
    const p = Array.isArray(c.mv_projects) ? c.mv_projects[0] : c.mv_projects;
    return p?.name ?? 'Sin proyecto';
  };
  const connectedCount = list.filter((c: any) => connOf(c)?.connection_status === 'connected').length;

  // group by project for a clean, professional layout
  const groups = new Map<string, any[]>();
  for (const c of list) {
    const name = projName(c);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(c);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Reveal>
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Publicación autónoma</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl">
            <Youtube className="text-magenta" size={34} />
            Conexiones de <span className="text-gradient">YouTube</span>
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-400">
            Conecta cada canal para publicar de forma autónoma. Tokens cifrados en la base de datos.{' '}
            <span className="text-zinc-200">{connectedCount}/{list.length}</span> conectados.
          </p>
        </header>
      </Reveal>

      {sp.connected && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-neon/20 bg-neon/5 px-4 py-3 text-sm text-neon">
          <CheckCircle2 size={16} /> Canal conectado correctamente.
        </div>
      )}
      {sp.error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-magenta/20 bg-magenta/5 px-4 py-3 text-sm text-magenta">
          <AlertCircle size={16} /> Error en la conexión: {sp.error}
        </div>
      )}

      <div className="mb-8 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/90">
        <KeyRound size={14} className="mt-0.5 shrink-0" />
        <span>
          Para que el token sea <strong>permanente</strong>, la pantalla de consentimiento OAuth de Google debe
          estar en <strong>Producción</strong> (en modo Testing caduca a los 7 días).
        </span>
      </div>

      {list.length > 0 && <VerifyButton />}

      {list.length === 0 ? (
        <div className="vx-card border-dashed p-10 text-center text-sm text-zinc-500">
          Aún no hay canales.
        </div>
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([project, chans]) => (
            <Reveal key={project}>
              <section>
                <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-zinc-500">{project}</h2>
                <Stagger className="grid gap-4 md:grid-cols-3">
                  {chans.map((c: any) => {
                    const conn = connOf(c);
                    const connected = conn?.connection_status === 'connected';
                    return (
                      <StaggerItem key={c.id}>
                        <div
                          className={cn(
                            'vx-card flex h-full flex-col p-5',
                            connected && 'border-neon/25'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="vx-badge border-cyan-brand/20 bg-cyan-brand/10 text-cyan-brand">
                              {LANG_LABEL[c.language] ?? c.language}
                            </span>
                            <span
                              className={cn(
                                'vx-badge',
                                connected ? 'border-neon/20 bg-neon/10 text-neon' : 'text-zinc-500'
                              )}
                            >
                              {connected ? 'conectado' : 'sin conectar'}
                            </span>
                          </div>

                          <h3 className="mt-3 truncate font-display text-lg">
                            {conn?.youtube_title ?? c.youtube_handle ?? projName(c)}
                          </h3>
                          {c.youtube_handle && (
                            <p className="truncate text-xs text-zinc-500">{c.youtube_handle}</p>
                          )}

                          <div className="mt-2 min-h-[20px] text-xs">
                            {connected ? (
                              <span className="inline-flex items-center gap-1 text-neon">
                                <ShieldCheck size={13} /> Token permanente
                              </span>
                            ) : (
                              <span className="text-zinc-600">Sin token</span>
                            )}
                          </div>
                          {conn?.connected_at && (
                            <p className="text-[11px] text-zinc-600">
                              desde {new Date(conn.connected_at).toLocaleDateString()}
                            </p>
                          )}

                          <a
                            href={`/api/youtube/oauth/start?channelId=${c.id}`}
                            className={cn(
                              buttonVariants({ variant: connected ? 'secondary' : 'primary', size: 'sm', block: true }),
                              'mt-4'
                            )}
                          >
                            <Plug size={15} /> {connected ? 'Reconectar' : 'Conectar'}
                          </a>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              </section>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
