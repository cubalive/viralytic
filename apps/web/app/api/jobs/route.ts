import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServer, getActiveOrgId, getActiveBrandId, getActiveVoiceId } from '@/lib/supabase';
import { VideoModeSchema, logger } from '@viralytic/shared';
import { enqueueProductAnalysis } from '@/lib/queue';

const BodySchema = z.object({
  productUrl: z.string().url(),
  mode: VideoModeSchema,
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  if (!orgId) return new NextResponse('Unauthorized', { status: 401 });

  const body = BodySchema.parse(await req.json());

  const brandId = await getActiveBrandId(supabase, orgId);
  if (!brandId) {
    return new NextResponse(
      'Organization has no brand configured. Create a brand first.',
      { status: 400 },
    );
  }

  // Attach a voice if one is configured; null is fine here — the user can pick
  // one before voice-synthesis (e.g. when selecting a script).
  const voiceId =
    (await getActiveVoiceId(supabase, orgId, brandId)) ?? (await getActiveVoiceId(supabase, orgId));

  const { data: product, error: pErr } = await supabase
    .from('products').insert({
      organization_id: orgId,
      source_url: body.productUrl,
      source_platform: detectPlatform(body.productUrl),
    }).select().single();
  if (pErr) return new NextResponse(pErr.message, { status: 500 });

  const { data: job, error: jErr } = await supabase
    .from('video_jobs').insert({
      organization_id: orgId,
      product_id: product.id,
      brand_id: brandId,
      voice_id: voiceId,
      mode: body.mode,
      status: 'pending',
    }).select().single();
  if (jErr) return new NextResponse(jErr.message, { status: 500 });

  try {
    await enqueueProductAnalysis({ jobId: job.id, productId: product.id });
    return NextResponse.json({ jobId: job.id, queued: true });
  } catch (err) {
    logger.error({ err, jobId: job.id }, 'queue.enqueue_failed');
    return NextResponse.json({
      jobId: job.id,
      queued: false,
      message: 'Job created but not enqueued. Stays in pending for manual retry.',
    });
  }
}

function detectPlatform(url: string): string {
  if (url.includes('tiktok.com')) return 'tiktok_shop';
  if (url.includes('amazon.')) return 'amazon';
  if (url.includes('shopify')) return 'shopify';
  return 'generic';
}
