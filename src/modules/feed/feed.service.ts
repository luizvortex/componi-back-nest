import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Component } from '../../database/entities/component.entity';
import { Follow } from '../../database/entities/follow.entity';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CacheService } from '../../common/cache/cache.service';

@Injectable()
export class FeedService {
  private readonly feedTtl: number;

  constructor(
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(Follow) private readonly follows: Repository<Follow>,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.feedTtl = config.get<number>('redis.cache.feedTtlSeconds', 30);
  }

  /** Components from users the viewer follows, most-recent first. */
  forUser(userId: string, query: PaginationDto): Promise<Component[]> {
    // Per-user cache key so one user's personalized feed never leaks
    // into another's. Short TTL because followers expect new posts fast.
    return this.cache.wrap(
      `feed:following:${userId}:${query.limit ?? 20}`,
      () =>
        this.components
          .createQueryBuilder('c')
          .leftJoinAndSelect('c.author', 'author')
          .innerJoin(Follow, 'f', 'f."followeeId" = c."authorId" AND f."followerId" = :uid', {
            uid: userId,
          })
          .where('c.isPublic = true')
          .andWhere('c.deletedAt IS NULL')
          .orderBy('c.createdAt', 'DESC')
          .take(query.limit)
          .getMany(),
      { ttlSeconds: this.feedTtl, tags: [`user:${userId}:feed`] },
    );
  }

  trending(query: PaginationDto): Promise<Component[]> {
    // Shared across all viewers — one cache entry per limit bucket.
    return this.cache.wrap(
      `feed:trending:${query.limit ?? 20}`,
      () =>
        this.components
          .createQueryBuilder('c')
          .leftJoinAndSelect('c.author', 'author')
          .where('c.isPublic = true')
          .andWhere('c.deletedAt IS NULL')
          .orderBy('(c.likesCount * 3 + c.favoritesCount * 2 + c.viewsCount)', 'DESC')
          .addOrderBy('c.createdAt', 'DESC')
          .take(query.limit)
          .getMany(),
      { ttlSeconds: this.feedTtl, tags: ['feed:trending'] },
    );
  }
}
