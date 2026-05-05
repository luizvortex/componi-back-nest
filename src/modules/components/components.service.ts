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
import { SaveDraftDto } from './dto/save-draft.dto';
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
          isDraft: dto.isDraft ?? false,
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
      // Drafts don’t affect the trending feed — skip invalidation until publish.
      if (!row.isDraft) {
        await this.cache.invalidateTags('feed:trending', `author:${user.id}`);
      }
      return row;
    });

    // Only enqueue embedding for published components. The embed job runs
    // after publish() so the vector isn’t wasted on a draft that may never
    // go live (or whose content will change many times before it does).
    if (!saved.isDraft) {
      await this.embeddings.enqueue(saved.id);
    }
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
      // Drafts are never forkable — they’re not public yet.
      if (parent.isDraft) throw new NotFoundException('Component not found');
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

    await this.embeddings.enqueue(fork.id);
    return fork;
  }

  async list(query: ListComponentsDto, user?: AuthUser): Promise<Component[]> {
    const qb = this.components
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .where('c.deletedAt IS NULL')
      // Drafts are never surfaced in list endpoints — use GET /components/drafts.
      .andWhere('c.isDraft = false');

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

  /** Returns all drafts owned by the requesting user, newest first. */
  async listDrafts(user: AuthUser): Promise<Component[]> {
    return this.components.find({
      where: { authorId: user.id, isDraft: true },
      relations: { componentTags: { tag: true } },
      order: { updatedAt: 'DESC' },
    });
  }

  async findById(id: string, user?: AuthUser): Promise<Component> {
    // Try the cache first — only public, non-draft components end up here.
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
    // Drafts are only accessible to the author — treat as 404 for everyone else
    // so the endpoint doesn’t leak that the resource exists.
    if (found.isDraft && found.authorId !== user?.id) {
      throw new NotFoundException('Component not found');
    }
    if (user && user.id !== found.authorId && await this.blocks.isBlockedEitherWay(user.id, found.authorId)) {
      throw new NotFoundException('Component not found');
    }
    // Only cache public, published components.
    if (found.isPublic && !found.isDraft) {
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

  /**
   * Auto-saves a draft: updates metadata and/or code in-place on the
   * current version without creating a new version entry. All fields are
   * optional so the frontend can debounce and send only what changed.
   * Throws 400 if the component is already published — use update() +
   * the versions endpoint for post-publish iterations.
   */
  async saveDraft(id: string, user: AuthUser, dto: SaveDraftDto): Promise<Component> {
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new NotFoundException('Component not found');
    if (!component.isDraft) {
      throw new BadRequestException(
        'Component is already published. Use PATCH /components/:id to update metadata ' +
        'or POST /components/:id/versions to publish a new version.',
      );
    }

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

    // Update code/dependencies in-place on the current version.
    if ((dto.code !== undefined || dto.dependencies !== undefined) && component.currentVersionId) {
      const version = await this.versions.findOne({ where: { id: component.currentVersionId } });
      if (version) {
        if (dto.code !== undefined) {
          version.code = dto.code;
          embeddingRelevantChange = true;
        }
        if (dto.dependencies !== undefined) version.dependencies = dto.dependencies;
        await this.versions.save(version);
      }
    }

    if (dto.tagSlugs !== undefined) {
      // Replace all existing tags with the new set.
      await this.dataSource.transaction(async (trx) => {
        await trx.getRepository(ComponentTag).delete({ componentId: id });
        if (dto.tagSlugs!.length) await this.attachTags(trx, id, dto.tagSlugs!);
      });
    }

    const saved = await this.components.save(component);
    // No cache to bust — drafts are never cached.
    // Mark embedding as stale so publish() enqueues a fresh vector.
    if (embeddingRelevantChange) {
      saved.embeddingGeneratedAt = null;
      await this.components.save(saved);
    }
    return saved;
  }

  /**
   * Transitions a draft to published. Validates that the component has
   * the minimum viable content (name + code via currentVersion) before
   * making it visible, then enqueues the embedding job.
   */
  async publish(id: string, user: AuthUser): Promise<Component> {
    const component = await this.components.findOne({
      where: { id },
      relations: { componentTags: { tag: true } },
    });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new NotFoundException('Component not found');
    if (!component.isDraft) {
      throw new BadRequestException('Component is already published.');
    }
    if (!component.currentVersionId) {
      throw new BadRequestException('Draft has no code yet — save code before publishing.');
    }

    component.isDraft = false;
    const saved = await this.components.save(component);

    await Promise.all([
      this.cache.invalidateTags('feed:trending', `author:${user.id}`),
      this.embeddings.enqueue(id),
    ]);

    return saved;
  }

  async update(id: string, user: AuthUser, dto: UpdateComponentDto): Promise<Component> {
    const component = await this.components.findOne({ where: { id } });
    if (!component) throw new NotFoundException('Component not found');
    if (component.authorId !== user.id) throw new NotFoundException('Component not found');

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
    if (!component.isDraft) {
      await this.cache.invalidateTags(`component:${id}`, 'feed:trending');
    }
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
