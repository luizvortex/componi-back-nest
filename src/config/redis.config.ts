import { registerAs } from '@nestjs/config';

/**
 * Single Redis instance backs rate limit, cache, and BullMQ queues.
 * Separate logical databases keep keyspaces isolated when you point
 * everything at one Redis (fine for up to a few hundred req/s).
 */
export default registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  tls: process.env.REDIS_TLS === 'true',
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'componi:',
  cache: {
    defaultTtlSeconds: parseInt(process.env.CACHE_DEFAULT_TTL ?? '60', 10),
    feedTtlSeconds: parseInt(process.env.CACHE_FEED_TTL ?? '30', 10),
  },
  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY ?? '8', 10),
    removeOnCompleteCount: parseInt(process.env.QUEUE_KEEP_COMPLETED ?? '500', 10),
    removeOnFailCount: parseInt(process.env.QUEUE_KEEP_FAILED ?? '5000', 10),
    /**
     * When false, worker processors are NOT registered with the Nest DI
     * container, so BullMQ never polls Redis for jobs. Enqueues still
     * write to the queue; a separate process with this flag on consumes
     * them. Services that care (e.g. notifications) fall back to inline
     * synchronous execution when the flag is off — see
     * NotificationsService.enqueue.
     *
     * Use case: free-tier Redis (Upstash's 10k cmd/day) evaporates fast
     * against a polling worker. Keep API nodes publish-only.
     */
    workersEnabled: process.env.QUEUE_WORKERS_ENABLED !== 'false',
  },
}));
