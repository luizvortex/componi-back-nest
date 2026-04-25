import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

import { REDIS_CLIENT } from './redis.constants';

const redisProvider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const logger = new Logger('Redis');
    const url = config.get<string>('redis.url') ?? 'redis://localhost:6379';
    const keyPrefix = config.get<string>('redis.keyPrefix') ?? 'componi:';
    const useTls = config.get<boolean>('redis.tls') ?? false;

    const options: RedisOptions = {
      keyPrefix,
      // Bounded retries for the cache/throttler client so a Redis outage
      // fails fast instead of hanging requests. BullMQ needs its own
      // connection with `maxRetriesPerRequest: null`, created in QueueModule.
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
      ...(useTls ? { tls: {} } : {}),
    };

    const client = new Redis(url, options);
    client.on('error', (err) => logger.error(`redis error: ${err.message}`));
    client.on('connect', () =>
      logger.log(`connected (${url.replace(/:[^:@]*@/, ':***@')})`),
    );
    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'ready' || this.client.status === 'connecting') {
      await this.client.quit().catch(() => this.client.disconnect());
    }
  }
}
