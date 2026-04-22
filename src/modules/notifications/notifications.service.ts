import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { IsNull, Repository } from 'typeorm';

import {
  Notification,
  NotificationType,
} from '../../database/entities/notification.entity';
import { QUEUE_NOTIFICATIONS } from '../../common/queue/queue.constants';
import type { NotificationJob } from './notifications.processor';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue<NotificationJob>,
  ) {}

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
   * Enqueue a notification. The HTTP request returns immediately; a
   * worker persists and (future) fans out to websocket/email. Callers
   * pass `actorId` = who caused it, `userId` = who receives it.
   *
   * Self-notifications are dropped (no "you liked your own component").
   */
  async enqueue(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown> = {},
    actorId?: string,
    dedupeKey?: string,
  ): Promise<void> {
    if (actorId && actorId === userId) return;
    await this.queue.add(
      type,
      { userId, type, actorId: actorId ?? null, payload, dedupeKey },
      { jobId: dedupeKey ? `${type}:${userId}:${dedupeKey}` : undefined },
    );
  }
}
