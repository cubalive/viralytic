import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload, queues } from '../queues';
import { scrapeCompetitorVideos } from '@viralytic/scrapers';
import { analyzeTrends, embedText } from '@viralytic/ai';
import { getServiceClient } from '@viralytic/db';
import { setStatus, recordUsage } from '../lib/orchestrator';
import { logger, QUEUE_NAMES } from '@viralytic/shared';

const MAX_VIDEOS = 12;

/**
 * Step 2 — Competitor research (the Viralytic edge).
 *
 * Discover top viral TikToks for the product's niche, classify them with the
 * trend-analyzer LLM (hook type, framework, virality), embed each for the
 * learning loop, and persist to `competitor_videos`. script-generation reads
 * those rows directly to ground the copywriter + judge.
 *
 * Idempotent: skips scraping if competitor_videos already exist for the product.
 * Graceful: if no videos can be discovered (or analysis fails), still proceeds
 * to script generation — the pipeline must never block on competitor data.
 */
export const competitorResearchWorker = new Worker<JobPayload['competitorResearch']>(
  QUEUE_NAMES.competitorResearch,
  async (job: Job<JobPayload['competitorResearch']>) => {
    const { jobId, productId } = job.data;
    const db = getServiceClient();

    await setStatus(jobId, 'scripting', 'competitor-research');

    // Idempotency: already researched this product?
    const { count: existing } = await db
      .from('competitor_videos')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId);
    if (existing && existing > 0) {
      logger.info({ jobId, productId, existing }, 'competitor.already_researched.skip');
      await queues.scriptGeneration.add('generate', { jobId });
      return { skipped: true };
    }

    // Load product + brand language for the niche search and analysis context.
    const { data: videoJob } = await db.from('video_jobs').select(`
      organization_id,
      brands ( language ),
      products ( title, description )
    `).eq('id', jobId).single();

    const product = (videoJob as any)?.products;
    const language = (videoJob as any)?.brands?.language ?? 'es';
    const orgId = (videoJob as any)?.organization_id as string | undefined;

    if (!product?.title) {
      logger.warn({ jobId, productId }, 'competitor.no_product_title.skip');
      await queues.scriptGeneration.add('generate', { jobId });
      return { skipped: true, reason: 'no_product_title' };
    }

    // 1) Discover competitor TikToks for the niche.
    const searchTerms = buildSearchTerms(product.title);
    const raw = await scrapeCompetitorVideos({ searchTerms, limit: MAX_VIDEOS });
    logger.info({ jobId, found: raw.length }, 'competitor.scraped');

    if (raw.length === 0) {
      await queues.scriptGeneration.add('generate', { jobId });
      return { researched: 0, reason: 'no_videos' };
    }

    // 2) Classify the niche with the trend-analyzer LLM. The candidate videos
    //    carry placeholder classification fields; the LLM refines them below.
    const candidateVideos = raw.map((v) => ({
      tiktokUrl: v.tiktokUrl,
      hookText: firstSentence(v.caption),
      hookType: 'curiosity_gap' as const,
      transcript: v.caption,
      durationSeconds: v.durationSeconds,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      frameworkDetected: 'OTHER' as const,
      viralityScore: engagementScore(v),
    }));

    const analysisByUrl = new Map<
      string,
      { hookType: string; framework: string; viralityScore: number; hookText: string }
    >();
    let analysisCost = 0;
    try {
      const analysis = await analyzeTrends({
        productSummary: `${product.title}. ${product.description ?? ''}`.slice(0, 1000),
        competitorVideos: candidateVideos,
        timeframe: '30d',
        region: 'US',
        language,
      });
      analysisCost = analysis.costCents;
      for (const a of analysis.data.videoAnalyses) {
        analysisByUrl.set(a.tiktokUrl, {
          hookType: a.hookType,
          framework: a.framework,
          viralityScore: a.viralityScore,
          hookText: a.hookText,
        });
      }
    } catch (err) {
      logger.error({ err, jobId }, 'competitor.trend_analysis_failed.continuing');
    }

    // 3a) Embed each video (sequential; small N) for the learning loop.
    const embeddingByUrl = new Map<string, string>();
    let embedCost = 0;
    for (const v of raw) {
      try {
        const a = analysisByUrl.get(v.tiktokUrl);
        const e = await embedText(`${a?.hookText ?? firstSentence(v.caption)}\n${v.caption}`);
        embeddingByUrl.set(v.tiktokUrl, JSON.stringify(e.vector));
        embedCost += e.costCents;
      } catch (err) {
        logger.warn({ err, url: v.tiktokUrl }, 'competitor.embed_failed');
      }
    }

    // 3b) Persist competitor_videos.
    const rows = raw.map((v) => {
      const a = analysisByUrl.get(v.tiktokUrl);
      return {
        product_id: productId,
        tiktok_url: v.tiktokUrl,
        thumbnail_url: v.thumbnailUrl,
        hook_text: a?.hookText ?? firstSentence(v.caption),
        transcript: v.caption,
        duration_seconds: v.durationSeconds,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        framework_detected: normalizeFramework(a?.framework),
        hook_type: normalizeHookType(a?.hookType),
        embedding: embeddingByUrl.get(v.tiktokUrl) ?? null,
      };
    });
    const { error: insErr } = await db.from('competitor_videos').insert(rows);
    if (insErr) {
      logger.error({ err: insErr, jobId }, 'competitor.insert_failed');
    }

    const totalCost = analysisCost + embedCost;
    if (orgId && totalCost > 0) {
      await recordUsage({
        organizationId: orgId,
        jobId,
        type: 'competitor_research',
        quantity: rows.length,
        costCents: totalCost,
      });
    }

    logger.info({ jobId, persisted: rows.length, costCents: totalCost }, 'competitor.research.done');

    await queues.scriptGeneration.add('generate', { jobId });
    return { researched: rows.length, costCents: totalCost };
  },
  { ...WORKER_DEFAULTS, concurrency: 2 },
);

