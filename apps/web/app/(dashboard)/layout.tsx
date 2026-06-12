import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrendingUp, Sparkles, ListChecks, Settings, LogOut, Music } from 'lucide-react';
import { getSupabaseServer } from '@/lib/supabase';
import { isAdmin } from '@/lib/admin';

const navItems = [
  { href: '/trending', label: 'Trending', icon: TrendingUp },
  { href: '/create',   label: 'Create',   icon: Sparkles },
  { href: '/jobs',     label: 'Jobs',     icon: ListChecks },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Admin-only modules appear only for owners/admins.
  const nav = (await isAdmin())
    ? [...navItems, { href: '/music-videos', label: 'Music Videos', icon: Music }]
    : navItems;

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-white/5 bg-graphite-50 p-5 flex flex-col">
        <Link href="/trending" className="flex items-center gap-2 mb-10 px-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-magenta to-cyan-brand relative">
            <div className="absolute inset-[3px] bg-graphite rounded-sm" />
            <div className="absolute inset-[8px] bg-gradient-to-br from-magenta to-cyan-brand rounded-[1px]" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">
            viral<span className="italic">ytic</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-0.5">
          {nav.map(n => (
            <Link key={n.href} href={n.href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition text-sm">
              <n.icon size={17} strokeWidth={1.75} />
              <span className="font-medium">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/5 pt-4 mt-4">
          <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600 truncate">{user.email}</div>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white transition text-sm">
              <LogOut size={17} strokeWidth={1.75} /><span className="font-medium">Sign out</span>
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-10 overflow-auto">{children}</main>
    </div>
  );
}
