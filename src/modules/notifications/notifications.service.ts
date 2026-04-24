import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { IsNull, Repository } from 'typeorm';

import {
  Notification,
  NotificationType,
} from '../../database/entities/notification.entity';
import { QUEUE_NOTIFICATIONS } from '../../common/queue/queue.constants';

export interface NotificationJob {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /**
   * Idempotency key — if present, `deliver` skips the insert when a
   * notification with this dedupe key already exists for the recipient
   * in the last 60 s. Prevents "Ana liked · Ana unliked · Ana liked
   * again" from spamming the target's inbox.
   */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly workersEnabled: boolean;

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue<NotificationJob>,
    config: ConfigService,
  ) {
    this.workersEnabled = config.get<boolean>('redis.queue.workersEnabled', true);
  }

  list(userId: string, unreadOnly = false): Promise<Notification[]> {
    return this.notifications.find({
      where: { userId, ...(unreadOnly ? { readAt: IsNull() } : {}) },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.notifications.update({ id, userId }, { readAt: new Date() });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications.update({ userId, readAt: IsNull() }, { readAt: new Date() });
  }

  /**
   * Enqueue a notification. Self-notifications are dropped.
   *
   * - When workers are enabled the job goes through BullMQ (retries,
   *   exponential backoff, dedupe at the queue level via jobId).
   * - When workers are disabled (free-tier Redis, single-dyno hobby
   *   deploys) the delivery runs inline so notifications aren't lost
   *   to a queue no one is reading. The handler is a cheap DB insert,
   *   so the ~20 ms latency cost is acceptable on the request path.
   */
  async enqueue(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown> = {},
    actorId?: string,
    dedupeKey?: string,
  ): Promise<void> {
    if (actorId && actorId === userId) return;
    const job: NotificationJob = {
      userId,
      type,
      actorId: actorId ?? null,
      payload,
      dedupeKey,
    };

    if (!this.workersEnabled) {
      try {
        await this.deliver(job);
      } catch (err) {
        this.logger.warn(
          `inline delivery failed for ${type} to ${userId}: ${(err as Error).message}`,
        );
      }
      return;
    }

    await this.queue.add(type, job, {
      jobId: dedupeKey ? `${type}:${userId}:${dedupeKey}` : undefined,
    });
  }

  /**
   * Actual delivery. Shared between the BullMQ processor (hot path when
   * workers are on) and the inline fallback. Idempotent via dedupeKey.
   */
  async deliver(job: NotificationJob): Promise<void> {
    const { userId, type, actorId, payload, dedupeKey } = job;

    if (dedupeKey) {
      const recent = await this.notifications
        .createQueryBuilder('n')
        .where('n."userId" = :userId', { userId })
        .andWhere(`n.payload->>'dedupeKey' = :dedupeKey`, { dedupeKey })
        .andWhere(`n."createdAt" > NOW() - INTERVAL '60 seconds'`)
        .getOne();
      if (recent) return;
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
