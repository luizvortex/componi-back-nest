import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Tag } from '../../database/entities/tag.entity';

@Injectable()
export class TagsService {
  constructor(@InjectRepository(Tag) private readonly tags: Repository<Tag>) {}

  listPopular(limit = 50): Promise<Tag[]> {
    return this.tags.find({ order: { usageCount: 'DESC' }, take: limit });
  }

  search(query: string, limit = 20): Promise<Tag[]> {
    return this.tags
      .createQueryBuilder('t')
      .where('t.slug ILIKE :q OR t.name ILIKE :q', { q: `%${query}%` })
      .orderBy('t.usageCount', 'DESC')
      .take(limit)
      .getMany();
  }

  async findOrCreate(slug: string, name?: string): Promise<Tag> {
    const normalized = slug.toLowerCase().trim();
    const existing = await this.tags.findOne({ where: { slug: normalized } });
    if (existing) return existing;
    return this.tags.save(this.tags.create({ slug: normalized, name: name ?? normalized }));
  }
}
