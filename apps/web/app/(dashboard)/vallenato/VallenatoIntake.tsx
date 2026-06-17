'use client';

import { useState, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Check, FileText, Music2, AudioWaveform, Loader2, UploadCloud, type LucideIcon } from 'lucide-react';
import { createUploadTarget, recordUpload, saveLyrics } from './actions';
import { cn } from '@/lib/cn';

type SlotState = 'idle' | 'busy' | 'done';

export function VallenatoIntake({
  songId,
  hasLyrics,
  hasTrack,
  hasStem,
}: {
  songId: string;
  hasLyrics: boolean;
  hasTrack: boolean;
  hasStem: boolean;
}) {
  const [lyrics, setLyrics] = useState<SlotState>(hasLyrics ? 'done' : 'idle');
  const [track, setTrack] = useState<SlotState>(hasTrack ? 'done' : 'idle');
  const [stem, setStem] = useState<SlotState>(hasStem ? 'done' : 'idle');
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sb = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  async function onLyrics(file: File) {
    setErr(null); setLyrics('busy');
    try {
      await saveLyrics({ songId, lyrics: await file.text() });
      setLyrics('done'); startTransition(() => {});
    } catch (e) { setErr((e as Error).message); setLyrics('idle'); }
  }

  async function onWav(kind: 'track' | 'stem', file: File, set: (s: SlotState) => void) {
    setErr(null); set('busy');
    try {
      const target = await createUploadTarget({ songId, kind });
      if ('error' in target) throw new Error(target.error);
      const { error } = await sb().storage.from('assets').uploadToSignedUrl(target.path, target.token, file);
      if (error) throw error;
      await recordUpload({ songId, kind, path: target.path });
      set('done'); startTransition(() => {});
    } catch (e) { setErr((e as Error).message); set('idle'); }
  }

  const done = [lyrics, track, stem].filter((s) => s === 'done').length;

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Intake</span>
        <span className={cn('font-mono text-[10px] tracking-widest', done === 3 ? 'text-neon' : 'text-zinc-500')}>
          {done}/3 {done === 3 ? '· generando…' : 'archivos'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Slot label="letra.txt" icon={FileText} state={lyrics} accept=".txt,text/plain" onPick={onLyrics} />
        <Slot label="cancion.wav" icon={Music2} state={track} accept=".wav,audio/wav,audio/x-wav" onPick={(f) => onWav('track', f, setTrack)} />
        <Slot label="voz.wav (stem)" icon={AudioWaveform} state={stem} accept=".wav,audio/wav,audio/x-wav" onPick={(f) => onWav('stem', f, setStem)} />
      </div>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
    </div>
  );
}

function Slot({
  label, icon: Icon, state, accept, onPick,
}: {
  label: string; icon: LucideIcon; state: SlotState; accept: string; onPick: (file: File) => void;
}) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200',
        state === 'done'
          ? 'border-neon/30 bg-neon/[0.05] text-zinc-200'
          : 'border-white/10 bg-graphite-100/60 text-zinc-400 hover:border-magenta/50 hover:text-zinc-100',
      )}
    >
      <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', state === 'done' ? 'bg-neon/10 text-neon' : 'bg-white/5 text-zinc-400 group-hover:text-magenta')}>
        {state === 'busy' ? <Loader2 size={15} className="animate-spin" /> : state === 'done' ? <Check size={15} /> : <Icon size={15} />}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-wide">{label}</span>
      {state !== 'done' && <UploadCloud size={14} className="text-zinc-600 group-hover:text-zinc-300" />}
      <input
        type="file" accept={accept} className="hidden" disabled={state === 'busy'}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
      />
    </label>
  );
}
