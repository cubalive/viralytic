import { NextResponse } from 'next/server';
import { getSupabaseServer, getActiveOrgId, getActiveBrandId } from '@/lib/supabase';
import { BrandInputSchema } from '@viralytic/shared';

// GET — the active org's brand, or null if none configured yet.
export async function GET() {
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  if (!orgId) return new NextResponse('Unauthorized', { status: 401 });

  const { data } = await supabase
    .from('brands')
    .select('id, name, tone, target_audience, unique_selling_points, forbidden_words, language')
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();
  return NextResponse.json(data ?? null);
}

// POST — create/update the active org's brand. One brand per org for v1, so
// this upserts (update if one exists, else insert) and is safe to re-run.
export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  if (!orgId) return new NextResponse('Unauthorized', { status: 401 });

  const parsed = BrandInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const row = {
    organization_id: orgId,
    name: input.name,
    tone: input.tone ?? null,
    target_audience: input.targetAudience ?? null,
    unique_selling_points: input.uniqueSellingPoints ?? null,
    forbidden_words: input.forbiddenWords ?? null,
    language: input.language,
  };

  const existingId = await getActiveBrandId(supabase, orgId);
  const result = existingId
    ? await supabase.from('brands').update(row).eq('id', existingId).select('id').single()
    : await supabase.from('brands').insert(row).select('id').single();

  if (result.error) return new NextResponse(result.error.message, { status: 500 });
  return NextResponse.json({ id: result.data.id, ok: true });
}
