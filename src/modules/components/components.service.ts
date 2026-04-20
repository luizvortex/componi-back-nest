import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Component } from '../../database/entities/component.entity';
import { ComponentVersion } from '../../database/entities/component-version.entity';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateComponentDto } from './dto/create-component.dto';
import { UpdateComponentDto } from './dto/update-component.dto';
import { ListComponentsDto } from './dto/list-components.dto';

@Injectable()
export class ComponentsService {
  constructor(
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(ComponentVersion)
    private readonly versions: Repository<ComponentVersion>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(user: AuthUser, dto: CreateComponentDto): Promise<Component> {
    return this.dataSource.transaction(async (trx) => {
      const slug = this.slugify(dto.name);
      const component = trx.getRepository(Component).create({
        authorId: user.id,
        name: dto.name,
        slug,
        description: dto.description ?? null,
        framework: dto.framework,
        category: dto.category ?? null,
        isPublic: dto.isPublic ?? true,
      });
      const saved = await trx.getRepository(Component).save(component);

      const version = trx.getRepository(ComponentVersion).create({
        componentId: saved.id,
        version: 1,
        code: dto.code,
        dependencies: dto.dependencies ?? {},
      });
      const savedVersion = await trx.getRepository(ComponentVersion).save(version);

      saved.currentVersionId = savedVersion.id;
      return trx.getRepository(Component).save(saved);
    });
  }

  async list(query: ListComponentsDto, user?: AuthUser) {
    const qb = this.components
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .where('c.deletedAt IS NULL');

    if (!user) {
      qb.andWhere('c.isPublic = true');
    } else {
      qb.andWhere('(c.isPublic = true OR c.authorId = :uid)', { uid: user.id });
    }

    if (query.framework) qb.andWhere('c.framework = :fw', { fw: query.framework });
    if (query.category) qb.andWhere('c.category = :cat', { cat: query.category });
    if (query.authorUsername) qb.andWhere('author.username = :un', { un: query.authorUsername });
    if (query.tag) {
      qb.innerJoin('c.componentTags', 'ct')
        .innerJoin('ct.tag', 'tag')
        .andWhere('tag.slug = :tagSlug', { tagSlug: query.tag });
    }

    switch (query.sort) {
      case 'popular':
        qb.orderBy('c.likesCount', 'DESC').addOrderBy('c.createdAt', 'DESC');
        break;
      case 'trending':
        qb.orderBy('c.viewsCount', 'DESC').addOrderBy('c.createdAt', 'DESC');
        break;
      default:
        qb.orderBy('c.createdAt', 'DESC');
    }

    qb.take(query.limit);
    return qb.getMany();
  }

  async findById(id: string, user?: AuthUser): Promise<Component> {
    const component = await this.components.findOne({
      where: { id },
      relations: { author: true },
    });
    if (!component) throw new NotFoundException('Component not found');
    if (!component.isPublic && component.authorId !== user?.id) {
      throw new NotFoundException('Component not found');
    }
    return component;
  }

  async update(id: string, user: AuthUser, dto: UpdateComponentDto): Promise<Component> {
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new ForbiddenException();

    Object.assign(component, {
      name: dto.name ?? component.name,
      description: dto.description ?? component.description,
      framework: dto.framework ?? component.framework,
      category: dto.category ?? component.category,
      isPublic: dto.isPublic ?? component.isPublic,
    });
    if (dto.name) component.slug = this.slugify(dto.name);
    return this.components.save(component);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new ForbiddenException();
    await this.components.softRemove(component);
  }

  async setThumbnail(id: string, user: AuthUser, thumbnailUrl: string): Promise<Component> {
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new ForbiddenException();
    component.thumbnailUrl = thumbnailUrl;
    return this.components.save(component);
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80);
  }
}
