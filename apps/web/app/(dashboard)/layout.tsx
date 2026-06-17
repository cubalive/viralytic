import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase';
import { isAdmin } from '@/lib/admin';
import { SidebarNav, type NavItem } from '@/components/sidebar-nav';

const baseNav: NavItem[] = [
  { href: '/trending', label: 'Trending', icon: 'trending' },
  { href: '/create', label: 'Create', icon: 'create' },
  { href: '/jobs', label: 'Jobs', icon: 'jobs' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const adminNav: NavItem[] = [
  { href: '/stats', label: 'Estadísticas', icon: 'stats' },
  { href: '/music-videos', label: 'Music Videos', icon: 'music' },
  { href: '/caroline', label: 'Caroline', icon: 'caroline' },
  { href: '/vallenato', label: 'Vallenatos', icon: 'vallenato' },
  { href: '/faceless', label: 'Faceless/Tech', icon: 'faceless' },
  { href: '/reels', label: 'Reels', icon: 'reels' },
  { href: '/bank', label: 'Banco', icon: 'bank' },
  { href: '/connections', label: 'YouTube', icon: 'youtube' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  // Entire workspace is SUPERADMIN-only for now: the client product is still
  // incomplete, so it's not exposed to subscribers yet. Non-superadmins → public site.
  if (!(await isAdmin())) redirect('/');

  const nav = [...baseNav, ...adminNav];

  return (
    <div className="flex min-h-screen">
      <SidebarNav items={nav} email={user.email} />
      <main className="relative flex-1 overflow-auto">
        {/* subtle ambient backdrop */}
        <div className="pointer-events-none fixed inset-0 left-64 bg-aurora opacity-60" />
        <div className="relative mx-auto w-full max-w-[1200px] p-8 md:p-10 lg:p-12">{children}</div>
      </main>
    </div>
  );
}
