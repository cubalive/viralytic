import Link from 'next/link';
import { CheckCircle2, Loader2, XCircle, Clock } from 'lucide-react';
import { getSupabaseServer, getActiveOrgId } from '@/lib/supabase';

const statusIcons: Record<string, any> = {
  pending: Clock, analyzing: Loader2, scripting: Loader2,
  awaiting_script_selection: Clock, voicing: Loader2, visualizing: Loader2,
  awaiting_clips: Clock, assembling: Loader2,
  ready: CheckCircle2, posted: CheckCircle2, failed: XCircle,
};

const statusColors: Record<string, string> = {
  pending: 'text-zinc-400', analyzing: 'text-blue-400', scripting: 'text-blue-400',
  awaiting_script_selection: 'text-amber-400', voicing: 'text-blue-400',
  visualizing: 'text-blue-400', awaiting_clips: 'text-amber-400',
  assembling: 'text-blue-400', ready: 'text-emerald-400', posted: 'text-emerald-400',
  failed: 'text-red-400',
};

export default async function JobsPage() {
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  const { data: jobs } = await supabase
    .from('video_jobs')
    .select('id, status, current_step, mode, created_at, products(title, images)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-4xl font-black mb-8">Mis videos</h1>
      <div className="space-y-3">
        {(jobs ?? []).map((j: any) => {
          const Icon = statusIcons[j.status] ?? Clock;
          return (
            <Link key={j.id} href={`/jobs/${j.id}`}
              className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition">
              <div className="w-16 h-20 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                {j.products?.images?.[0] && (
                  <img src={j.products.images[0]} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold truncate">{j.products?.title ?? 'Sin título'}</h3>
                <div className="flex items-center gap-2 mt-1 text-sm">
                  <Icon size={14} className={`${statusColors[j.status]} ${j.status.endsWith('ing') ? 'animate-spin' : ''}`} />
                  <span className={statusColors[j.status]}>{j.current_step ?? j.status}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500 capitalize">{j.mode.replace('_', ' ')}</span>
                </div>
              </div>
              <span className="text-xs text-zinc-500">{new Date(j.created_at).toLocaleDateString()}</span>
            </Link>
          );
        })}
        {(!jobs || jobs.length === 0) && (
          <div className="text-center py-20 text-zinc-500">
            <p>Aún no tienes videos. <Link href="/create" className="text-brand-500 hover:underline">Crea el primero</Link>.</p>
          </div>
        )}
      </div>
    </div>
  );
}
