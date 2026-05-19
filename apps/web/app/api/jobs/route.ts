import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServer, getActiveOrgId } from '@/lib/supabase';
import { VideoModeSchema } from '@viralytic/shared';

const BodySchema = z.object({
  productUrl: z.string().url(),
  mode: VideoModeSchema,
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  if (!orgId) return new NextResponse('Unauthorized', { status: 401 });

  const body = BodySchema.parse(await req.json());

  // Create product placeholder
  const { data: product, error: pErr } = await supabase
    .from('products').insert({
      organization_id: orgId,
      source_url: body.productUrl,
      source_platform: detectPlatform(body.productUrl),
    }).select().single();
  if (pErr) return new NextResponse(pErr.message, { status: 500 });

  // Create job
  const { data: job, error: jErr } = await supabase
    .from('video_jobs').insert({
      organization_id: orgId,
      product_id: product.id,
      mode: body.mode,
      status: 'pending',
    }).select().single();
  if (jErr) return new NextResponse(jErr.message, { status: 500 });

  // Enqueue the pipeline (call workers HTTP endpoint OR add to BullMQ directly)
  // For now, the worker process picks it up via polling. Cleaner: REST trigger.
  // TODO: POST to /workers/trigger with jobId

  return NextResponse.json({ jobId: job.id });
}

function detectPlatform(url: string): string {
  if (url.includes('tiktok.com')) return 'tiktok_shop';
  if (url.includes('amazon.')) return 'amazon';
  if (url.includes('shopify')) return 'shopify';
  return 'generic';
}
