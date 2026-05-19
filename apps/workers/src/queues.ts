import { Queue, QueueEvents, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES, logger } from '@viralytic/shared';

// Single Redis connection, reused by all queues + workers
export const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('error', err => logger.error({ err }, 'redis.error'));

// ===========================================================
// Queue definitions — one queue per pipeline step
// ===========================================================

export const queues = {
  trendingDiscovery:  new Queue(QUEUE_NAMES.trendingDiscovery,  { connection }),
  productAnalysis:    new Queue(QUEUE_NAMES.productAnalysis,    { connection }),
  competitorResearch: new Queue(QUEUE_NAMES.competitorResearch, { connection }),
  scriptGeneration:   new Queue(QUEUE_NAMES.scriptGeneration,   { connection }),
  voiceSynthesis:     new Queue(QUEUE_NAMES.voiceSynthesis,     { connection }),
  visualGeneration:   new Queue(QUEUE_NAMES.visualGeneration,   { connection }),
  videoAssembly:      new Queue(QUEUE_NAMES.videoAssembly,      { connection }),
  publishing:         new Queue(QUEUE_NAMES.publishing,         { connection }),
  metricsCollection:  new Queue(QUEUE_NAMES.metricsCollection,  { connection }),
} as const;

export type QueueName = keyof typeof queues;

// ===========================================================
// Job payload typings (workers cast .data with these)
// ===========================================================

export interface JobPayload {
  trendingDiscovery:  { region: string; language: string; category?: string; timeframe?: '7d' | '30d' };
  productAnalysis:    { jobId: string; productId: string };
  competitorResearch: { jobId: string; productId: string };
  scriptGeneration:   { jobId: string };
  voiceSynthesis:     { jobId: string; scriptId: string };
  visualGeneration:   { jobId: string };
  videoAssembly:      { jobId: string };
  publishing:         { jobId: string; tiktokAccountId: string };
  metricsCollection:  { publicationId: string };
}

// ===========================================================
// Shared defaults for all workers
// ===========================================================

export const WORKER_DEFAULTS = {
  connection,
  concurrency: 4,
  removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
  removeOnFail:     { count: 5000, age: 7 * 24 * 60 * 60 },
} as const;

export { Worker, Job, QueueEvents };
