import Link from 'next/link';
import { Reveal } from '@/components/motion';

export default function LandingPage() {
  return (
    <main className="grain relative flex min-h-screen flex-col overflow-hidden">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="pointer-events-none absolute inset-0 bg-grid [background-size:44px_44px] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,#000_20%,transparent_70%)] opacity-60" />
      <div className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] rounded-full bg-magenta/20 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[500px] w-[500px] rounded-full bg-cyan-brand/15 blur-[130px]" />

      {/* NAV */}
      <nav className="relative z-50 border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo />
          {/* discreet access for the owner — no public product yet */}
          <Link href="/login" className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-200">
            Sign in
          </Link>
        </div>
      </nav>

      {/* HERO — teaser only, nothing concrete */}
      <section className="relative z-10 flex flex-1 items-center px-6">
        <div className="mx-auto w-full max-w-3xl py-24 text-center">
          <Reveal>
            <div className="vx-eyebrow mb-8 justify-center">
              <span className="h-px w-8 bg-zinc-500" />
              Where data meets virality
              <span className="h-px w-8 bg-zinc-500" />
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="mb-8 font-display text-6xl font-normal leading-[0.95] tracking-tight md:text-7xl">
              Intelligence,
              <br />
              <span className="italic text-gradient">in motion.</span>
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mx-auto mb-12 max-w-xl text-lg leading-relaxed text-zinc-400 md:text-xl">
              We turn signal into story. Something is being built here — quietly, and on purpose.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 backdrop-blur-xl">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-magenta opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-magenta" />
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-300">Coming soon</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          <span>© viralytic</span>
          <span>All rights reserved</span>
        </div>
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-xl">
      <div className="relative h-7 w-7 rounded-md bg-brand-gradient">
        <div className="absolute inset-[3px] rounded-sm bg-graphite" />
        <div className="absolute inset-[8px] rounded-[1px] bg-brand-gradient" />
      </div>
      <span className="font-semibold tracking-tight">
        viral<span className="italic">ytic</span>
      </span>
    </Link>
  );
}
