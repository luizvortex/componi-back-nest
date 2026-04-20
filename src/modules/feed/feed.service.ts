import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Component } from '../../database/entities/component.entity';
import { Follow } from '../../database/entities/follow.entity';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class FeedService {
  constructor(
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(Follow) private readonly follows: Repository<Follow>,
  ) {}

  /** Components from users the viewer follows, most-recent first. */
  async forUser(userId: string, query: PaginationDto): Promise<Component[]> {
    const qb = this.components
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .innerJoin(Follow, 'f', 'f."followeeId" = c."authorId" AND f."followerId" = :uid', {
        uid: userId,
      })
      .where('c.isPublic = true')
      .andWhere('c.deletedAt IS NULL')
      .orderBy('c.createdAt', 'DESC')
      .take(query.limit);
    return qb.getMany();
  }

  trending(query: PaginationDto): Promise<Component[]> {
    return this.components
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .where('c.isPublic = true')
      .andWhere('c.deletedAt IS NULL')
      .orderBy('(c.likesCount * 3 + c.favoritesCount * 2 + c.viewsCount)', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .take(query.limit)
      .getMany();
  }
}
