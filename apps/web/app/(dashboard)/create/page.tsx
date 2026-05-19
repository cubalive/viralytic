'use client';
import { useState, useTransition } from 'react';
import { Link2, Wand2, Video, Layers, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Mode = 'ai_full' | 'user_filmed' | 'hybrid';

const MODES: Array<{ id: Mode; title: string; description: string; icon: any }> = [
  { id: 'ai_full',     title: 'AI Completo',  description: 'El sistema genera voz, imágenes y video. Listo en ~10 min.', icon: Wand2 },
  { id: 'user_filmed', title: 'Yo grabo',     description: 'Te doy un guión cinematográfico, tú filmas, yo edito.', icon: Video },
  { id: 'hybrid',      title: 'Híbrido',      description: 'Tus clips + B-roll AI cuando falte. Lo mejor de ambos.', icon: Layers },
];

export default function CreatePage() {
  const router = useRouter();
  const [productUrl, setProductUrl] = useState('');
  const [mode, setMode] = useState<Mode>('ai_full');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productUrl, mode }),
      });
      if (!res.ok) { setError(await res.text()); return; }
      const { jobId } = await res.json();
      router.push(`/jobs/${jobId}`);
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-4xl font-black mb-2">Crear nuevo video</h1>
      <p className="text-zinc-400 mb-10">Pega el link del producto y elige el modo.</p>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <label className="block text-sm font-semibold mb-2 text-zinc-300">URL del producto</label>
          <div className="relative">
            <Link2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="url" required value={productUrl} onChange={e => setProductUrl(e.target.value)}
              placeholder="https://www.tiktok.com/shop/... o https://www.amazon.com/..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-3 focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-3 text-zinc-300">¿Cómo quieres crearlo?</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODES.map(m => {
              const Icon = m.icon;
              const isActive = mode === m.id;
              return (
                <button key={m.id} type="button" onClick={() => setMode(m.id)}
                  className={`text-left p-5 rounded-xl border-2 transition ${
                    isActive ? 'border-brand-500 bg-brand-500/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                  }`}>
                  <Icon size={28} className={isActive ? 'text-brand-500' : 'text-zinc-400'} />
                  <h3 className="font-bold mt-3">{m.title}</h3>
                  <p className="text-xs text-zinc-400 mt-1">{m.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {error && <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/30 rounded-lg">{error}</div>}

        <button type="submit" disabled={isPending || !productUrl}
          className="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-bold rounded-lg transition flex items-center justify-center gap-2">
          {isPending ? <><Loader2 className="animate-spin" size={20} /> Lanzando pipeline…</> : 'Generar video'}
        </button>
      </form>
    </div>
  );
}
