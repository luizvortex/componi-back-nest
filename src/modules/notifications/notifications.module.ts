import { BullModule } from '@nestjs/bullmq';
import { Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from '../../database/entities/notification.entity';
import { QUEUE_NOTIFICATIONS } from '../../common/queue/queue.constants';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

/**
 * Worker registration is a boot-time decision based on the env flag.
 * When disabled, NotificationsProcessor is not a provider — BullMQ never
 * wires a Worker for the queue — and NotificationsService falls back to
 * inline delivery. See `redis.queue.workersEnabled`.
 */
const workersEnabled = process.env.QUEUE_WORKERS_ENABLED !== 'false';
const workerProviders: Provider[] = workersEnabled ? [NotificationsProcessor] : [];

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ...workerProviders],
  exports: [NotificationsService],
})
export class NotificationsModule {}
