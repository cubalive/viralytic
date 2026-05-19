import Link from 'next/link';
import { ArrowUpRight, Sparkles, Zap, TrendingUp } from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* NAV */}
      <nav className="border-b border-white/5 backdrop-blur-xl bg-graphite/70 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 max-w-6xl flex items-center justify-between">
          <Logo />
          <Link href="/login" className="font-mono text-xs uppercase tracking-widest px-5 py-2 bg-white text-graphite rounded-full font-semibold hover:scale-105 transition">
            Start free
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden py-24 px-6">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-magenta/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-brand/15 blur-[120px] rounded-full" />

        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-8 flex items-center gap-3">
            <span className="w-8 h-px bg-zinc-500" />
            Where data meets virality
          </div>

          <h1 className="font-display text-7xl md:text-8xl font-normal leading-[0.95] tracking-tight mb-8">
            Your product.<br />
            A viral{' '}
            <span className="italic bg-gradient-to-r from-magenta to-cyan-brand bg-clip-text text-transparent">
              TikTok.
            </span>
            <br />
            In ten minutes.
          </h1>

          <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl leading-relaxed mb-12">
            The intelligence platform that analyzes what converts, ensembles two frontier models with a Judge, and ships videos that sell.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link href="/login" className="px-8 py-4 bg-magenta hover:bg-magenta-600 text-white font-semibold rounded-full transition group">
              Generate your first video
              <ArrowUpRight className="inline ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" size={18} />
            </Link>
            <Link href="/trending" className="px-8 py-4 border border-white/10 rounded-full hover:bg-white/5 transition font-medium">
              Browse trending products
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-0 mt-20 border-y border-white/10 py-8">
            {[
              { v: '3', l: 'Creation modes' },
              { v: '8', l: 'Pipeline stages' },
              { v: '5', l: 'Trending sources' },
              { v: '~10', l: 'Minutes URL→post', suffix: 'min' },
            ].map((s, i) => (
              <div key={i} className={`px-6 ${i > 0 ? 'border-l border-white/10' : ''}`}>
                <div className="font-display text-5xl">{s.v}{s.suffix && <span className="font-mono text-sm text-zinc-500 ml-1">{s.suffix}</span>}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mt-2">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THREE PILLARS */}
      <section className="border-t border-white/5 py-24 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-6">
            <Pillar
              icon={<TrendingUp />}
              tag="01 · Discover"
              title="Trending sourced from 5 channels"
              desc="TikTok Creative Center, hashtags, Google Trends, Reddit, Amazon Movers. Refreshed every 12 hours. Ranked by composite virality."
            />
            <Pillar
              icon={<Sparkles />}
              tag="02 · Generate"
              title="Claude + GPT + Judge ensemble"
              desc="Two frontier models write three variants each. A Judge agent ranks all six against your brand's historical winners. You get the top three."
            />
            <Pillar
              icon={<Zap />}
              tag="03 · Ship"
              title="Voice, visuals, captions, posted"
              desc="ElevenLabs voice clone with SSML emphasis. Flux Pro + Kling visuals. Remotion-rendered captions. Auto-published to TikTok."
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-xl">
      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-magenta to-cyan-brand relative">
        <div className="absolute inset-[3px] bg-graphite rounded-sm" />
        <div className="absolute inset-[8px] bg-gradient-to-br from-magenta to-cyan-brand rounded-[1px]" />
      </div>
      <span className="font-semibold tracking-tight">
        viral<span className="italic font-display">ytic</span>
      </span>
    </Link>
  );
}

function Pillar({ icon, tag, title, desc }: any) {
  return (
    <div className="p-8 rounded-2xl border border-white/5 bg-graphite-50 hover:border-white/10 transition group">
      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-cyan-brand mb-6 group-hover:text-magenta transition">
        {icon}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-3">{tag}</div>
      <h3 className="font-display text-2xl mb-3 leading-tight">{title}</h3>
      <p className="text-zinc-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}
