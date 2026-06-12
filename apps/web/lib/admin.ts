import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@viralytic/db';
import { getSupabaseServer } from './supabase';

// The generated DB types don't yet include the mv_* tables (added in migration
// 004 — regenerate with `pnpm db:types` once it's applied). Until then, expose
// the service client as an untyped client so the admin queries compile.
type AdminDb = SupabaseClient;

export interface AdminContext {
  userId: string;
  email: string | null;
  orgId: string;
  db: AdminDb;
}

/**
 * Gate a server component/action to organization admins. Verifies the signed-in
 * user is an 'owner' or 'admin', then returns a service-role client for the
 * admin-only mv_* tables (which are RLS-locked to the service role). Redirects
 * unauthenticated users to login and non-admins to the dashboard.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .limit(1)
    .maybeSingle();
  if (!member) redirect('/trending');

  return {
    userId: user.id,
    email: user.email ?? null,
    orgId: member.organization_id,
    db: getServiceClient() as unknown as AdminDb,
  };
}

/** Lightweight admin check for conditional UI (e.g. nav). */
export async function isAdmin(): Promise<boolean> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .limit(1)
    .maybeSingle();
  return !!member;
}
