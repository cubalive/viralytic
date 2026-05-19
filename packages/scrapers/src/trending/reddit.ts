import { z } from 'zod';
import { TrendingProductSchema } from '@viralytic/shared';

type Trending = z.infer<typeof TrendingProductSchema>;

const SUBREDDITS_EN = ['ShutUpAndTakeMyMoney', 'BuyItForLife', 'IWantToBuyThis', 'tiktok'];
const SUBREDDITS_ES = ['chollometro', 'AmazonOfertas'];

export async function discoverFromReddit(opts: { language: string }): Promise<Trending[]> {
  const subs = opts.language === 'es' ? SUBREDDITS_ES : SUBREDDITS_EN;
  const products: Trending[] = [];

  for (const sub of subs) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/top.json?t=week&limit=25`, {
        headers: { 'User-Agent': 'UCM-Viralytic/1.0' },
      });
      if (!res.ok) continue;
      const data = await res.json() as { data: { children: Array<{ data: any }> } };
      for (const post of data.data.children) {
        const p = post.data;
        if (p.score < 100) continue;
        products.push({
          source: 'reddit',
          title: p.title.slice(0, 120),
          category: sub,
          thumbnailUrl: p.thumbnail?.startsWith('http') ? p.thumbnail : null,
          productUrl: p.url,
          estimatedPrice: null,
          viralityScore: Math.min(100, Math.log10(p.score + 1) * 25),
          growthRate7d: 0,
          competitionLevel: 'medium' as const,
          marginEstimate: null,
          topVideoUrls: [],
          discoveredAt: new Date().toISOString(),
        });
      }
    } catch { /* swallow per-sub errors */ }
  }
  return products;
}
