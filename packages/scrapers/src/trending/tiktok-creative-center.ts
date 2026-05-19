import { z } from 'zod';
import { TrendingProductSchema, ScraperError, logger } from '@viralytic/shared';

type Trending = z.infer<typeof TrendingProductSchema>;

/**
 * Scrape TikTok Creative Center (ads.tiktok.com/business/creativecenter)
 * for top products by category. Uses Apify actor or direct scraping.
 *
 * IMPORTANT: TikTok rate-limits aggressively. Use Apify or ScrapingBee for prod.
 */
export async function discoverFromTikTokCreativeCenter(opts: {
  region: string;
  category?: string;
  timeframe: '7d' | '30d';
}): Promise<Trending[]> {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    logger.warn('No APIFY_TOKEN, skipping TikTok Creative Center');
    return [];
  }

  // Apify actor: clockworks/tiktok-creative-center-scraper (community actor)
  // Replace with your preferred provider
  const actorId = 'clockworks~tiktok-creative-center-scraper';
  const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      region: opts.region,
      category: opts.category,
      period: opts.timeframe === '7d' ? 7 : 30,
      limit: 50,
    }),
  });

  if (!res.ok) throw new ScraperError('TIKTOK_CC_FAIL', `Apify returned ${res.status}`);
  const items = await res.json() as Array<{
    productName: string;
    category: string;
    thumbnailUrl?: string;
    productUrl?: string;
    estimatedPrice?: number;
    salesVolume?: number;
    growthRate?: number;
    topAdUrls?: string[];
  }>;

  return items.map(item => ({
    source: 'tiktok_creative_center' as const,
    title: item.productName,
    category: item.category,
    thumbnailUrl: item.thumbnailUrl ?? null,
    productUrl: item.productUrl ?? null,
    estimatedPrice: item.estimatedPrice ?? null,
    viralityScore: Math.min(100, (item.growthRate ?? 0) * 10 + Math.log10((item.salesVolume ?? 0) + 1) * 15),
    growthRate7d: item.growthRate ?? 0,
    competitionLevel: (item.salesVolume ?? 0) > 10000 ? 'high' as const
                    : (item.salesVolume ?? 0) > 1000 ? 'medium' as const : 'low' as const,
    marginEstimate: null,
    topVideoUrls: item.topAdUrls ?? [],
    discoveredAt: new Date().toISOString(),
  }));
}
