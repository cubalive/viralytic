import 'dotenv/config';
import { logger, QUEUE_NAMES } from '@viralytic/shared';
import { queues } from './queues';

// Import all workers (they auto-register on import)
import './workers/trending-discovery';
import './workers/product-analysis';
import './workers/competitor-research';
import './workers/script-generation';
import './workers/voice-synthesis';
import './workers/visual-generation';
import './workers/video-assembly';
import './workers/publishing';
import './workers/metrics-collection';

// ===========================================================
// Cron schedules
// ===========================================================

async function scheduleCrons() {
  // Trending discovery: every 12 hours, for multiple regions
  await queues.trendingDiscovery.add(
    'cron-us-es',
    { region: 'US', language: 'es', timeframe: '7d' },
    { repeat: { pattern: '0 */12 * * *' }, jobId: 'cron-trending-us-es' },
  );
  await queues.trendingDiscovery.add(
    'cron-us-en',
    { region: 'US', language: 'en', timeframe: '7d' },
    { repeat: { pattern: '0 */12 * * *' }, jobId: 'cron-trending-us-en' },
  );

  // Metrics collection: every 6 hours, picks up active publications
  // (the worker itself fans out per publication)
  logger.info('cron.scheduled');
}

scheduleCrons().catch(err => logger.error({ err }, 'cron.schedule.failed'));

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing queues');
  await Promise.all(Object.values(queues).map(q => q.close()));
  process.exit(0);
});

logger.info({ queues: Object.keys(QUEUE_NAMES) }, 'workers.started');
