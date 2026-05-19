import { z } from 'zod';
import { TrendingProductSchema, TRENDING_DISCOVERY, logger } from '@viralytic/shared';
import { discoverFromTikTokCreativeCenter } from './tiktok-creative-center';
import { discoverFromTikTokHashtags } from './tiktok-hashtags';
import { discoverFromGoogleTrends } from './google-trends';
import { discoverFromReddit } from './reddit';
import { discoverFromAmazonMovers } from './amazon-movers';

type Trending = z.infer<typeof TrendingProductSchema>;

export interface DiscoveryOptions {
  category?: string;
  region?: string;            // 'US', 'ES', 'MX', etc
  language?: string;
  timeframe?: '7d' | '30d';
  sources?: Array<'tiktok_cc' | 'tiktok_hashtags' | 'google_trends' | 'reddit' | 'amazon'>;
  limit?: number;
}

/**
 * Aggregate trending products from multiple sources, dedupe, and rank by virality.
 * This is the entry point for the "discover trending" feature.
 */
export async function discoverTrendingProducts(opts: DiscoveryOptions = {}): Promise<Trending[]> {
  const {
    category,
    region = 'US',
    language = 'es',
    timeframe = TRENDING_DISCOVERY.defaultTimeframe,
    sources = ['tiktok_cc', 'tiktok_hashtags', 'google_trends', 'reddit', 'amazon'],
    limit = TRENDING_DISCOVERY.topResultsPerSource,
  } = opts;

  logger.info({ sources, region, category, timeframe }, 'trending.discover.start');

  const fetchers: Record<string, () => Promise<Trending[]>> = {
    tiktok_cc:      () => discoverFromTikTokCreativeCenter({ region, category, timeframe }).catch(handleErr('tiktok_cc')),
    tiktok_hashtags:() => discoverFromTikTokHashtags({ region, language, timeframe }).catch(handleErr('tiktok_hashtags')),
    google_trends:  () => discoverFromGoogleTrends({ region, timeframe }).catch(handleErr('google_trends')),
    reddit:         () => discoverFromReddit({ language }).catch(handleErr('reddit')),
    amazon:         () => discoverFromAmazonMovers({ region }).catch(handleErr('amazon')),
  };

  const results = await Promise.all(sources.map(s => fetchers[s]!()));
  const all = results.flat();

  // Dedupe by title similarity (simple): lowercase + remove non-alphanum
  const deduped = dedupeByTitle(all);

  // Rank by composite virality score
  const ranked = deduped
    .filter(p => p.viralityScore >= TRENDING_DISCOVERY.minViralityScore)
    .sort((a, b) => b.viralityScore - a.viralityScore)
    .slice(0, limit);

  logger.info({ count: ranked.length, sources: sources.length }, 'trending.discover.done');
  return ranked;
}

function handleErr(source: string) {
  return (err: Error): Trending[] => {
    logger.error({ err, source }, 'trending.source.failed');
    return [];
  };
}

function dedupeByTitle(products: Trending[]): Trending[] {
  const map = new Map<string, Trending>();
  for (const p of products) {
    const key = p.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 60);
    const existing = map.get(key);
    // Keep the higher virality score, merge top video URLs
    if (!existing || p.viralityScore > existing.viralityScore) {
      if (existing) {
        p.topVideoUrls = [...new Set([...p.topVideoUrls, ...existing.topVideoUrls])];
      }
      map.set(key, p);
    }
  }
  return [...map.values()];
}
