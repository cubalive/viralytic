import Image from 'next/image';
import Link from 'next/link';
import { TrendingUp, Flame, ShoppingBag } from 'lucide-react';
import { getSupabaseServer, getActiveOrgId } from '@/lib/supabase';

export const revalidate = 600; // 10 minutes

export default async function TrendingPage({
  searchParams,
}: { searchParams: Promise<{ region?: string; lang?: string }> }) {
  const { region = 'US', lang = 'es' } = await searchParams;
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();

  const { data: trending } = await supabase
    .from('trending_products')
    .select('*')
    .eq('region', region)
    .eq('language', lang)
    .order('virality_score', { ascending: false })
    .limit(30);

  return (
    <div className="max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black flex items-center gap-3">
            <Flame className="text-brand-500" size={36} />
            Trending esta semana
          </h1>
          <p className="text-zinc-400 mt-2">Productos virales descubiertos automáticamente. Genera un video con un click.</p>
        </div>
        <div className="flex gap-2">
          {['US', 'MX', 'ES'].map(r => (
            <Link key={r} href={`/trending?region=${r}&lang=${lang}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${region === r ? 'bg-brand-500 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'}`}>
              {r}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* TODO: replace `any` with generated Database types after Fase 2 (pnpm db:types) */}
        {(trending ?? []).map((p: any, i: number) => (
          <article key={p.id ?? i} className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition group">
            <div className="aspect-video bg-zinc-800 relative overflow-hidden">
              {p.thumbnail_url ? (
                <Image src={p.thumbnail_url} alt={p.title} fill className="object-cover group-hover:scale-105 transition" sizes="(min-width:1024px) 33vw, 50vw" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600"><ShoppingBag size={48} /></div>
              )}
              <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded-md flex items-center gap-1 text-xs font-bold">
                <TrendingUp size={12} className="text-brand-500" />
                {Math.round(p.virality_score)}
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-bold text-zinc-100 line-clamp-2 mb-2">{p.title}</h3>
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-3">
                <span className="uppercase">{p.source.replace(/_/g, ' ')}</span>
                {p.estimated_price && <span>${p.estimated_price}</span>}
              </div>
              <form action="/api/jobs/from-trending" method="POST">
                <input type="hidden" name="trendingId" value={p.id} />
                <button type="submit" className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition">
                  Generar video
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>

      {(!trending || trending.length === 0) && (
        <div className="text-center py-20 text-zinc-500">
          <p>No hay productos trending todavía. El worker de descubrimiento se ejecuta cada 12 horas.</p>
        </div>
      )}
    </div>
  );
}
