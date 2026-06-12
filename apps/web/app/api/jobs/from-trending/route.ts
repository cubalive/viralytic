import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServer, getActiveOrgId, getActiveBrandId } from '@/lib/supabase';
import { VideoModeSchema, logger } from '@viralytic/shared';
import { enqueueProductAnalysis } from '@/lib/queue';

const JsonBodySchema = z.object({
  // Accept both the documented name and the field the trending page form sends.
  trending_product_id: z.string().uuid().optional(),
  trendingId: z.string().uuid().optional(),
  mode: VideoModeSchema.optional(),
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  if (!orgId) return new NextResponse('Unauthorized', { status: 401 });

  // The trending page submits a native HTML form (x-www-form-urlencoded);
  // programmatic callers send JSON with `trending_product_id`. Support both.
  const contentType = req.headers.get('content-type') ?? '';
  let trendingId: string | undefined;
  let mode: z.infer<typeof VideoModeSchema> = 'ai_full';
  let isForm = false;

  if (contentType.includes('application/json')) {
    const body = JsonBodySchema.parse(await req.json());
    trendingId = body.trending_product_id ?? body.trendingId;
    if (body.mode) mode = body.mode;
  } else {
    const form = await req.formData();
    trendingId = (form.get('trending_product_id') ?? form.get('trendingId'))?.toString();
    isForm = true;
  }

  const parsedId = z.string().uuid().safeParse(trendingId);
  if (!parsedId.success) return new NextResponse('trending_product_id is required', { status: 400 });

  // Trending cache is global + readable by any authenticated member (see RLS).
  const { data: trending, error: tErr } = await supabase
    .from('trending_products')
    .select('id, title, product_url, thumbnail_url, estimated_price, source')
    .eq('id', parsedId.data)
    .single();
  if (tErr || !trending) return new NextResponse('Trending product not found', { status: 404 });

  const t: any = trending;

  const brandId = await getActiveBrandId(supabase, orgId);
  if (!brandId) {
    return new NextResponse(
      'Organization has no brand configured. Create a brand first.',
      { status: 400 },
    );
  }

  // Create product from the trending snapshot.
  const { data: product, error: pErr } = await supabase
    .from('products').insert({
      organization_id: orgId,
      source_url: t.product_url ?? `trending:${t.id}`,
      source_platform: detectPlatform(t.product_url),
      title: t.title,
      price: t.estimated_price ?? null,
      images: t.thumbnail_url ? [t.thumbnail_url] : null,
    }).select('id').single();
  if (pErr) return new NextResponse(pErr.message, { status: 500 });

  const { data: job, error: jErr } = await supabase
    .from('video_jobs').insert({
      organization_id: orgId,
      product_id: product.id,
      brand_id: brandId,
      mode,
      status: 'pending',
    }).select('id').single();
  if (jErr) return new NextResponse(jErr.message, { status: 500 });

  let queued = true;
  try {
    await enqueueProductAnalysis({ jobId: job.id, productId: product.id });
  } catch (err) {
    queued = false;
    logger.error({ err, jobId: job.id }, 'queue.enqueue_failed');
  }

  // PRG redirect for the native form submit; JSON for programmatic callers.
  if (isForm) {
    return NextResponse.redirect(new URL(`/jobs/${job.id}`, req.url), 303);
  }
  return NextResponse.json({ jobId: job.id, queued });
}

function detectPlatform(url: string | null | undefined): string {
  if (!url) return 'trending';
  if (url.includes('tiktok.com')) return 'tiktok_shop';
  if (url.includes('amazon.')) return 'amazon';
  if (url.includes('shopify')) return 'shopify';
  return 'generic';
}
