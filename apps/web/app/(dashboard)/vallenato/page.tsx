import { Music, Youtube, Plug, Trash2, UploadCloud, CheckCircle2, Loader2 } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { buttonVariants } from '@/components/ui/button';
import { Reveal } from '@/components/motion';
import { cn } from '@/lib/cn';
import { VallenatoIntake } from './VallenatoIntake';
import { createSong, deleteSong, publishSong, getChannelInfo } from './actions';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'borrador', cls: 'text-zinc-500' },
  generating: { label: 'generando', cls: 'text-amber-300' },
  rendering: { label: 'renderizando', cls: 'text-amber-300' },
  ready: { label: 'listo', cls: 'text-neon border-neon/20 bg-neon/10' },
  publishing: { label: 'publicando', cls: 'text-cyan-brand' },
  published: { label: 'publicado', cls: 'text-cyan-brand border-cyan-brand/20 bg-cyan-brand/10' },
  failed: { label: 'error', cls: 'text-red-400' },
};

export default async function VallenatoPage() {
  const { db, orgId } = await requireAdmin();
  const ch = await getChannelInfo();
  const { data: songs } = await db
    .from('mv_songs')
    .select('id, title, status, lyrics, track_path, stem_path, final_path, youtube_video_id')
    .eq('organization_id', orgId)
    .eq('artist', 'vallenato')
    .order('created_at', { ascending: false });
  const list = songs ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <Reveal>
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Visualizer musical</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl">
            <Music className="text-magenta" size={32} /> <span className="text-gradient">Vallenatos</span>
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-400">
            Sube canción (Suno) + voz sola + letra → visualizer 16:9 con fotos animadas, soundwave y
            <span className="text-zinc-200"> karaoke perfecto</span> (alineado al stem).
          </p>
        </header>
      </Reveal>

      {/* Conexión del canal */}
      <Reveal>
        <div className={cn('vx-card mb-6 flex items-center justify-between p-4', ch.connected && 'border-neon/25')}>
          <div className="flex items-center gap-3">
            <Youtube className={ch.connected ? 'text-neon' : 'text-zinc-500'} size={20} />
            <div>
              <p className="text-sm">{ch.youtubeTitle ?? 'Canal de Vallenatos'}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {ch.connected ? 'conectado · token permanente' : 'sin conectar'}
              </p>
            </div>
          </div>
          <a href={`/api/youtube/oauth/start?channelId=${ch.channelId}`} className={cn(buttonVariants({ variant: ch.connected ? 'secondary' : 'primary', size: 'sm' }))}>
            <Plug size={15} /> {ch.connected ? 'Reconectar' : 'Conectar'}
          </a>
        </div>
      </Reveal>

      {/* Crear nuevo */}
      <Reveal>
        <form action={createSong} className="vx-card mb-8 flex items-end gap-3 p-4">
          <div className="flex-1">
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Nuevo tema</label>
            <input name="title" required placeholder="Título de la canción" className="mt-1 w-full rounded-lg border border-white/10 bg-graphite-100/60 px-3 py-2 text-sm outline-none focus:border-magenta/50" />
          </div>
          <button type="submit" className={cn(buttonVariants({ size: 'sm' }))}><UploadCloud size={15} /> Crear</button>
        </form>
      </Reveal>

      {/* Lista */}
      {list.length === 0 ? (
        <div className="vx-card border-dashed p-10 text-center text-sm text-zinc-500">Aún no hay temas. Crea uno arriba.</div>
      ) : (
        <div className="space-y-4">
          {list.map((s: any) => {
            const st = STATUS[s.status] ?? { label: s.status, cls: 'text-zinc-500' };
            return (
              <Reveal key={s.id}>
                <div className="vx-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="truncate font-display text-lg">{s.title}</h3>
                    <span className={cn('vx-badge', st.cls)}>
                      {(s.status === 'generating' || s.status === 'rendering' || s.status === 'publishing') && <Loader2 size={12} className="animate-spin" />}
                      {s.status === 'published' && <CheckCircle2 size={12} />}
                      {st.label}
                    </span>
                  </div>

                  {s.status === 'draft' && (
                    <VallenatoIntake songId={s.id} hasLyrics={!!s.lyrics} hasTrack={!!s.track_path} hasStem={!!s.stem_path} />
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    {s.status === 'ready' && ch.connected && (
                      <form action={publishSong}>
                        <input type="hidden" name="songId" value={s.id} />
                        <button type="submit" className={cn(buttonVariants({ size: 'sm' }))}><Youtube size={15} /> Publicar</button>
                      </form>
                    )}
                    {s.youtube_video_id && (
                      <a href={`https://youtube.com/watch?v=${s.youtube_video_id}`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Ver en YouTube</a>
                    )}
                    {(s.status === 'draft' || s.status === 'failed') && (
                      <form action={deleteSong}>
                        <input type="hidden" name="songId" value={s.id} />
                        <button type="submit" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-zinc-500 hover:text-red-400')}><Trash2 size={15} /> Borrar</button>
                      </form>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-zinc-600">
        Al subir letra + canción + voz, el tema pasa a “generando”. El render (fotos + soundwave + karaoke) corre en el
        motor con python/ffmpeg; al terminar queda “listo” para publicar.
      </p>
    </div>
  );
}
