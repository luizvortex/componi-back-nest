import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import {
  QUEUE_EMBEDDINGS,
  QUEUE_NOTIFICATIONS,
  QUEUE_THUMBNAILS,
} from './queue.constants';

/**
 * Registers a BullMQ connection + the queues we publish to from any module.
 * Workers (processors) are registered alongside their domain module (e.g.
 * NotificationsProcessor lives in NotificationsModule) so business logic
 * stays close to the queue name.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Dedicated connection — BullMQ requires maxRetriesPerRequest: null.
        // Can't share the throttler/cache client which has bounded retries.
        connection: {
          // `Connection` option accepts a string URL via `url`-like pattern —
          // ioredis interprets the first positional arg as URL if given.
          // Passing options here keeps BullMQ's defaults intact.
          host: new URL(config.get<string>('redis.url') ?? 'redis://localhost:6379').hostname,
          port: Number(
            new URL(config.get<string>('redis.url') ?? 'redis://localhost:6379').port || 6379,
          ),
          password:
            new URL(config.get<string>('redis.url') ?? 'redis://localhost:6379').password ||
            undefined,
          username:
            new URL(config.get<string>('redis.url') ?? 'redis://localhost:6379').username ||
            undefined,
          tls: config.get<boolean>('redis.tls') ? {} : undefined,
          maxRetriesPerRequest: null,
        },
        prefix: `${config.get<string>('redis.keyPrefix') ?? 'componi:'}bull`,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: {
            count: config.get<number>('redis.queue.removeOnCompleteCount', 500),
          },
          removeOnFail: {
            count: config.get<number>('redis.queue.removeOnFailCount', 5000),
          },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NOTIFICATIONS },
      { name: QUEUE_THUMBNAILS },
      { name: QUEUE_EMBEDDINGS },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
