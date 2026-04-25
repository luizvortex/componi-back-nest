import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { NotificationType } from '../../database/entities/notification.entity';
import { RealtimeGateway } from './realtime.gateway';

/**
 * The public surface other services use to push realtime events.
 * Decoupled from the gateway so we can stub it cleanly in unit tests
 * and so business code doesn't import Socket.IO types.
 *
 * All emit operations are best-effort: a missing/disconnected target
 * is silently dropped (the event also lands in the DB via the
 * notifications row, so refreshing the page recovers state).
 */
@Injectable()
export class RealtimeService {
  private readonly enabled: boolean;

  constructor(
    private readonly gateway: RealtimeGateway,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('realtime.enabled', true);
  }

  /**
   * Push a notification to a specific user's room. Caller must already
   * have persisted the notification — this is the live nudge.
   */
  notifyUser(
    userId: string,
    type: NotificationType,
    actorId: string | null,
    payload: Record<string, unknown>,
  ): void {
    if (!this.enabled) return;
    this.gateway.server.to(this.gateway.userRoom(userId)).emit('notification', {
      type,
      actorId,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  componentLiked(
    componentId: string,
    actorId: string,
    likesCount: number,
  ): void {
    if (!this.enabled) return;
    this.gateway.server
      .to(this.gateway.componentRoom(componentId))
      .emit('component:like', { componentId, actorId, likesCount });
  }

  componentUnliked(
    componentId: string,
    actorId: string,
    likesCount: number,
  ): void {
    if (!this.enabled) return;
    this.gateway.server
      .to(this.gateway.componentRoom(componentId))
      .emit('component:unlike', { componentId, actorId, likesCount });
  }

  componentCommented(
    componentId: string,
    commentId: string,
    actorId: string,
    commentsCount: number,
  ): void {
    if (!this.enabled) return;
    this.gateway.server
      .to(this.gateway.componentRoom(componentId))
      .emit('component:comment', {
        componentId,
        commentId,
        actorId,
        commentsCount,
      });
  }

  userFollowed(followeeId: string, followerId: string, followersCount: number): void {
    if (!this.enabled) return;
    this.gateway.server.to(this.gateway.userRoom(followeeId)).emit('user:follow', {
      followerId,
      followersCount,
    });
  }
}
