import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { discoverTrendingProducts } from '@viralytic/scrapers';
import { getServiceClient } from '@viralytic/db';
import { logger, QUEUE_NAMES } from '@viralytic/shared';

/**
 * Cron-driven worker that discovers trending products and writes them
 * to the products table (one row per org, deduped by sourceUrl).
 *
 * Scheduled via the cron in apps/workers/src/index.ts (every 12h).
 */
export const trendingDiscoveryWorker = new Worker<JobPayload['trendingDiscovery']>(
  QUEUE_NAMES.trendingDiscovery,
  async (job: Job<JobPayload['trendingDiscovery']>) => {
    const { region, language, category, timeframe = '7d' } = job.data;
    logger.info({ region, language, category, timeframe }, 'trending.worker.start');

    const trending = await discoverTrendingProducts({
      region,
      language,
      category,
      timeframe,
      sources: ['tiktok_cc', 'tiktok_hashtags', 'google_trends', 'reddit', 'amazon'],
      limit: 50,
    });

    const db = getServiceClient();

    // Write to a global "trending_products" cache table (organization_id = null = global)
    // Each org sees the same trending feed unless they request a filtered category.
    const rows = trending.map(p => ({
      title: p.title,
      category: p.category,
      source: p.source,
      thumbnail_url: p.thumbnailUrl,
      product_url: p.productUrl,
      estimated_price: p.estimatedPrice,
      virality_score: p.viralityScore,
      growth_rate_7d: p.growthRate7d,
      competition_level: p.competitionLevel,
      top_video_urls: p.topVideoUrls,
      region,
      language,
      discovered_at: new Date().toISOString(),
    }));

    const { error } = await db.from('trending_products').upsert(rows, {
      onConflict: 'title,region',
      ignoreDuplicates: false,
    });

    if (error) {
      logger.error({ error }, 'trending.upsert.failed');
      throw error;
    }

    logger.info({ count: rows.length }, 'trending.worker.done');
    return { count: rows.length };
  },
  { ...WORKER_DEFAULTS, concurrency: 1 }, // only 1 at a time, this is cron
);
