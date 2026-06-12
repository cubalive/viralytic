'use client';

import { useEffect, useState } from 'react';

const card = 'bg-zinc-900 border border-zinc-800 rounded-xl p-6';
const input = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-magenta';
const label = 'text-xs uppercase tracking-widest text-zinc-500 mb-1 block';
const btn = 'px-4 py-2 bg-magenta text-white rounded-lg text-sm font-semibold hover:bg-magenta-600 disabled:opacity-50';

const toList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const numOrU = (s: string) => (s.trim() === '' ? undefined : Number(s));

export function BrandForm() {
  const [name, setName] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [usps, setUsps] = useState('');
  const [forbidden, setForbidden] = useState('');
  const [language, setLanguage] = useState('es');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/brands').then((r) => r.json()).then((b) => {
      if (!b) return;
      setName(b.name ?? ''); setTone(b.tone ?? ''); setAudience(b.target_audience ?? '');
      setUsps((b.unique_selling_points ?? []).join(', '));
      setForbidden((b.forbidden_words ?? []).join(', '));
      setLanguage(b.language ?? 'es');
    }).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const res = await fetch('/api/brands', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name, tone: tone || undefined, targetAudience: audience || undefined,
        uniqueSellingPoints: toList(usps), forbiddenWords: toList(forbidden), language,
      }),
    });
    setBusy(false);
    setMsg(res.ok ? 'Marca guardada ✓' : `Error: ${await res.text().catch(() => res.status)}`);
  }

  return (
    <section className={card}>
      <h2 className="text-xl font-bold mb-2">Marca</h2>
      <p className="text-zinc-400 text-sm mb-4">Define tu voz, audiencia y diferenciadores. Esto alimenta al copywriter.</p>
      <form onSubmit={save} className="space-y-3">
        <div><label className={label}>Nombre *</label><input className={input} value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Tono</label><input className={input} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="friendly, expert, edgy" /></div>
          <div><label className={label}>Idioma</label><input className={input} value={language} onChange={(e) => setLanguage(e.target.value)} /></div>
        </div>
        <div><label className={label}>Audiencia objetivo</label><input className={input} value={audience} onChange={(e) => setAudience(e.target.value)} /></div>
        <div><label className={label}>USPs (separados por coma)</label><input className={input} value={usps} onChange={(e) => setUsps(e.target.value)} /></div>
        <div><label className={label}>Palabras prohibidas (coma)</label><input className={input} value={forbidden} onChange={(e) => setForbidden(e.target.value)} /></div>
        <div className="flex items-center gap-3">
          <button type="submit" className={btn} disabled={busy}>{busy ? 'Guardando…' : 'Guardar marca'}</button>
          {msg && <span className="text-sm text-zinc-400">{msg}</span>}
        </div>
      </form>
    </section>
  );
}

export function VoiceForm() {
  const [voices, setVoices] = useState<Array<{ id: string; name: string; elevenlabs_voice_id: string }>>([]);
  const [name, setName] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [stability, setStability] = useState('');
  const [similarity, setSimilarity] = useState('');
  const [style, setStyle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/voices').then((r) => r.json()).then((v) => setVoices(Array.isArray(v) ? v : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const res = await fetch('/api/voices', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name, elevenlabsVoiceId: voiceId,
        stability: numOrU(stability), similarity: numOrU(similarity), style: numOrU(style),
      }),
    });
    setBusy(false);
    if (res.ok) { setMsg('Voz guardada ✓'); setName(''); setVoiceId(''); load(); }
    else setMsg(`Error: ${await res.text().catch(() => res.status)}`);
  }

  return (
    <section className={card}>
      <h2 className="text-xl font-bold mb-2">Voces</h2>
      <p className="text-zinc-400 text-sm mb-4">Pega un voice_id existente de tu cuenta de ElevenLabs. (El clonado por audio llega después.)</p>
      {voices.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm">
          {voices.map((v) => (
            <li key={v.id} className="flex justify-between text-zinc-300">
              <span>{v.name}</span><span className="font-mono text-xs text-zinc-500">{v.elevenlabs_voice_id}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Nombre *</label><input className={input} value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><label className={label}>ElevenLabs voice_id *</label><input className={input} value={voiceId} onChange={(e) => setVoiceId(e.target.value)} required /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={label}>Stability</label><input className={input} value={stability} onChange={(e) => setStability(e.target.value)} placeholder="0.5" /></div>
          <div><label className={label}>Similarity</label><input className={input} value={similarity} onChange={(e) => setSimilarity(e.target.value)} placeholder="0.75" /></div>
          <div><label className={label}>Style</label><input className={input} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="0.3" /></div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className={btn} disabled={busy}>{busy ? 'Guardando…' : '+ Añadir voz'}</button>
          {msg && <span className="text-sm text-zinc-400">{msg}</span>}
        </div>
      </form>
    </section>
  );
}
