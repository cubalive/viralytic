import { z } from 'zod';
import { TrendingProductSchema, logger } from '@viralytic/shared';

type Trending = z.infer<typeof TrendingProductSchema>;

/**
 * Scrape Amazon "Movers & Shakers" pages. These show fastest-rising products.
 * https://www.amazon.com/gp/movers-and-shakers
 * Use ScrapingBee/Apify for rotating proxies in prod.
 */
export async function discoverFromAmazonMovers(opts: { region: string }): Promise<Trending[]> {
  const scrapingBee = process.env.SCRAPINGBEE_API_KEY;
  if (!scrapingBee) {
    logger.warn('No SCRAPINGBEE_API_KEY, skipping Amazon movers');
    return [];
  }
  const domain = opts.region === 'ES' ? 'amazon.es' : opts.region === 'MX' ? 'amazon.com.mx' : 'amazon.com';
  const url = `https://www.${domain}/gp/movers-and-shakers`;
  const apiUrl = `https://app.scrapingbee.com/api/v1?api_key=${scrapingBee}&url=${encodeURIComponent(url)}&render_js=false&extract_rules=${encodeURIComponent(JSON.stringify({
    items: { selector: '#zg_centerListWrapper li', type: 'list', output: { title: '.zg-text-center-align ~ div a', url: '.zg-text-center-align ~ div a@href', image: '.zg-image img@src', price: '.p13n-sc-price' } }
  }))}`;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return [];
    const data = await res.json() as { items: Array<{ title: string; url: string; image: string; price: string }> };
    return (data.items ?? []).slice(0, 30).map((it, idx) => ({
      source: 'amazon_movers' as const,
      title: it.title?.slice(0, 120) ?? '',
      category: 'amazon',
      thumbnailUrl: it.image ?? null,
      productUrl: it.url?.startsWith('http') ? it.url : `https://www.${domain}${it.url}`,
      estimatedPrice: parseFloat(it.price?.replace(/[^0-9.]/g, '') ?? '0') || null,
      viralityScore: 80 - idx,
      growthRate7d: 0,
      competitionLevel: 'high' as const,
      marginEstimate: 'medium' as const,
      topVideoUrls: [],
      discoveredAt: new Date().toISOString(),
    }));
  } catch (err) {
    logger.error({ err }, 'amazon.movers.failed');
    return [];
  }
}
