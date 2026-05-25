'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowUpRight, Check } from 'lucide-react';

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getClient = () => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    await getClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    });
    setSent(true);
    setLoading(false);
  };

  const handlePassword = async () => {
    setError(null);
    setPwLoading(true);
    const { error: signInError } = await getClient().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setPwLoading(false);
      return;
    }
    window.location.href = '/trending';
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-magenta/15 blur-[100px] rounded-full" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-brand/10 blur-[100px] rounded-full" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex items-center gap-2 mb-12">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-magenta to-cyan-brand relative">
            <div className="absolute inset-[3px] bg-graphite rounded-sm" />
            <div className="absolute inset-[9px] bg-gradient-to-br from-magenta to-cyan-brand rounded-[1px]" />
          </div>
          <span className="font-display text-2xl font-semibold">
            viral<span className="italic">ytic</span>
          </span>
        </div>

        <h1 className="font-display text-5xl leading-tight mb-3">Welcome <span className="italic">back.</span></h1>
        <p className="text-zinc-400 mb-10">Sign in with a magic link. No password.</p>

        {urlError && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
            {urlError}
          </div>
        )}

        {sent ? (
          <div className="p-6 bg-graphite-50 border border-white/5 rounded-2xl">
            <Check className="text-neon mb-3" size={24} />
            <p className="text-zinc-200 font-medium mb-1">Check your inbox</p>
            <p className="text-zinc-500 text-sm">We sent a magic link to <span className="text-zinc-300">{email}</span>. Click it to continue.</p>
          </div>
        ) : (
          <>
            <form onSubmit={handleMagicLink} className="space-y-3">
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@founder.com"
                className="w-full bg-graphite-50 border border-white/10 rounded-xl px-4 py-3.5 focus:border-magenta focus:outline-none transition"
              />
              <button type="submit" disabled={loading || !email}
                className="w-full py-3.5 bg-magenta hover:bg-magenta-600 disabled:opacity-40 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 group">
                {loading ? 'Sending...' : 'Send magic link'}
                <ArrowUpRight size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">or continue with password</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-3">
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-graphite-50 border border-white/10 rounded-xl px-4 py-3.5 focus:border-magenta focus:outline-none transition"
              />
              <button type="button" onClick={handlePassword} disabled={pwLoading || !email || !password}
                className="w-full py-3.5 border border-white/10 hover:bg-white/5 disabled:opacity-40 text-zinc-200 font-medium rounded-xl transition">
                {pwLoading ? 'Signing in...' : 'Sign in with password'}
              </button>
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
            </div>
          </>
        )}

        <p className="text-zinc-600 text-xs mt-12 font-mono uppercase tracking-widest">
          By signing in, you agree to our terms.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
