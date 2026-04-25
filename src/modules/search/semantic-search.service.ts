import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

import { CacheService } from '../../common/cache/cache.service';
import { EmbeddingsService } from '../../common/embeddings/embeddings.service';
import type { AuthUser } from '../../common/types/auth-user.type';

export interface SemanticHit {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  framework: string;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  thumbnailUrl: string | null;
  likesCount: number;
  createdAt: Date;
  /**
   * Cosine distance from the query — lower = more similar.
   * 0 = identical direction, 2 = opposite. Values close to 1 are "unrelated".
   */
  distance: number;
}

/**
 * Nearest-neighbour search over the `components.embedding` column.
 *
 * Security-critical invariants:
 * - Vector literals are built from a *validated* Float32Array — the
 *   only way user input reaches SQL is as a prepared parameter.
 *   The query text never appears in SQL directly.
 * - The embedding column is never selected (bandwidth + leak-avoidance).
 * - Block-either-way filter matches the rest of the app so a blocked
 *   user's components don't leak through semantic results.
 * - Only public, not-soft-deleted components are candidates.
 */
@Injectable()
export class SemanticSearchService {
  private readonly enabled: boolean;
  private readonly maxQueryChars: number;
  private readonly dimensions: number;
  private readonly cacheTtl: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly embeddings: EmbeddingsService,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('embeddings.enabled', true);
    this.maxQueryChars = config.get<number>('embeddings.maxQueryChars', 200);
    this.dimensions = config.get<number>('embeddings.dimensions', 384);
    this.cacheTtl = config.get<number>('embeddings.searchCacheTtlSeconds', 300);
  }

  async search(
    rawQuery: string,
    rawLimit: number | undefined,
    viewer?: AuthUser,
  ): Promise<SemanticHit[]> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Semantic search is disabled on this deployment',
      );
    }

    const query = (rawQuery ?? '').trim();
    if (query.length < 2) {
      throw new BadRequestException('Query must be at least 2 characters');
    }
    if (query.length > this.maxQueryChars) {
      throw new BadRequestException(
        `Query must be at most ${this.maxQueryChars} characters`,
      );
    }
    const limit = Math.min(Math.max(rawLimit ?? 20, 1), 50);

    // Cache key includes viewer so block-filtered results don't leak
    // across users. For anonymous callers the key falls back to a
    // stable "public" bucket to maximise hit rate.
    const viewerKey = viewer?.id ?? 'anon';
    const queryHash = createHash('sha256').update(query).digest('hex').slice(0, 16);
    const cacheKey = `search:semantic:${viewerKey}:${queryHash}:${limit}`;

    return this.cache.wrap(
      cacheKey,
      async () => this.runQuery(query, limit, viewer),
      { ttlSeconds: this.cacheTtl, tags: ['search:semantic'] },
    );
  }

  // ──────────────────────────────────────────────────────────────────

  private async runQuery(
    query: string,
    limit: number,
    viewer: AuthUser | undefined,
  ): Promise<SemanticHit[]> {
    const vector = await this.embeddings.embedQuery(query);
    if (vector.length !== this.dimensions) {
      // Defence-in-depth: provider contract already validates this, but
      // we double-check before composing a SQL literal.
      throw new ServiceUnavailableException('Embedding dimension mismatch');
    }

    const literal = this.toPgVector(vector);
    const viewerId = viewer?.id ?? null;

    // IMPORTANT: `embedding` is NOT in the SELECT. Emitting it would
    // add 1.5 KB × N rows of bandwidth per response.
    const rows = (await this.dataSource.query(
      `
      SELECT
        c.id,
        c.slug,
        c.name,
        c.description,
        c.framework,
        c."authorId",
        u.username AS "authorUsername",
        u."displayName" AS "authorDisplayName",
        c."thumbnailUrl",
        c."likesCount",
        c."createdAt",
        c.embedding <=> $1::vector AS distance
      FROM components c
      LEFT JOIN users u ON u.id = c."authorId"
      WHERE c."deletedAt" IS NULL
        AND c."isPublic" = true
        AND c.embedding IS NOT NULL
        AND (
          $2::uuid IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM blocks b
            WHERE (b."blockerId" = $2 AND b."blockedId" = c."authorId")
               OR (b."blockerId" = c."authorId" AND b."blockedId" = $2)
          )
        )
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      [literal, viewerId, limit],
    )) as SemanticHit[];

    return rows;
  }

  private toPgVector(vec: Float32Array): string {
    const chunks = new Array<string>(vec.length);
    for (let i = 0; i < vec.length; i++) {
      chunks[i] = vec[i].toFixed(6);
    }
    return `[${chunks.join(',')}]`;
  }
}
