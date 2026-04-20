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

@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(Like) private readonly likes: Repository<Like>,
    @InjectRepository(Favorite) private readonly favorites: Repository<Favorite>,
    @InjectRepository(Follow) private readonly follows: Repository<Follow>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async like(userId: string, componentId: string): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      const component = await trx.getRepository(Component).findOne({ where: { id: componentId } });
      if (!component) throw new NotFoundException('Component not found');
      const existing = await trx.getRepository(Like).findOne({ where: { userId, componentId } });
      if (existing) return;
      await trx.getRepository(Like).insert({ userId, componentId });
      await trx
        .getRepository(Component)
        .increment({ id: componentId }, 'likesCount', 1);
    });
  }

  async unlike(userId: string, componentId: string): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      const result = await trx.getRepository(Like).delete({ userId, componentId });
      if (result.affected) {
        await trx
          .getRepository(Component)
          .decrement({ id: componentId }, 'likesCount', 1);
      }
    });
  }

  async favorite(userId: string, componentId: string): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      const component = await trx.getRepository(Component).findOne({ where: { id: componentId } });
      if (!component) throw new NotFoundException('Component not found');
      const existing = await trx
        .getRepository(Favorite)
        .findOne({ where: { userId, componentId } });
      if (existing) return;
      await trx.getRepository(Favorite).insert({ userId, componentId });
      await trx
        .getRepository(Component)
        .increment({ id: componentId }, 'favoritesCount', 1);
    });
  }

  async unfavorite(userId: string, componentId: string): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      const result = await trx.getRepository(Favorite).delete({ userId, componentId });
      if (result.affected) {
        await trx
          .getRepository(Component)
          .decrement({ id: componentId }, 'favoritesCount', 1);
      }
    });
  }

  async follow(followerId: string, followeeId: string): Promise<void> {
    if (followerId === followeeId) throw new BadRequestException('Cannot follow yourself');
    await this.dataSource.transaction(async (trx) => {
      const target = await trx.getRepository(User).findOne({ where: { id: followeeId } });
      if (!target) throw new NotFoundException('User not found');
      const existing = await trx
        .getRepository(Follow)
        .findOne({ where: { followerId, followeeId } });
      if (existing) return;
      await trx.getRepository(Follow).insert({ followerId, followeeId });
      await trx.getRepository(User).increment({ id: followerId }, 'followingCount', 1);
      await trx.getRepository(User).increment({ id: followeeId }, 'followersCount', 1);
    });
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
