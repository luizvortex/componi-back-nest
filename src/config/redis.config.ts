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
  },
}));
