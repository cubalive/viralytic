'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonVariants } from '@/components/ui/button';
import { verifyAllConnections } from './actions';

type Verdict = { channelId: string; handle: string | null; ok: boolean; title?: string | null; error?: string };

/** Audits every channel's token by forcing a real refresh against Google. */
export function VerifyButton() {
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<{ ok: number; expired: number; results: Verdict[] } | null>(null);

  return (
    <div className="mb-8">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setSummary(await verifyAllConnections()))}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), pending && 'opacity-60')}
      >
        <RefreshCw size={15} className={pending ? 'animate-spin' : ''} />
        {pending ? 'Probando…' : 'Probar todas las conexiones'}
      </button>

      {summary && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm">
          <p className="mb-2 text-zinc-300">
            <span className="text-neon">{summary.ok} con token vivo</span>
            {summary.expired > 0 && <span className="text-magenta"> · {summary.expired} caducadas</span>}
          </p>
          <ul className="space-y-1">
            {summary.results.map((r) => (
              <li key={r.channelId} className="flex items-center gap-2 text-xs">
                {r.ok ? (
                  <CheckCircle2 size={13} className="shrink-0 text-neon" />
                ) : (
                  <AlertCircle size={13} className="shrink-0 text-magenta" />
                )}
                <span className="text-zinc-400">{r.handle ?? r.channelId.slice(0, 8)}</span>
                <span className="truncate text-zinc-600">
                  {r.ok ? (r.title ?? 'ok') : r.error}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
