import { NextResponse } from 'next/server';
import { getSupabaseServer, getActiveOrgId, getActiveBrandId } from '@/lib/supabase';
import { VoiceInputSchema } from '@viralytic/shared';

// GET — voices configured for the active org.
export async function GET() {
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  if (!orgId) return new NextResponse('Unauthorized', { status: 401 });

  const { data } = await supabase
    .from('voices')
    .select('id, name, elevenlabs_voice_id, language, default_stability, default_similarity, default_style')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });
  return NextResponse.json(data ?? []);
}

// POST — register an existing ElevenLabs voice for the org. v1: the user pastes
// an elevenlabs_voice_id from their account (audio cloning comes later).
// Idempotent: re-posting the same voice id updates it instead of duplicating.
export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  if (!orgId) return new NextResponse('Unauthorized', { status: 401 });

  const parsed = VoiceInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const brandId = await getActiveBrandId(supabase, orgId);

  const row = {
    organization_id: orgId,
    brand_id: brandId,
    name: input.name,
    elevenlabs_voice_id: input.elevenlabsVoiceId,
    ...(input.stability !== undefined ? { default_stability: input.stability } : {}),
    ...(input.similarity !== undefined ? { default_similarity: input.similarity } : {}),
    ...(input.style !== undefined ? { default_style: input.style } : {}),
  };

  const { data: existing } = await supabase
    .from('voices')
    .select('id')
    .eq('organization_id', orgId)
    .eq('elevenlabs_voice_id', input.elevenlabsVoiceId)
    .limit(1)
    .maybeSingle();

  const result = existing
    ? await supabase.from('voices').update(row).eq('id', existing.id).select('id').single()
    : await supabase.from('voices').insert(row).select('id').single();

  if (result.error) return new NextResponse(result.error.message, { status: 500 });
  return NextResponse.json({ id: result.data.id, ok: true });
}
