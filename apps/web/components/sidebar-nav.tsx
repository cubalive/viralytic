'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Sparkles,
  ListChecks,
  Settings,
  LogOut,
  Music,
  Youtube,
  Boxes,
  Cpu,
  Mic2,
  Clapperboard,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const ICONS: Record<string, LucideIcon> = {
  trending: TrendingUp,
  create: Sparkles,
  jobs: ListChecks,
  settings: Settings,
  music: Music,
  faceless: Cpu,
  bank: Boxes,
  youtube: Youtube,
  caroline: Mic2,
  reels: Clapperboard,
  stats: BarChart3,
};

export type NavItem = { href: string; label: string; icon: string; admin?: boolean };

export function SidebarNav({ items, email }: { items: NavItem[]; email?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-white/[0.06] bg-graphite-50/80 p-5 backdrop-blur-xl">
      <Link href="/trending" className="mb-9 flex items-center gap-2.5 px-2">
        <div className="relative h-8 w-8 rounded-lg bg-brand-gradient">
          <div className="absolute inset-[3px] rounded-md bg-graphite-50" />
          <div className="absolute inset-[8px] rounded-[2px] bg-brand-gradient" />
        </div>
        <span className="font-display text-xl font-semibold tracking-tight">
          viral<span className="italic">ytic</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1">
        {items.map((n) => {
          const Icon = ICONS[n.icon] ?? Sparkles;
          const active = pathname === n.href || (n.href !== '/trending' && pathname?.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200',
                active ? 'text-white' : 'text-zinc-400 hover:text-white'
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 -z-10 rounded-xl border border-white/10 bg-white/[0.06]"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon
                size={17}
                strokeWidth={1.9}
                className={cn('transition-colors', active ? 'text-magenta' : 'group-hover:text-cyan-brand')}
              />
              <span className="font-medium">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <div className="truncate px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          {email}
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut size={17} strokeWidth={1.9} />
            <span className="font-medium">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
