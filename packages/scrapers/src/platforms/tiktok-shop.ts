import { ProductSchema, ScraperError, logger } from '@viralytic/shared';
import type { z } from 'zod';

type Product = z.infer<typeof ProductSchema>;

/**
 * Scrape a TikTok Shop product page.
 * URLs look like: https://www.tiktok.com/shop/p/<slug>/<id>
 */
export async function scrapeTikTokShop(url: string, organizationId: string): Promise<Omit<Product, 'id'>> {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) throw new ScraperError('NO_APIFY', 'APIFY_TOKEN required for TikTok Shop');

  const actorId = 'clockworks~tiktok-shop-scraper'; // example actor id, replace as needed
  const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUrls: [{ url }], maxItems: 1 }),
  });
  if (!res.ok) throw new ScraperError('TIKTOK_SHOP', `Apify failed: ${res.status}`);

  const items = await res.json() as Array<any>;
  const item = items[0];
  if (!item) throw new ScraperError('TIKTOK_SHOP_EMPTY', 'No product data returned', { url });

  return ProductSchema.omit({ id: true }).parse({
    organizationId,
    sourceUrl: url,
    sourcePlatform: 'tiktok_shop',
    title: item.title,
    price: item.price ?? null,
    currency: item.currency ?? 'USD',
    description: item.description ?? null,
    features: item.features ?? [],
    painPoints: [],
    positiveReviews: (item.reviews ?? []).filter((r: any) => r.rating >= 4).map((r: any) => r.text),
    images: item.images ?? [],
  });
}
