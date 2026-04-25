import {
  BadRequestException,
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
import { CacheService } from '../../common/cache/cache.service';
import { EmbeddingsService } from '../../common/embeddings/embeddings.service';
import { BlocksService } from '../moderation/blocks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ThumbnailsService } from '../thumbnails/thumbnails.service';
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
    private readonly cache: CacheService,
    private readonly blocks: BlocksService,
    private readonly embeddings: EmbeddingsService,
    private readonly notifications: NotificationsService,
    private readonly thumbnails: ThumbnailsService,
  ) {}

  async create(user: AuthUser, dto: CreateComponentDto): Promise<Component> {
    const saved = await this.dataSource.transaction(async (trx) => {
      const baseSlug = this.slugify(dto.name);
      const row = await this.insertWithUniqueSlug(trx, user.id, baseSlug, () =>
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
          componentId: row.id,
          version: 1,
          code: dto.code,
          dependencies: dto.dependencies ?? {},
        }),
      );
      row.currentVersionId = version.id;
      await trx.getRepository(Component).save(row);

      if (dto.tagSlugs?.length) {
        await this.attachTags(trx, row.id, dto.tagSlugs);
      }

      await trx.getRepository(User).increment({ id: user.id }, 'componentsCount', 1);
      await this.cache.invalidateTags('feed:trending', `author:${user.id}`);
      return row;
    });

    // Post-commit: the row is visible to other sessions — enqueue an
    // embedding job so semantic search picks it up. Fire-and-forget at
    // the service level (the service itself swallows errors when
    // workers are disabled; the cron is the safety net).
    await this.embeddings.enqueue(saved.id);
    return saved;
  }

  async fork(parentId: string, user: AuthUser, dto: ForkComponentDto): Promise<Component> {
    const fork = await this.dataSource.transaction(async (trx) => {
      const parent = await trx
        .getRepository(Component)
        .findOne({ where: { id: parentId }, relations: { componentTags: { tag: true } } });
      if (!parent || parent.deletedAt) throw new NotFoundException('Component not found');
      if (!parent.isPublic && parent.authorId !== user.id) {
        throw new NotFoundException('Component not found');
      }
      if (parent.authorId !== user.id && await this.blocks.isBlockedEitherWay(user.id, parent.authorId)) {
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

      await this.notifications.enqueue(
        parent.authorId,
        'version',
        { forkId: fork.id, parentId: parent.id, kind: 'fork' },
        user.id,
        `fork:${fork.id}`,
      );
      await Promise.all([
        this.cache.invalidateTags(`component:${parent.id}`, 'feed:trending'),
      ]);
      return fork;
    });

    // Fork gets its own embedding — same input assembly as create.
    await this.embeddings.enqueue(fork.id);
    return fork;
  }

  async list(query: ListComponentsDto, user?: AuthUser): Promise<Component[]> {
    const qb = this.components
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .where('c.deletedAt IS NULL');

    if (user) {
      qb.andWhere('(c.isPublic = true OR c.authorId = :uid)', { uid: user.id });
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b."blockerId" = :uid AND b."blockedId" = c."authorId")
             OR (b."blockerId" = c."authorId" AND b."blockedId" = :uid)
        )`,
      );
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
    // Try the cache first — only public components end up here, so there's
    // no risk of leaking private data across viewers.
    const cached = await this.cache.get<Component>(`component:${id}:public`);
    if (cached) {
      if (user && user.id !== cached.authorId && await this.blocks.isBlockedEitherWay(user.id, cached.authorId)) {
        throw new NotFoundException('Component not found');
      }
      return cached;
    }

    const found = await this.components.findOne({
      where: { id },
      relations: { author: true, componentTags: { tag: true } },
    });
    if (!found) throw new NotFoundException('Component not found');
    if (!found.isPublic && found.authorId !== user?.id) {
      throw new NotFoundException('Component not found');
    }
    if (user && user.id !== found.authorId && await this.blocks.isBlockedEitherWay(user.id, found.authorId)) {
      throw new NotFoundException('Component not found');
    }
    if (found.isPublic) {
      await this.cache.set(`component:${id}:public`, found, 120, [`component:${id}`]);
    }
    return found;
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
    // 404 (not 403) on ownership mismatch so the endpoint doesn't
    // double as a resource-existence oracle for other users' IDs.
    if (component.authorId !== user.id) throw new NotFoundException('Component not found');

    // Track whether any field that feeds the semantic-embedding input
    // changed. If only `isPublic`/`category` flipped the vector would
    // still be valid — no point burning CPU re-embedding.
    let embeddingRelevantChange = false;
    if (dto.name && dto.name !== component.name) {
      component.name = dto.name;
      component.slug = await this.findUniqueSlug(user.id, this.slugify(dto.name), component.id);
      embeddingRelevantChange = true;
    }
    if (dto.description !== undefined && (dto.description ?? null) !== component.description) {
      component.description = dto.description ?? null;
      embeddingRelevantChange = true;
    }
    if (dto.framework && dto.framework !== component.framework) {
      component.framework = dto.framework;
      embeddingRelevantChange = true;
    }
    if (dto.category !== undefined) component.category = dto.category ?? null;
    if (dto.isPublic !== undefined) component.isPublic = dto.isPublic;

    const saved = await this.components.save(component);
    await this.cache.invalidateTags(
      `component:${id}`,
      `author:${user.id}`,
      'feed:trending',
    );
    if (embeddingRelevantChange) {
      await this.embeddings.enqueue(id);
    }
    return saved;
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new NotFoundException('Component not found');
    await this.dataSource.transaction(async (trx) => {
      await trx.getRepository(Component).softRemove(component);
      await trx.getRepository(User).decrement({ id: user.id }, 'componentsCount', 1);
    });
    await this.cache.invalidateTags(
      `component:${id}`,
      `author:${user.id}`,
      'feed:trending',
    );
  }

  async setThumbnail(id: string, user: AuthUser, thumbnailUrl: string): Promise<Component> {
    this.assertThumbnailOriginAllowed(thumbnailUrl);
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new NotFoundException('Component not found');
    component.thumbnailUrl = thumbnailUrl;
    const saved = await this.components.save(component);
    await this.cache.invalidateTags(`component:${id}`, 'feed:trending');
    // Fire-and-forget reachability check. Failure doesn't block the
    // save — a broken URL is logged by the worker and surfaced via
    // observability, not via the user-facing 200/5xx response.
    await this.thumbnails.enqueue({ componentId: id, thumbnailUrl });
    return saved;
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
