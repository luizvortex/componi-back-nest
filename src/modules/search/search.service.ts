import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Component } from '../../database/entities/component.entity';
import { User } from '../../database/entities/user.entity';

const MIN_QUERY = 2;
const MAX_QUERY = 60;

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async searchAll(query: string, limit = 20) {
    const trimmed = (query ?? '').trim();
    if (trimmed.length < MIN_QUERY) {
      throw new BadRequestException(`Query must be at least ${MIN_QUERY} characters`);
    }
    if (trimmed.length > MAX_QUERY) {
      throw new BadRequestException(`Query must be at most ${MAX_QUERY} characters`);
    }
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const [components, users] = await Promise.all([
      this.components
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.author', 'author')
        .where('c.isPublic = true')
        .andWhere('c.deletedAt IS NULL')
        .andWhere('(c.name ILIKE :q OR c.description ILIKE :q)', { q: `%${trimmed}%` })
        .orderBy('c.likesCount', 'DESC')
        .addOrderBy('c.createdAt', 'DESC')
        .take(safeLimit)
        .getMany(),
      this.users
        .createQueryBuilder('u')
        .where('u.deletedAt IS NULL')
        .andWhere('(u.username ILIKE :q OR u.displayName ILIKE :q)', { q: `%${trimmed}%` })
        .orderBy('u.followersCount', 'DESC')
        .take(safeLimit)
        .getMany(),
    ]);
    return { components, users };
  }
}
