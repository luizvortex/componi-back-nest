import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Like } from '../../database/entities/like.entity';
import { Favorite } from '../../database/entities/favorite.entity';
import { Follow } from '../../database/entities/follow.entity';
import { Component } from '../../database/entities/component.entity';
import { User } from '../../database/entities/user.entity';
import { RealtimeService } from '../../common/realtime/realtime.service';
import { BlocksService } from '../moderation/blocks.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(Like) private readonly likes: Repository<Like>,
    @InjectRepository(Favorite) private readonly favorites: Repository<Favorite>,
    @InjectRepository(Follow) private readonly follows: Repository<Follow>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly blocks: BlocksService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async like(userId: string, componentId: string): Promise<void> {
    const result = await this.dataSource.transaction(async (trx) => {
      const target = await trx.getRepository(Component).findOne({ where: { id: componentId } });
      if (!target) throw new NotFoundException('Component not found');
      if (target.authorId !== userId && await this.blocks.isBlockedEitherWay(userId, target.authorId)) {
        throw new NotFoundException('Component not found');
      }
      const existing = await trx.getRepository(Like).findOne({ where: { userId, componentId } });
      if (existing) return null;
      await trx.getRepository(Like).insert({ userId, componentId });
      await trx.getRepository(Component).increment({ id: componentId }, 'likesCount', 1);
      return { authorId: target.authorId, likesCount: target.likesCount + 1 };
    });

    if (result) {
      // dedupe so rapid unlike/relike doesn't spam the target's inbox.
      await this.notifications.enqueue(
        result.authorId,
        'like',
        { componentId },
        userId,
        `like:${userId}:${componentId}`,
      );
      this.realtime.componentLiked(componentId, userId, result.likesCount);
    }
  }

  async unlike(userId: string, componentId: string): Promise<void> {
    const newCount = await this.dataSource.transaction(async (trx) => {
      const deleted = await trx.getRepository(Like).delete({ userId, componentId });
      if (!deleted.affected) return null;
      await trx.getRepository(Component).decrement({ id: componentId }, 'likesCount', 1);
      const after = await trx
        .getRepository(Component)
        .findOne({ where: { id: componentId }, select: { likesCount: true } });
      return after?.likesCount ?? null;
    });

    if (newCount !== null) {
      this.realtime.componentUnliked(componentId, userId, newCount);
    }
  }

  async favorite(userId: string, componentId: string): Promise<void> {
    const component = await this.dataSource.transaction(async (trx) => {
      const target = await trx.getRepository(Component).findOne({ where: { id: componentId } });
      if (!target) throw new NotFoundException('Component not found');
      if (target.authorId !== userId && await this.blocks.isBlockedEitherWay(userId, target.authorId)) {
        throw new NotFoundException('Component not found');
      }
      const existing = await trx
        .getRepository(Favorite)
        .findOne({ where: { userId, componentId } });
      if (existing) return null;
      await trx.getRepository(Favorite).insert({ userId, componentId });
      await trx.getRepository(Component).increment({ id: componentId }, 'favoritesCount', 1);
      return target;
    });

    if (component) {
      await this.notifications.enqueue(
        component.authorId,
        'favorite',
        { componentId },
        userId,
        `favorite:${userId}:${componentId}`,
      );
    }
  }

  async unfavorite(userId: string, componentId: string): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      const result = await trx.getRepository(Favorite).delete({ userId, componentId });
      if (result.affected) {
        await trx.getRepository(Component).decrement({ id: componentId }, 'favoritesCount', 1);
      }
    });
  }

  async follow(followerId: string, followeeId: string): Promise<void> {
    if (followerId === followeeId) throw new BadRequestException('Cannot follow yourself');
    const created = await this.dataSource.transaction(async (trx) => {
      const target = await trx.getRepository(User).findOne({ where: { id: followeeId } });
      if (!target) throw new NotFoundException('User not found');
      if (await this.blocks.isBlockedEitherWay(followerId, followeeId)) {
        throw new NotFoundException('User not found');
      }
      const existing = await trx
        .getRepository(Follow)
        .findOne({ where: { followerId, followeeId } });
      if (existing) return null;
      await trx.getRepository(Follow).insert({ followerId, followeeId });
      await trx.getRepository(User).increment({ id: followerId }, 'followingCount', 1);
      await trx.getRepository(User).increment({ id: followeeId }, 'followersCount', 1);
      return target.followersCount + 1;
    });

    if (created !== null) {
      await this.notifications.enqueue(
        followeeId,
        'follow',
        {},
        followerId,
        `follow:${followerId}:${followeeId}`,
      );
      this.realtime.userFollowed(followeeId, followerId, created);
    }
  }

  async unfollow(followerId: string, followeeId: string): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      const result = await trx.getRepository(Follow).delete({ followerId, followeeId });
      if (result.affected) {
        await trx.getRepository(User).decrement({ id: followerId }, 'followingCount', 1);
        await trx.getRepository(User).decrement({ id: followeeId }, 'followersCount', 1);
      }
    });
  }
}
