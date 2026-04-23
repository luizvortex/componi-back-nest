import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Comment } from '../../database/entities/comment.entity';
import { Component } from '../../database/entities/component.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { CacheService } from '../../common/cache/cache.service';

/**
 * Moderator-issued content takedowns. Distinct from owner-initiated
 * deletes (which live in ComponentsService.remove and don't need
 * audit/reason). Soft-delete is preserved so the content can be restored
 * if the takedown is appealed successfully.
 */
@Injectable()
export class AdminContentService {
  constructor(
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  async deleteComponent(
    ctx: AuditContext,
    componentId: string,
    reason: string,
    reportId?: string,
  ): Promise<void> {
    const component = await this.components.findOne({
      where: { id: componentId },
      select: { id: true, authorId: true, deletedAt: true },
    });
    if (!component || component.deletedAt) {
      throw new NotFoundException('Component not found');
    }

    await this.dataSource.transaction(async (trx) => {
      await trx
        .createQueryBuilder()
        .softDelete()
        .from(Component)
        .where('id = :id', { id: componentId })
        .execute();
      await trx
        .getRepository(User)
        .decrement({ id: component.authorId }, 'componentsCount', 1);

      await this.audit.log(ctx, {
        action: 'delete_component',
        targetType: 'component',
        targetId: componentId,
        reason,
        metadata: {
          authorId: component.authorId,
          ...(reportId ? { reportId } : {}),
        },
      });
    });

    await this.cache.invalidateTags(
      `component:${componentId}`,
      `author:${component.authorId}`,
      'feed:trending',
    );
  }

  async deleteComment(
    ctx: AuditContext,
    commentId: string,
    reason: string,
    reportId?: string,
  ): Promise<void> {
    const comment = await this.comments.findOne({
      where: { id: commentId },
      select: { id: true, authorId: true, componentId: true, deletedAt: true },
    });
    if (!comment || comment.deletedAt) {
      throw new NotFoundException('Comment not found');
    }

    await this.dataSource.transaction(async (trx) => {
      await trx
        .createQueryBuilder()
        .softDelete()
        .from(Comment)
        .where('id = :id', { id: commentId })
        .execute();
      await trx
        .getRepository(Component)
        .decrement({ id: comment.componentId }, 'commentsCount', 1);

      await this.audit.log(ctx, {
        action: 'delete_comment',
        targetType: 'comment',
        targetId: commentId,
        reason,
        metadata: {
          authorId: comment.authorId,
          componentId: comment.componentId,
          ...(reportId ? { reportId } : {}),
        },
      });
    });

    await this.cache.invalidateTags(`component:${comment.componentId}`);
  }
}
