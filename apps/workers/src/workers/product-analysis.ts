import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { scrapeByUrl } from '@viralytic/scrapers';
import { analyzeProduct } from '@viralytic/ai';
import { getServiceClient } from '@viralytic/db';
import { advanceJob, setStatus, recordUsage } from '../lib/orchestrator';
import { logger, QUEUE_NAMES } from '@viralytic/shared';

/**
 * Scrape product details (if needed) + run product-analyzer LLM to extract
 * pain points, USPs, buyer personas, emotional outcomes.
 */
export const productAnalysisWorker = new Worker<JobPayload['productAnalysis']>(
  QUEUE_NAMES.productAnalysis,
  async (job: Job<JobPayload['productAnalysis']>) => {
    const { jobId, productId } = job.data;
    const db = getServiceClient();

    const { data: product } = await db.from('products').select('*').eq('id', productId).single();
    if (!product) throw new Error('Product not found');

    // Scrape if not already scraped
    let prod = product;
    if (!prod.title || !prod.scraped_at) {
      const scraped = await scrapeByUrl(prod.source_url, prod.organization_id);
      await db.from('products').update({
        title: scraped.title,
        price: scraped.price,
        currency: scraped.currency,
        description: scraped.description,
        features: scraped.features,
        positive_reviews: scraped.positiveReviews,
        images: scraped.images,
        scraped_at: new Date().toISOString(),
      }).eq('id', productId);
      prod = { ...prod, ...scraped } as any;
    }

    // Run product analyzer LLM
    const analysis = await analyzeProduct({
      title: prod.title ?? '',
      price: prod.price,
      description: prod.description ?? '',
      features: (prod.features ?? []) as string[],
      reviews: (prod.positive_reviews ?? []) as string[],
    });

    await db.from('products').update({
      pain_points: analysis.data.painPoints,
    }).eq('id', productId);

    await recordUsage({
      organizationId: prod.organization_id,
      jobId, type: 'product_analysis',
      quantity: 1, costCents: analysis.costCents,
    });

    await setStatus(jobId, 'scripting');
    await advanceJob(jobId);
  },
  WORKER_DEFAULTS,
);
