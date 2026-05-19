export { scrapeTikTokShop } from './platforms/tiktok-shop';
export { scrapeAmazon } from './platforms/amazon';
export { discoverTrendingProducts } from './trending/aggregator';

import { scrapeTikTokShop } from './platforms/tiktok-shop';
import { scrapeAmazon } from './platforms/amazon';
import { ScraperError } from '@viralytic/shared';

/** Auto-dispatch to the right scraper based on the URL */
export async function scrapeByUrl(url: string, organizationId: string) {
  const u = new URL(url);
  if (u.hostname.includes('tiktok.com') && u.pathname.includes('/shop')) {
    return scrapeTikTokShop(url, organizationId);
  }
  if (u.hostname.includes('amazon.')) {
    return scrapeAmazon(url, organizationId);
  }
  throw new ScraperError('UNSUPPORTED', `No scraper for ${u.hostname}`, { url });
}
