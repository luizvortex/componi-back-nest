import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import { Component } from '../../database/entities/component.entity';
import { ComponentVersion } from '../../database/entities/component-version.entity';
import { Comment } from '../../database/entities/comment.entity';
import { Like } from '../../database/entities/like.entity';
import { Favorite } from '../../database/entities/favorite.entity';
import { Follow } from '../../database/entities/follow.entity';
import { Block } from '../../database/entities/block.entity';
import { Mute } from '../../database/entities/mute.entity';
import { Notification } from '../../database/entities/notification.entity';
import { Collection } from '../../database/entities/collection.entity';
import { CollectionComponent } from '../../database/entities/collection-component.entity';
import { Share } from '../../database/entities/share.entity';
import { Report } from '../../database/entities/report.entity';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { CacheService } from '../../common/cache/cache.service';
import { SessionService } from '../../common/session/session.service';

/**
 * LGPD Art. 18 V (portability) + VI (erasure). Callers are authenticated
 * users operating on their own data — moderator takedowns go through
 * AdminContentService which is a separate audit path.
 *
 * Erasure is implemented as *irreversible anonymization* rather than hard
 * row deletion: the user row stays (so components/comments keep a stable
 * authorId FK), but every PII column is wiped. Private interactions
 * (likes, follows, notifications, collections, …) are purged entirely.
 * Public contributions (components, comments) remain because other users
 * may have forked/replied to them — removing them would destroy third-party
 * data, which LGPD explicitly carves out (Art. 16 III).
 */
@Injectable()
export class AccountPrivacyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Data-portability dump. Shape is stable so the user can feed it into
   * another service. Audit-logged so the export itself is accountable.
   */
  async exportData(ctx: AuditContext): Promise<Record<string, unknown>> {
    const userId = ctx.actorId;

    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');

    const [
      components,
      versions,
      comments,
      likes,
      favorites,
      following,
      followers,
      blocks,
      mutes,
      notifications,
      collections,
      collectionItems,
      shares,
      reportsFiled,
    ] = await Promise.all([
      this.dataSource.getRepository(Component).find({ where: { authorId: userId } }),
      this.dataSource
        .getRepository(ComponentVersion)
        .createQueryBuilder('v')
        .innerJoin(Component, 'c', 'c.id = v."componentId" AND c."authorId" = :uid', { uid: userId })
        .getMany(),
      this.dataSource.getRepository(Comment).find({ where: { authorId: userId } }),
      this.dataSource.getRepository(Like).find({ where: { userId } }),
      this.dataSource.getRepository(Favorite).find({ where: { userId } }),
      this.dataSource.getRepository(Follow).find({ where: { followerId: userId } }),
      this.dataSource.getRepository(Follow).find({ where: { followeeId: userId } }),
      this.dataSource.getRepository(Block).find({ where: { blockerId: userId } }),
      this.dataSource.getRepository(Mute).find({ where: { muterId: userId } }),
      this.dataSource.getRepository(Notification).find({ where: { userId } }),
      this.dataSource.getRepository(Collection).find({ where: { ownerId: userId } }),
      this.dataSource
        .getRepository(CollectionComponent)
        .createQueryBuilder('cc')
        .innerJoin(Collection, 'col', 'col.id = cc."collectionId" AND col."ownerId" = :uid', { uid: userId })
        .getMany(),
      this.dataSource.getRepository(Share).find({ where: { userId } }),
      this.dataSource.getRepository(Report).find({ where: { reporterId: userId } }),
    ]);

    await this.audit.log(ctx, {
      action: 'export_user_data',
      targetType: 'user',
      targetId: userId,
      metadata: {
        counts: {
          components: components.length,
          comments: comments.length,
          likes: likes.length,
          favorites: favorites.length,
          following: following.length,
          followers: followers.length,
          notifications: notifications.length,
        },
      },
    });

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      user,
      components,
      versions,
      comments,
      likes,
      favorites,
      following,
      followers,
      blocks,
      mutes,
      notifications,
      collections,
      collectionItems,
      shares,
      reportsFiled,
    };
  }

  /**
   * Irreversible. Clears PII, purges private interactions, sets deletedAt.
   * SessionService.hydrate returns null for soft-deleted users, so the next
   * request after this fires 401 and the JWT becomes effectively dead.
   *
   * Not reachable by suspended users — the auth guard rejects them before
   * the request hits the controller, so a banned user cannot self-delete
   * to escape a moderation action.
   */
  async deleteAccount(ctx: AuditContext): Promise<void> {
    const userId = ctx.actorId;

    await this.dataSource.transaction(async (trx) => {
      // Required by users_protect_privileged_columns — we're clearing
      // suspendedUntil/suspensionReason as part of the anonymization.
      await trx.query(`SET LOCAL app.privileged_update = 'true'`);

      const exists = await trx.getRepository(User).findOne({
        where: { id: userId },
        select: { id: true, deletedAt: true },
      });
      if (!exists || exists.deletedAt) {
        throw new NotFoundException('User not found');
      }

      // Private interactions — purged entirely. Order matters only for
      // composite FKs (collection_components depends on collections).
      await trx.getRepository(Like).delete({ userId });
      await trx.getRepository(Favorite).delete({ userId });
      await trx.query(
        `DELETE FROM follows WHERE "followerId" = $1 OR "followeeId" = $1`,
        [userId],
      );
      await trx.query(
        `DELETE FROM blocks WHERE "blockerId" = $1 OR "blockedId" = $1`,
        [userId],
      );
      await trx.query(
        `DELETE FROM mutes WHERE "muterId" = $1 OR "mutedId" = $1`,
        [userId],
      );
      await trx.query(
        `DELETE FROM notifications WHERE "userId" = $1 OR "actorId" = $1`,
        [userId],
      );
      await trx.query(
        `DELETE FROM collection_components
         WHERE "collectionId" IN (SELECT id FROM collections WHERE "ownerId" = $1)`,
        [userId],
      );
      await trx.getRepository(Collection).delete({ ownerId: userId });
      await trx.getRepository(Share).delete({ userId });

      // Anonymize PII. Email/username keep uniqueness by embedding the id.
      const anonUsername = `deleted_${userId.replace(/-/g, '')}`;
      const anonEmail = `deleted+${userId}@deleted.componi.local`;
      await trx
        .createQueryBuilder()
        .update(User)
        .set({
          email: anonEmail,
          username: anonUsername,
          githubUsername: null,
          displayName: 'Deleted User',
          avatarUrl: null,
          bio: null,
          websiteUrl: null,
          suspendedUntil: null,
          suspensionReason: null,
          deletedAt: new Date(),
        })
        .where('id = :id', { id: userId })
        .execute();

      await this.audit.log(ctx, {
        action: 'erase_user',
        targetType: 'user',
        targetId: userId,
        reason: 'user-requested-self-deletion',
        metadata: { via: 'self-service' },
      });
    });

    // Kill the session cache so the next request from this user's JWT
    // is rejected by the auth guard immediately.
    await this.sessions.invalidate(userId);
    await this.cache.invalidateTags(
      `user:${userId}:feed`,
      `author:${userId}`,
      'feed:trending',
    );
  }
}
