import { logger } from '@viralytic/shared';

export interface RawCompetitorVideo {
  tiktokUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  durationSeconds: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  createTime: number;
}

/**
 * Discover top-performing competitor TikToks for a product niche via the
 * Apify `clockworks~tiktok-scraper` actor (the same actor used by trending
 * discovery). Sorted by view count, highest first.
 *
 * Returns `[]` (never throws) when APIFY_TOKEN is missing or the actor fails,
 * so the competitor-research worker can degrade gracefully — the pipeline must
 * never block on competitor data.
 */
export async function scrapeCompetitorVideos(opts: {
  searchTerms: string[];
  limit?: number;
}): Promise<RawCompetitorVideo[]> {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    logger.warn('scrapeCompetitorVideos: APIFY_TOKEN not set, returning []');
    return [];
  }

  const limit = opts.limit ?? 12;
  const actorId = 'clockworks~tiktok-scraper';

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: opts.searchTerms.slice(0, 3),
          resultsPerPage: limit,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
        }),
      },
    );
    if (!res.ok) {
      logger.error({ status: res.status }, 'scrapeCompetitorVideos.apify_failed');
      return [];
    }

    const items = (await res.json()) as Array<{
      webVideoUrl?: string;
      text?: string;
      videoMeta?: { duration?: number; coverUrl?: string };
      playCount?: number;
      diggCount?: number;
      commentCount?: number;
      shareCount?: number;
      createTime?: number;
    }>;

    return items
      .filter((v) => typeof v.webVideoUrl === 'string')
      .map((v) => ({
        tiktokUrl: v.webVideoUrl as string,
        thumbnailUrl: v.videoMeta?.coverUrl ?? null,
        caption: v.text ?? '',
        durationSeconds: Math.round(v.videoMeta?.duration ?? 0),
        views: v.playCount ?? 0,
        likes: v.diggCount ?? 0,
        comments: v.commentCount ?? 0,
        shares: v.shareCount ?? 0,
        createTime: v.createTime ?? 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  } catch (err) {
    logger.error({ err }, 'scrapeCompetitorVideos.error');
    return [];
  }
}
