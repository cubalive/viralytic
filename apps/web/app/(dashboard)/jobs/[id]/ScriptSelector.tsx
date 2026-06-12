'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SelectableScript {
  id: string;
  variant: number;
  framework: string | null;
  hook: string | null;
  body: string | null;
  cta: string | null;
  estimated_duration_seconds: number | null;
}

export function ScriptSelector({ jobId, scripts }: { jobId: string; scripts: SelectableScript[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function choose(scriptId: string) {
    setBusy(scriptId);
    setError('');
    const res = await fetch(`/api/jobs/${jobId}/select-script`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scriptId }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setBusy(null);
      setError(await res.text().catch(() => 'Error al elegir el guion'));
    }
  }

  return (
    <section className="mb-4">
      <h2 className="text-xl font-bold mb-3">Elige un guion</h2>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="space-y-3">
        {scripts.map((s) => (
          <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-widest text-magenta">
                {s.framework ?? 'script'} · variante {s.variant}
              </span>
              {s.estimated_duration_seconds != null && (
                <span className="text-xs text-zinc-500">{Math.round(s.estimated_duration_seconds)}s</span>
              )}
            </div>
            {s.hook && <p className="font-bold mb-1">{s.hook}</p>}
            {s.body && <p className="text-sm text-zinc-400 mb-2 whitespace-pre-line">{s.body}</p>}
            {s.cta && <p className="text-sm text-zinc-300 mb-3">CTA: {s.cta}</p>}
            <button
              onClick={() => choose(s.id)}
              disabled={!!busy}
              className="px-4 py-2 bg-magenta text-white rounded-lg text-sm font-semibold hover:bg-magenta-600 disabled:opacity-50"
            >
              {busy === s.id ? 'Eligiendo…' : 'Elegir este'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
