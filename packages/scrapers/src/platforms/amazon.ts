import { ProductSchema, ScraperError } from '@viralytic/shared';
import type { z } from 'zod';
type Product = z.infer<typeof ProductSchema>;

export async function scrapeAmazon(url: string, organizationId: string): Promise<Omit<Product, 'id'>> {
  const scrapingBee = process.env.SCRAPINGBEE_API_KEY;
  if (!scrapingBee) throw new ScraperError('NO_SCRAPINGBEE', 'SCRAPINGBEE_API_KEY required');

  const extract = {
    title: '#productTitle',
    price: '.a-price .a-offscreen',
    bullets: { selector: '#feature-bullets li span', type: 'list' },
    description: '#productDescription p',
    images: { selector: '#imgTagWrapperId img@src, #altImages img@src', type: 'list' },
    reviews: { selector: '[data-hook=review-body] span', type: 'list' },
  };
  const apiUrl = `https://app.scrapingbee.com/api/v1?api_key=${scrapingBee}&url=${encodeURIComponent(url)}&render_js=true&extract_rules=${encodeURIComponent(JSON.stringify(extract))}`;

  const res = await fetch(apiUrl);
  if (!res.ok) throw new ScraperError('AMAZON', `ScrapingBee failed: ${res.status}`);
  const d = await res.json() as any;

  return ProductSchema.omit({ id: true }).parse({
    organizationId,
    sourceUrl: url,
    sourcePlatform: 'amazon',
    title: d.title?.trim(),
    price: parseFloat(d.price?.replace(/[^0-9.]/g, '') ?? '0') || null,
    currency: 'USD',
    description: d.description?.trim() ?? null,
    features: (d.bullets ?? []).filter((b: string) => b.trim().length > 0).slice(0, 10),
    painPoints: [],
    positiveReviews: (d.reviews ?? []).slice(0, 20),
    images: (d.images ?? []).filter((i: string) => i?.startsWith('http')).slice(0, 6),
  });
}
