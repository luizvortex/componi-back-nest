import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NOTIFICATIONS } from '../../common/queue/queue.constants';
import { NotificationJob, NotificationsService } from './notifications.service';

/**
 * BullMQ consumer for QUEUE_NOTIFICATIONS. Delivery logic lives in
 * NotificationsService.deliver so the inline fallback (workers-off) and
 * the queued path run exactly the same code. This class is only
 * registered when `redis.queue.workersEnabled` is true — see
 * NotificationsModule for the conditional.
 */
@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    try {
      await this.notifications.deliver(job.data);
    } catch (err) {
      this.logger.error(
        `delivery failed for ${job.data.type} → ${job.data.userId}: ${(err as Error).message}`,
      );
      throw err; // let BullMQ retry per defaultJobOptions.attempts
    }
  }
}
