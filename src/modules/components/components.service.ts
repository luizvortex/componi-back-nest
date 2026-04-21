import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';

import { Component } from '../../database/entities/component.entity';
import { ComponentVersion } from '../../database/entities/component-version.entity';
import { ComponentTag } from '../../database/entities/component-tag.entity';
import { Tag } from '../../database/entities/tag.entity';
import { User } from '../../database/entities/user.entity';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateComponentDto } from './dto/create-component.dto';
import { ForkComponentDto } from './dto/fork-component.dto';
import { ListComponentsDto } from './dto/list-components.dto';
import { UpdateComponentDto } from './dto/update-component.dto';

const SLUG_RETRY_LIMIT = 5;
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ComponentsService {
  constructor(
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(ComponentVersion)
    private readonly versions: Repository<ComponentVersion>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async create(user: AuthUser, dto: CreateComponentDto): Promise<Component> {
    return this.dataSource.transaction(async (trx) => {
      const baseSlug = this.slugify(dto.name);
      const saved = await this.insertWithUniqueSlug(trx, user.id, baseSlug, () =>
        trx.getRepository(Component).create({
          authorId: user.id,
          name: dto.name,
          slug: baseSlug,
          description: dto.description ?? null,
          framework: dto.framework,
          category: dto.category ?? null,
          isPublic: dto.isPublic ?? true,
        }),
      );

      const version = await trx.getRepository(ComponentVersion).save(
        trx.getRepository(ComponentVersion).create({
          componentId: saved.id,
          version: 1,
          code: dto.code,
          dependencies: dto.dependencies ?? {},
        }),
      );
      saved.currentVersionId = version.id;
      await trx.getRepository(Component).save(saved);

      if (dto.tagSlugs?.length) {
        await this.attachTags(trx, saved.id, dto.tagSlugs);
      }

      await trx.getRepository(User).increment({ id: user.id }, 'componentsCount', 1);
      return saved;
    });
  }

  async fork(parentId: string, user: AuthUser, dto: ForkComponentDto): Promise<Component> {
    return this.dataSource.transaction(async (trx) => {
      const parent = await trx
        .getRepository(Component)
        .findOne({ where: { id: parentId }, relations: { componentTags: { tag: true } } });
      if (!parent || parent.deletedAt) throw new NotFoundException('Component not found');
      if (!parent.isPublic && parent.authorId !== user.id) {
        throw new NotFoundException('Component not found');
      }

      const sourceVersionId = parent.currentVersionId;
      if (!sourceVersionId) throw new BadRequestException('Parent has no published version');
      const sourceVersion = await trx
        .getRepository(ComponentVersion)
        .findOne({ where: { id: sourceVersionId } });
      if (!sourceVersion) throw new BadRequestException('Parent has no published version');

      const name = dto.name ?? `${parent.name} (fork)`;
      const baseSlug = this.slugify(name);
      const fork = await this.insertWithUniqueSlug(trx, user.id, baseSlug, () =>
        trx.getRepository(Component).create({
          authorId: user.id,
          name,
          slug: baseSlug,
          description: parent.description,
          framework: parent.framework,
          category: parent.category,
          isPublic: dto.isPublic ?? true,
          forkedFromId: parent.id,
        }),
      );

      const version = await trx.getRepository(ComponentVersion).save(
        trx.getRepository(ComponentVersion).create({
          componentId: fork.id,
          version: 1,
          code: sourceVersion.code,
          dependencies: sourceVersion.dependencies,
          entryFile: sourceVersion.entryFile,
          changelog: `Forked from ${parent.id} v${sourceVersion.version}`,
        }),
      );
      fork.currentVersionId = version.id;
      await trx.getRepository(Component).save(fork);

      if (parent.componentTags?.length) {
        const tagSlugs = parent.componentTags.map((ct) => ct.tag.slug);
        await this.attachTags(trx, fork.id, tagSlugs);
      }

      await trx.getRepository(Component).increment({ id: parent.id }, 'forksCount', 1);
      await trx.getRepository(User).increment({ id: user.id }, 'componentsCount', 1);
      return fork;
    });
  }

  async list(query: ListComponentsDto, user?: AuthUser): Promise<Component[]> {
    const qb = this.components
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .where('c.deletedAt IS NULL');

    if (user) {
      qb.andWhere('(c.isPublic = true OR c.authorId = :uid)', { uid: user.id });
    } else {
      qb.andWhere('c.isPublic = true');
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
        qb.orderBy('c.likesCount', 'DESC').addOrderBy('c.createdAt', 'DESC').addOrderBy('c.id', 'DESC');
        break;
      case 'trending':
        qb.orderBy('(c.likesCount * 3 + c.favoritesCount * 2 + c.viewsCount)', 'DESC')
          .addOrderBy('c.createdAt', 'DESC')
          .addOrderBy('c.id', 'DESC');
        break;
      default:
        qb.orderBy('c.createdAt', 'DESC').addOrderBy('c.id', 'DESC');
    }

    qb.take(query.limit);
    return qb.getMany();
  }

  async findById(id: string, user?: AuthUser): Promise<Component> {
    const component = await this.components.findOne({
      where: { id },
      relations: { author: true, componentTags: { tag: true } },
    });
    if (!component) throw new NotFoundException('Component not found');
    if (!component.isPublic && component.authorId !== user?.id) {
      throw new NotFoundException('Component not found');
    }
    return component;
  }

  /** Walks the fork chain upward (parents) and downward (direct forks). */
  async lineage(id: string, user?: AuthUser): Promise<{
    component: Component;
    ancestors: Component[];
    descendants: Component[];
  }> {
    const component = await this.findById(id, user);
    const ancestors = await this.components.query(
      `
      WITH RECURSIVE chain AS (
        SELECT c.* FROM components c WHERE c.id = $1 AND c."forkedFromId" IS NOT NULL
        UNION ALL
        SELECT p.* FROM components p
        JOIN chain ON p.id = chain."forkedFromId"
      )
      SELECT * FROM chain WHERE id <> $1
      `,
      [component.id],
    );
    const descendants = await this.components.find({
      where: { forkedFromId: component.id },
      relations: { author: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { component, ancestors, descendants };
  }

  async update(id: string, user: AuthUser, dto: UpdateComponentDto): Promise<Component> {
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new ForbiddenException();

    if (dto.name && dto.name !== component.name) {
      component.name = dto.name;
      component.slug = await this.findUniqueSlug(user.id, this.slugify(dto.name), component.id);
    }
    if (dto.description !== undefined) component.description = dto.description ?? null;
    if (dto.framework) component.framework = dto.framework;
    if (dto.category !== undefined) component.category = dto.category ?? null;
    if (dto.isPublic !== undefined) component.isPublic = dto.isPublic;

    return this.components.save(component);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new ForbiddenException();
    await this.dataSource.transaction(async (trx) => {
      await trx.getRepository(Component).softRemove(component);
      await trx.getRepository(User).decrement({ id: user.id }, 'componentsCount', 1);
    });
  }

  async setThumbnail(id: string, user: AuthUser, thumbnailUrl: string): Promise<Component> {
    this.assertThumbnailOriginAllowed(thumbnailUrl);
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new ForbiddenException();
    component.thumbnailUrl = thumbnailUrl;
    return this.components.save(component);
  }

  // ────────────────────────────────────────────────────────────────────
  // helpers
  // ────────────────────────────────────────────────────────────────────

  private async attachTags(
    trx: import('typeorm').EntityManager,
    componentId: string,
    slugs: string[],
  ): Promise<void> {
    const normalized = Array.from(
      new Set(slugs.map((s) => s.toLowerCase().trim()).filter(Boolean)),
    );
    if (!normalized.length) return;

    const existing = await trx.getRepository(Tag).find({ where: { slug: In(normalized) } });
    const existingSlugs = new Set(existing.map((t) => t.slug));
    const newTags = normalized
      .filter((s) => !existingSlugs.has(s))
      .map((s) => trx.getRepository(Tag).create({ slug: s, name: s }));
    const created = newTags.length ? await trx.getRepository(Tag).save(newTags) : [];
    const all = [...existing, ...created];

    await trx
      .getRepository(ComponentTag)
      .insert(all.map((t) => ({ componentId, tagId: t.id })))
      .catch((err) => {
        if (err instanceof QueryFailedError && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
          return; // tag already attached, idempotent
        }
        throw err;
      });
    await trx
      .getRepository(Tag)
      .increment({ id: In(all.map((t) => t.id)) }, 'usageCount', 1);
  }

  private async insertWithUniqueSlug(
    trx: import('typeorm').EntityManager,
    authorId: string,
    baseSlug: string,
    factory: () => Component,
  ): Promise<Component> {
    let attempt = 0;
    while (attempt < SLUG_RETRY_LIMIT) {
      const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const entity = factory();
      entity.slug = candidate;
      try {
        return await trx.getRepository(Component).save(entity);
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          (err as { code?: string }).code === PG_UNIQUE_VIOLATION
        ) {
          attempt += 1;
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException('Could not allocate a unique slug — try a different name');
  }

  private async findUniqueSlug(authorId: string, baseSlug: string, excludeId: string): Promise<string> {
    let attempt = 0;
    while (attempt < SLUG_RETRY_LIMIT) {
      const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const conflict = await this.components.findOne({
        where: { authorId, slug: candidate },
      });
      if (!conflict || conflict.id === excludeId) return candidate;
      attempt += 1;
    }
    throw new BadRequestException('Could not allocate a unique slug — try a different name');
  }

  private slugify(value: string): string {
    const stripped = value
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80);
    return stripped || 'component';
  }

  private assertThumbnailOriginAllowed(url: string): void {
    const supabaseUrl = this.config.get<string>('supabase.url');
    if (!supabaseUrl) {
      throw new BadRequestException('Storage origin not configured');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid thumbnail URL');
    }
    const allowedHost = new URL(supabaseUrl).host;
    if (parsed.protocol !== 'https:' || parsed.host !== allowedHost) {
      throw new BadRequestException('Thumbnail must be hosted on the configured Supabase project');
    }
  }
}
