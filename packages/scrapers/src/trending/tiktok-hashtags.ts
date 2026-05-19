import { z } from 'zod';
import { TrendingProductSchema, logger } from '@viralytic/shared';

type Trending = z.infer<typeof TrendingProductSchema>;

const VIRAL_HASHTAGS = [
  'tiktokmademebuyit', 'amazonfinds', 'amazonmusthaves',
  'tiktokshopfinds', 'productosvirales', 'comprasonline',
  'cosasquedebescomprar', 'recomendaciones',
];

/**
 * Scrape top videos on viral commerce hashtags and extract products mentioned.
 * Uses Apify actor or third-party TikTok scraper.
 */
export async function discoverFromTikTokHashtags(opts: {
  region: string;
  language: string;
  timeframe: '7d' | '30d';
}): Promise<Trending[]> {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) return [];

  const hashtags = opts.language === 'es'
    ? VIRAL_HASHTAGS.filter(h => /productos|compras|cosas|recomendaciones/.test(h))
    : VIRAL_HASHTAGS.filter(h => /tiktok|amazon|finds|musthave/i.test(h));

  // Apify actor: clockworks/tiktok-scraper
  const actorId = 'clockworks~tiktok-scraper';
  const allItems: Trending[] = [];

  for (const hashtag of hashtags.slice(0, 4)) {
    try {
      const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hashtags: [hashtag],
          resultsPerPage: 30,
          shouldDownloadVideos: false,
        }),
      });
      if (!res.ok) continue;

      const items = await res.json() as Array<{
        text: string;
        playCount: number;
        diggCount: number;
        webVideoUrl: string;
        createTime: number;
      }>;

      // Filter videos by recency
      const cutoff = Date.now() / 1000 - (opts.timeframe === '7d' ? 7 : 30) * 86400;
      const recent = items.filter(v => v.createTime > cutoff);

      // Group video URLs by inferred product (NOTE: in prod, run an LLM on captions to extract product mentions)
      for (const video of recent) {
        const inferredTitle = inferProductFromCaption(video.text);
        if (!inferredTitle) continue;
        allItems.push({
          source: 'tiktok_hashtags',
          title: inferredTitle,
          category: hashtag,
          thumbnailUrl: null,
          productUrl: null,
          estimatedPrice: null,
          viralityScore: Math.min(100, Math.log10(video.playCount + 1) * 12),
          growthRate7d: 0,
          competitionLevel: 'medium' as const,
          marginEstimate: null,
          topVideoUrls: [video.webVideoUrl],
          discoveredAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error({ err, hashtag }, 'tiktok.hashtag.failed');
    }
  }
  return allItems;
}

/**
 * Naive caption parser. Replace with LLM extraction in production
 * (run cheap GPT-4o-mini to extract product name from captions).
 */
function inferProductFromCaption(text: string): string | null {
  const cleaned = text.replace(/#\w+/g, '').replace(/@\w+/g, '').trim();
  if (cleaned.length < 10) return null;
  return cleaned.split(/[.!?\n]/)[0]?.slice(0, 80) ?? null;
}
