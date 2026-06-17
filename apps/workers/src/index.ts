import 'dotenv/config';
import { logger, QUEUE_NAMES } from '@viralytic/shared';
import { queues } from './queues';
import { startHttpServer } from './http';

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
import './workers/mv-notify';
// NOTE: mv-publish (BullMQ) is intentionally NOT registered. The single source of
// truth for YouTube publishing is the Vercel cron apps/web/app/api/cron/publish.
// This app (apps/workers) is not deployed (no Redis host); registering mv-publish
// here too would double-publish mv_video_languages. See route.ts for the live path.
// import './workers/mv-publish';

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

  // mv-notify: every 5 minutes, emails when a Zuri video finishes rendering.
  await queues.mvNotify.add(
    'cron-mv-notify',
    {},
    { repeat: { pattern: '*/5 * * * *' }, jobId: 'cron-mv-notify' },
  );

  // mv-publish: DISABLED here — YouTube publishing is owned by the Vercel cron
  // (apps/web/app/api/cron/publish). Re-enabling this alongside the cron would
  // double-publish. If you ever move publishing back to BullMQ, remove it there.

  // Metrics collection: every 6 hours, picks up active publications
  // (the worker itself fans out per publication)
  logger.info('cron.scheduled');
}

scheduleCrons().catch(err => logger.error({ err }, 'cron.schedule.failed'));

const httpServer = startHttpServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing HTTP server + queues');
  if (httpServer) {
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
  }
  await Promise.all(Object.values(queues).map(q => q.close()));
  process.exit(0);
});

logger.info({ queues: Object.keys(QUEUE_NAMES) }, 'workers.started');
