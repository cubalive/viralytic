import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) =>
          toSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options); } catch { /* RSC ignore */ }
          }),
      },
    }
  );
}

export async function getActiveOrgId(): Promise<string | null> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1).single();
  return data?.organization_id ?? null;
}

type SupabaseServer = Awaited<ReturnType<typeof getSupabaseServer>>;

// A job must carry a brand_id so downstream agents (copywriter, judge) know
// the brand voice. Returns the org's first brand, or null if none exists yet.
export async function getActiveBrandId(
  supabase: SupabaseServer,
  orgId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('brands').select('id').eq('organization_id', orgId).limit(1).maybeSingle();
  return data?.id ?? null;
}
