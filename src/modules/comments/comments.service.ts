import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Comment } from '../../database/entities/comment.entity';
import { Component } from '../../database/entities/component.entity';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  list(componentId: string): Promise<Comment[]> {
    return this.comments.find({
      where: { componentId },
      relations: { author: true },
      order: { createdAt: 'ASC' },
    });
  }

  async create(componentId: string, user: AuthUser, dto: CreateCommentDto): Promise<Comment> {
    return this.dataSource.transaction(async (trx) => {
      const component = await trx.getRepository(Component).findOne({ where: { id: componentId } });
      if (!component) throw new NotFoundException('Component not found');

      const comment = trx.getRepository(Comment).create({
        componentId,
        authorId: user.id,
        parentId: dto.parentId ?? null,
        body: dto.body,
      });
      const saved = await trx.getRepository(Comment).save(comment);
      await trx.getRepository(Component).increment({ id: componentId }, 'commentsCount', 1);
      return saved;
    });
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const comment = await this.comments.findOne({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== user.id) throw new ForbiddenException();
    await this.dataSource.transaction(async (trx) => {
      await trx.getRepository(Comment).softRemove(comment);
      await trx
        .getRepository(Component)
        .decrement({ id: comment.componentId }, 'commentsCount', 1);
    });
  }
}
