import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';

import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { QUEUE_NOTIFICATIONS } from '../../common/queue/queue.constants';

export interface NotificationJob {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /**
   * Idempotency key — if present, the worker skips the insert when a
   * notification with this dedupe key already exists for the recipient
   * in the last 60s. Prevents "Ana liked · Ana unliked · Ana liked again"
   * from spamming the feed.
   */
  dedupeKey?: string;
}

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const { userId, type, actorId, payload, dedupeKey } = job.data;

    if (dedupeKey) {
      const recent = await this.notifications
        .createQueryBuilder('n')
        .where('n."userId" = :userId', { userId })
        .andWhere(`n.payload->>'dedupeKey' = :dedupeKey`, { dedupeKey })
        .andWhere(`n."createdAt" > NOW() - INTERVAL '60 seconds'`)
        .getOne();
      if (recent) {
        this.logger.debug(`skipped duplicate ${type} for ${userId}`);
        return;
      }
    }

    await this.notifications.save(
      this.notifications.create({
        userId,
        type,
        actorId: actorId ?? null,
        payload: { ...(payload ?? {}), ...(dedupeKey ? { dedupeKey } : {}) },
      }),
    );
  }
}
