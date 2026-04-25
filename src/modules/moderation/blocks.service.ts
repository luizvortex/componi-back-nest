import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { Block } from '../../database/entities/block.entity';
import { Follow } from '../../database/entities/follow.entity';
import { User } from '../../database/entities/user.entity';
import { CacheService } from '../../common/cache/cache.service';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class BlocksService {
  constructor(
    @InjectRepository(Block) private readonly blocks: Repository<Block>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  /**
   * Create the block and, in the same transaction, tear down any existing
   * follow relationship in either direction. The feed caches for both
   * users are invalidated so the other side disappears on the next refresh.
   *
   * Idempotent — blocking someone you've already blocked is a no-op.
   */
  async block(blockerId: string, blockedId: string, reason?: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    await this.dataSource.transaction(async (trx) => {
      const target = await trx.getRepository(User).findOne({
        where: { id: blockedId },
        select: { id: true, deletedAt: true },
      });
      if (!target || target.deletedAt) {
        throw new NotFoundException('User not found');
      }

      try {
        await trx.getRepository(Block).insert({
          blockerId,
          blockedId,
          reason: reason?.trim() || null,
        });
      } catch (err) {
        // Already blocked — nothing to do, stay idempotent.
        if (
          err instanceof QueryFailedError &&
          (err as { code?: string }).code === PG_UNIQUE_VIOLATION
        ) {
          return;
        }
        throw err;
      }

      // Remove follows in BOTH directions so the block takes effect
      // immediately for the following-feed query.
      const followsRepo = trx.getRepository(Follow);
      const forward = await followsRepo.delete({
        followerId: blockerId,
        followeeId: blockedId,
      });
      const reverse = await followsRepo.delete({
        followerId: blockedId,
        followeeId: blockerId,
      });

      const usersRepo = trx.getRepository(User);
      if (forward.affected) {
        await usersRepo.decrement({ id: blockerId }, 'followingCount', 1);
        await usersRepo.decrement({ id: blockedId }, 'followersCount', 1);
      }
      if (reverse.affected) {
        await usersRepo.decrement({ id: blockedId }, 'followingCount', 1);
        await usersRepo.decrement({ id: blockerId }, 'followersCount', 1);
      }
    });

    // Both sides' feeds need a refresh: the blocker's feed drops the
    // blocked's content, and vice versa (block is bidirectional in
    // visibility even though one side initiated it).
    await this.cache.invalidateTags(
      `user:${blockerId}:feed`,
      `user:${blockedId}:feed`,
    );
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    // Intentionally does NOT restore the follows that `block()` deleted.
    // If the user wants to re-follow after unblocking, they do it explicitly.
    await this.blocks.delete({ blockerId, blockedId });
  }

  listForBlocker(blockerId: string): Promise<Block[]> {
    return this.blocks.find({
      where: { blockerId },
      relations: { blocked: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * One-shot helper for downstream services that need to know whether to
   * filter content between a viewer and an author. Returns true if EITHER
   * side has blocked the other (symmetric visibility enforcement).
   *
   * Kept here (rather than on User) because the callers are the social /
   * feed services that already depend on moderation state.
   */
  async isBlockedEitherWay(viewerId: string, authorId: string): Promise<boolean> {
    if (viewerId === authorId) return false;
    const row = await this.blocks
      .createQueryBuilder('b')
      .where(
        '(b."blockerId" = :a AND b."blockedId" = :b) OR (b."blockerId" = :b AND b."blockedId" = :a)',
        { a: viewerId, b: authorId },
      )
      .limit(1)
      .getOne();
    return !!row;
  }
}
