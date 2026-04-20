import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Component } from '../../database/entities/component.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async searchAll(query: string, limit = 20) {
    const q = `%${query}%`;
    const [components, users] = await Promise.all([
      this.components
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.author', 'author')
        .where('c.isPublic = true')
        .andWhere('(c.name ILIKE :q OR c.description ILIKE :q)', { q })
        .take(limit)
        .getMany(),
      this.users
        .createQueryBuilder('u')
        .where('u.username ILIKE :q OR u.displayName ILIKE :q', { q })
        .take(limit)
        .getMany(),
    ]);
    return { components, users };
  }
}
