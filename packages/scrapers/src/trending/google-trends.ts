import { z } from 'zod';
import { TrendingProductSchema, logger } from '@viralytic/shared';

type Trending = z.infer<typeof TrendingProductSchema>;

/**
 * Use Google Trends "Daily Search Trends" RSS feed (no API key required).
 * Filters for purchase-intent queries.
 */
export async function discoverFromGoogleTrends(opts: {
  region: string;
  timeframe: '7d' | '30d';
}): Promise<Trending[]> {
  const url = `https://trends.google.com/trends/api/dailytrends?hl=en&geo=${opts.region}&ns=15`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    logger.warn({ status: res.status }, 'google_trends.fetch.failed');
    return [];
  }

  // Google prefixes JSON with )]}', strip it
  const text = await res.text();
  const json = JSON.parse(text.replace(/^\)\]\}',?\s*/, ''));
  const trendingDays: any[] = json?.default?.trendingSearchesDays ?? [];

  const products: Trending[] = [];
  for (const day of trendingDays.slice(0, opts.timeframe === '7d' ? 7 : 30)) {
    for (const item of day.trendingSearches ?? []) {
      const title: string = item.title?.query ?? '';
      // Heuristic: filter purchase-intent terms
      if (!/buy|comprar|review|reseña|deal|oferta|amazon|shop/i.test(title) && !item.shareUrl) continue;
      products.push({
        source: 'google_trends',
        title,
        category: 'general',
        thumbnailUrl: item.image?.imageUrl ?? null,
        productUrl: null,
        estimatedPrice: null,
        viralityScore: Math.min(100, parseInt(item.formattedTraffic?.replace(/[^0-9]/g, '') ?? '0', 10) / 1000),
        growthRate7d: 0,
        competitionLevel: 'medium' as const,
        marginEstimate: null,
        topVideoUrls: [],
        discoveredAt: new Date().toISOString(),
      });
    }
  }
  return products;
}
