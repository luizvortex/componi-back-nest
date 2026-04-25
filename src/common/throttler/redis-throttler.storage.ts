import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * Redis-backed sliding-window storage for @nestjs/throttler 6.x.
 *
 * One atomic pipeline per request:
 *   1. INCR request counter  (first hit sets it to 1)
 *   2. PEXPIRE if counter === 1  (so TTL starts at the first hit of the window)
 *   3. If over limit:
 *        SET   block:<key> 1 PX blockDuration NX
 *        PTTL  block:<key>
 *
 * Works across replicas — no in-memory state.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:${throttlerName}:${key}:blocked`;

    const blockedFor = await this.redis.pttl(blockKey);
    if (blockedFor > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(blockedFor / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockedFor / 1000),
      };
    }

    const pipeline = this.redis.multi();
    pipeline.incr(counterKey);
    pipeline.pttl(counterKey);
    const results = await pipeline.exec();
    if (!results) {
      // Redis outage — fail open (let the request through rather than
      // 429-storming users on transient infra failure).
      return {
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
    const totalHits = Number(results[0][1]);
    let timeToExpireMs = Number(results[1][1]);

    if (totalHits === 1 || timeToExpireMs < 0) {
      timeToExpireMs = ttl;
      await this.redis.pexpire(counterKey, ttl);
    }

    if (totalHits > limit) {
      await this.redis.set(blockKey, 1, 'PX', blockDuration, 'NX');
      const blockTtl = await this.redis.pttl(blockKey);
      return {
        totalHits,
        timeToExpire: Math.ceil(timeToExpireMs / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil((blockTtl > 0 ? blockTtl : blockDuration) / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpireMs / 1000),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
