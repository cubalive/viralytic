import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@viralytic/shared';

// HMR-safe singletons: Next dev reloads the module repeatedly; without
// reusing the same Redis connection and Queue we leak FDs and event
// listeners on every save.
const globalForQueue = globalThis as unknown as {
  __viralyticRedis?: IORedis;
  __viralyticProductAnalysisQueue?: Queue;
};

function getRedis(): IORedis {
  if (!globalForQueue.__viralyticRedis) {
    globalForQueue.__viralyticRedis = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return globalForQueue.__viralyticRedis;
}

function getProductAnalysisQueue(): Queue {
  if (!globalForQueue.__viralyticProductAnalysisQueue) {
    globalForQueue.__viralyticProductAnalysisQueue = new Queue(
      QUEUE_NAMES.productAnalysis,
      { connection: getRedis() },
    );
  }
  return globalForQueue.__viralyticProductAnalysisQueue;
}

export async function enqueueProductAnalysis(payload: {
  jobId: string;
  productId: string;
}): Promise<void> {
  await getProductAnalysisQueue().add('product-analysis', payload);
}
