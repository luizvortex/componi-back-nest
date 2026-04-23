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

  /** Components from users the viewer follows, most-recent first. Blocked and muted authors are excluded. */
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
          .andWhere(
            `NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b."blockerId" = :uid AND b."blockedId" = c."authorId")
                 OR (b."blockerId" = c."authorId" AND b."blockedId" = :uid)
            )`,
          )
          .andWhere(
            `NOT EXISTS (
              SELECT 1 FROM mutes m
              WHERE m."muterId" = :uid AND m."mutedId" = c."authorId"
            )`,
          )
          .orderBy('c.createdAt', 'DESC')
          .take(query.limit)
          .getMany(),
      { ttlSeconds: this.feedTtl, tags: [`user:${userId}:feed`] },
    );
  }

  /**
   * Shared trending feed. When viewerId is provided the result is post-filtered
   * in memory so blocked authors are hidden without busting the shared cache.
   */
  async trending(query: PaginationDto, viewerId?: string): Promise<Component[]> {
    // Shared across all viewers — one cache entry per limit bucket.
    const results = await this.cache.wrap(
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

    if (!viewerId || !results.length) return results;

    // Post-filter blocks in a single round-trip: collect the distinct
    // authors, ask Postgres for the subset that has a block relationship
    // either way with the viewer, then drop those rows in memory. This
    // is O(1) queries regardless of page size (previously O(n)).
    const authorIds = Array.from(new Set(results.map((c) => c.authorId).filter((id) => id !== viewerId)));
    if (!authorIds.length) return results;

    const blockedRows = (await this.components.query(
      `SELECT DISTINCT CASE WHEN b."blockerId" = $1 THEN b."blockedId" ELSE b."blockerId" END AS "otherId"
       FROM blocks b
       WHERE (b."blockerId" = $1 AND b."blockedId" = ANY($2::uuid[]))
          OR (b."blockedId" = $1 AND b."blockerId" = ANY($2::uuid[]))`,
      [viewerId, authorIds],
    )) as Array<{ otherId: string }>;
    const blockedSet = new Set(blockedRows.map((r) => r.otherId));

    return results.filter((c) => c.authorId === viewerId || !blockedSet.has(c.authorId));
  }
}