// Research is best-effort: on failure, still advance to script generation so a
// transient scraper/LLM error never strands the job mid-pipeline.
competitorResearchWorker.on('failed', async (job, err) => {
  if (!job) return;
  logger.error({ jobId: job.data.jobId, err }, 'competitor.worker.failed');
  try {
    await queues.scriptGeneration.add('generate', { jobId: job.data.jobId });
  } catch (e) {
    logger.error({ e, jobId: job.data.jobId }, 'competitor.fallback_enqueue_failed');
  }
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a few niche search queries from the product title. */
function buildSearchTerms(title: string): string[] {
  const cleaned = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter((w) => w.length > 2);
  const head = words.slice(0, 4).join(' ');
  const pair = words.slice(0, 2).join(' ');
  return [head, `${head} tiktok`, `${pair} review`].filter((t) => t.trim().length > 0);
}

/** First sentence of a caption, stripped of hashtags/mentions. */
function firstSentence(text: string): string {
  const cleaned = text.replace(/#\w+/g, '').replace(/@\w+/g, '').trim();
  return (cleaned.split(/[.!?\n]/)[0] ?? cleaned).slice(0, 200);
}

/** Rough 0–10 virality proxy from like/view engagement rate. */
function engagementScore(v: { views: number; likes: number }): number {
  if (v.views <= 0) return 0;
  const rate = v.likes / v.views;
  return Math.max(0, Math.min(10, Math.round(rate * 100)));
}

const HOOK_TYPES = new Set([
  'pattern_interrupt', 'curiosity_gap', 'direct_callout', 'shocking_claim',
  'transformation_reveal', 'social_proof', 'question_hook', 'controversial_opinion',
]);
function normalizeHookType(v: string | undefined): string {
  return v && HOOK_TYPES.has(v) ? v : 'curiosity_gap';
}

const FRAMEWORKS = new Set(['AIDA', 'PAS', 'BAB', 'HSO', 'OTHER']);
function normalizeFramework(v: string | undefined): string {
  if (!v) return 'OTHER';
  const up = v.toUpperCase();
  return FRAMEWORKS.has(up) ? up : 'OTHER';
}
