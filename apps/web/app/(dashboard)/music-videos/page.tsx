import { Music, Plus, Globe, Film } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { createProject } from './actions';

export const dynamic = 'force-dynamic';

const LANG_LABEL: Record<string, string> = { es: 'ES', en: 'EN', zh: '中文' };

export default async function MusicVideosPage() {
  const { db, orgId } = await requireAdmin();

  const { data: projects } = await db
    .from('mv_projects')
    .select('id, name, protagonist, status, mv_channels(language), mv_videos(id, title, status)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  const list = projects ?? [];

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-black flex items-center gap-3">
          <Music className="text-magenta" size={34} />
          Creador de Videos Musicales
        </h1>
        <p className="text-zinc-400 mt-2">
          Motores de videos musicales infantiles para YouTube — cada programa tiene un protagonista
          y canales en español, inglés y chino.
        </p>
      </header>

      {/* New engine */}
      <form
        action={createProject}
        className="mb-10 flex flex-wrap items-end gap-3 rounded-xl border border-white/5 bg-graphite-50 p-5"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-widest text-zinc-500">Programa</label>
          <input
            name="name"
            required
            placeholder="Nombre del programa"
            className="w-56 rounded-lg border border-white/10 bg-graphite px-3 py-2 text-sm outline-none focus:border-magenta"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-widest text-zinc-500">Protagonista</label>
          <input
            name="protagonist"
            placeholder="Personaje principal"
            className="w-56 rounded-lg border border-white/10 bg-graphite px-3 py-2 text-sm outline-none focus:border-magenta"
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg bg-magenta px-4 py-2 text-sm font-semibold text-white transition hover:bg-magenta-600"
        >
          <Plus size={16} /> Crear motor
        </button>
      </form>

      {/* Engines */}
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">
          Aún no hay programas. Crea el primero arriba — luego le cargamos el ADN del protagonista,
          el canon oficial y la primera pista.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p: any) => {
            const channels = p.mv_channels ?? [];
            const videos = p.mv_videos ?? [];
            return (
              <div key={p.id} className="rounded-xl border border-white/5 bg-graphite-50 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{p.name}</h3>
                    {p.protagonist && <p className="text-sm text-zinc-400">{p.protagonist}</p>}
                  </div>
                  <span className="rounded bg-white/5 px-2 py-1 text-[10px] uppercase tracking-widest text-zinc-400">
                    {p.status}
                  </span>
                </div>

                <div className="mt-3 flex gap-1.5">
                  {channels.map((c: any) => (
                    <span
                      key={c.language}
                      className="flex items-center gap-1 rounded bg-cyan-brand/10 px-2 py-0.5 text-[11px] text-cyan-brand"
                    >
                      <Globe size={11} /> {LANG_LABEL[c.language] ?? c.language}
                    </span>
                  ))}
                </div>

                <div className="mt-4 border-t border-white/5 pt-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-zinc-500">
                    <Film size={12} /> Videos ({videos.length})
                  </div>
                  {videos.length === 0 ? (
                    <p className="text-xs text-zinc-600">Sin videos todavía.</p>
                  ) : (
                    <ul className="space-y-1">
                      {videos.map((v: any) => (
                        <li key={v.id} className="flex justify-between text-sm">
                          <span className="text-zinc-300">{v.title}</span>
                          <span className="text-xs text-zinc-500">{v.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
