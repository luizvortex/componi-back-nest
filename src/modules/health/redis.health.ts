import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    super();
  }

  async ping(key = 'redis'): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.client.ping();
      const healthy = pong === 'PONG';
      const result = this.getStatus(key, healthy, { status: this.client.status });
      if (!healthy) {
        throw new HealthCheckError('Redis ping failed', result);
      }
      return result;
    } catch (err) {
      throw new HealthCheckError(
        'Redis unreachable',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}
