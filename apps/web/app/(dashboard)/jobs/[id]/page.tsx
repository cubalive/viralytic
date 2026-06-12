import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { getSupabaseServer, getActiveOrgId } from '@/lib/supabase';
import { ScriptSelector } from './ScriptSelector';

const statusIcons: Record<string, any> = {
  pending: Clock, analyzing: Loader2, scripting: Loader2,
  awaiting_script_selection: Clock, voicing: Loader2, visualizing: Loader2,
  awaiting_clips: Clock, assembling: Loader2,
  ready: CheckCircle2, scheduled: Clock, posted: CheckCircle2,
  failed: XCircle, cancelled: XCircle,
};

const statusColors: Record<string, string> = {
  pending: 'text-zinc-400', analyzing: 'text-blue-400', scripting: 'text-blue-400',
  awaiting_script_selection: 'text-amber-400', voicing: 'text-blue-400',
  visualizing: 'text-blue-400', awaiting_clips: 'text-amber-400',
  assembling: 'text-blue-400', ready: 'text-emerald-400', scheduled: 'text-amber-400',
  posted: 'text-emerald-400', failed: 'text-red-400', cancelled: 'text-zinc-500',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendiente', analyzing: 'Analizando producto', scripting: 'Escribiendo guiones',
  awaiting_script_selection: 'Esperando selección de guion', voicing: 'Sintetizando voz',
  visualizing: 'Generando visuales', awaiting_clips: 'Esperando tus clips',
  assembling: 'Ensamblando video', ready: 'Listo', scheduled: 'Programado',
  posted: 'Publicado', failed: 'Falló', cancelled: 'Cancelado',
};

export default async function JobDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const supabase = await getSupabaseServer();
  const { data: job } = await supabase
    .from('video_jobs')
    .select('id, status, current_step, progress, mode, error_message, total_cost_cents, created_at, updated_at, scheduled_for, products(title, images, source_url, price, currency)')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (!job) notFound();

  const j: any = job;
  const Icon = statusIcons[j.status] ?? Clock;
  const progress = Math.max(0, Math.min(100, j.progress ?? 0));
  const costUsd = ((j.total_cost_cents ?? 0) / 100).toFixed(2);
  const product = Array.isArray(j.products) ? j.products[0] : j.products;

  // Scripts to choose from — only while the job waits for a selection.
  let scripts: any[] = [];
  if (j.status === 'awaiting_script_selection') {
    const { data } = await supabase
      .from('scripts')
      .select('id, variant, framework, hook, body, cta, estimated_duration_seconds')
      .eq('job_id', id)
      .order('variant', { ascending: true });
    scripts = data ?? [];
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition mb-6">
        <ArrowLeft size={16} /> Volver a videos
      </Link>

      <header className="flex items-start gap-4 mb-8">
        <div className="w-20 h-24 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
          {product?.images?.[0] && (
            <img src={product.images[0]} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-black truncate">{product?.title ?? 'Sin título'}</h1>
          <div className="flex items-center gap-2 mt-2 text-sm">
            <span className="text-zinc-500 capitalize">{String(j.mode).replace('_', ' ')}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">{new Date(j.created_at).toLocaleString()}</span>
          </div>
        </div>
      </header>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <Icon size={20} className={`${statusColors[j.status] ?? 'text-zinc-400'} ${String(j.status).endsWith('ing') ? 'animate-spin' : ''}`} />
          <div>
            <p className={`font-bold ${statusColors[j.status] ?? 'text-zinc-200'}`}>{statusLabels[j.status] ?? j.status}</p>
            {j.current_step && <p className="text-xs text-zinc-500 mt-0.5">Paso actual: {j.current_step}</p>}
          </div>
        </div>

        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${j.status === 'failed' ? 'bg-red-500' : 'bg-brand-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-right text-xs text-zinc-500 mt-1.5">{progress}%</p>
      </section>

      {j.status === 'awaiting_script_selection' && scripts.length > 0 && (
        <ScriptSelector jobId={id} scripts={scripts} />
      )}

      {j.error_message && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-4 text-sm text-red-400">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Error</p>
            <p className="text-red-300/80">{j.error_message}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-600 mb-1">Costo acumulado</p>
          <p className="text-2xl font-black">${costUsd}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-600 mb-1">Modo</p>
          <p className="text-2xl font-black capitalize">{String(j.mode).replace('_', ' ')}</p>
        </div>
      </div>

      <p className="text-xs text-zinc-600 mt-6">
        Última actualización: {new Date(j.updated_at).toLocaleString()}
      </p>
    </div>
  );
}
