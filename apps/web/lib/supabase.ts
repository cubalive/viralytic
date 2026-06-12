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

// The voice whose elevenlabs_voice_id voice-synthesis will use. Scoped to the
// org (and the brand when given). Returns null when none is configured yet —
// callers must decide whether that blocks them.
export async function getActiveVoiceId(
  supabase: SupabaseServer,
  orgId: string,
  brandId?: string,
): Promise<string | null> {
  let query = supabase.from('voices').select('id').eq('organization_id', orgId);
  if (brandId) query = query.eq('brand_id', brandId);
  const { data } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}
