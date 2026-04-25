import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * Thin wrapper over ioredis for JSON read-through caching.
 *
 * Design notes:
 * - `wrap()` is the primary entry point — everything else is escape hatch.
 * - On Redis errors we fail open: log and fall back to the loader, so an
 *   outage degrades to "slower" instead of "down".
 * - Tag-based invalidation uses a set per tag pointing at member keys.
 *   We pay one extra SADD on write in exchange for O(1) invalidation
 *   of related entries (e.g. every cached view of component 123).
 */
/**
 * Hard ceiling on a single cached value. Feed/list payloads that blow
 * past this are almost always a sign of an unbounded query slipping in;
 * we refuse to cache and log loudly so it shows up in the dashboards.
 * 256 KB is ~200 components with their author joined, which is already
 * well over any page size the frontend requests.
 */
const MAX_PAYLOAD_BYTES = 256 * 1024;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTtl: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.defaultTtl = config.get<number>('redis.cache.defaultTtlSeconds', 60);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.k(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`get ${key} failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds = this.defaultTtl,
    tags: string[] = [],
  ): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      // Buffer.byteLength is UTF-8-aware, unlike payload.length.
      const bytes = Buffer.byteLength(payload, 'utf8');
      if (bytes > MAX_PAYLOAD_BYTES) {
        this.logger.warn(
          `set ${key} skipped: payload ${bytes}B exceeds ${MAX_PAYLOAD_BYTES}B cap`,
        );
        return;
      }
      const pipeline = this.redis.multi();
      pipeline.set(this.k(key), payload, 'EX', ttlSeconds);
      for (const tag of tags) {
        pipeline.sadd(this.tagKey(tag), this.k(key));
        pipeline.expire(this.tagKey(tag), ttlSeconds * 2);
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`set ${key} failed: ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.redis.del(...keys.map((k) => this.k(k)));
    } catch (err) {
      this.logger.warn(`del failed: ${(err as Error).message}`);
    }
  }

  /**
   * Invalidate every key that was tagged with any of the given tags.
   */
  async invalidateTags(...tags: string[]): Promise<void> {
    if (!tags.length) return;
    try {
      for (const tag of tags) {
        const members = await this.redis.smembers(this.tagKey(tag));
        if (members.length) {
          await this.redis.del(...members);
        }
        await this.redis.del(this.tagKey(tag));
      }
    } catch (err) {
      this.logger.warn(`invalidateTags failed: ${(err as Error).message}`);
    }
  }

  /**
   * Read-through cache. Loader is invoked on miss; result is stored.
   * Null/undefined loader results are NOT cached (avoids negative-cache
   * poisoning when a transient error returns falsy).
   */
  async wrap<T>(
    key: string,
    loader: () => Promise<T>,
    opts: { ttlSeconds?: number; tags?: string[] } = {},
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const fresh = await loader();
    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, opts.ttlSeconds ?? this.defaultTtl, opts.tags ?? []);
    }
    return fresh;
  }

  private k(key: string): string {
    return `cache:${key}`;
  }

  private tagKey(tag: string): string {
    return `cache:tag:${tag}`;
  }
}
