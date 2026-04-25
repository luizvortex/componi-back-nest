import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';

import { QUEUE_EMBEDDINGS } from '../queue/queue.constants';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from './embedding-provider.interface';

export interface EmbeddingJob {
  componentId: string;
}

interface ComponentRow {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  tags: string | null;
  codeSnippet: string | null;
}

/**
 * Orchestrates embedding generation for components.
 *
 * Publish path (hot):
 *   ComponentsService → service.enqueue(id)
 *     → workers on : BullMQ job → processor → deliver(id)
 *     → workers off: deliver(id) inline (blocking, ~150ms)
 *
 * Search path:
 *   SemanticSearchService → provider.embedQuery(q) → Postgres <=>.
 *   Search does NOT go through the queue — a search query has a human
 *   waiting on the other end.
 *
 * The service never exposes the raw vector in its Nest-public methods —
 * vectors leave the process only as parameters to prepared SQL
 * statements. That keeps them out of logs and HTTP responses.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly enabled: boolean;
  private readonly workersEnabled: boolean;
  private readonly dimensions: number;

  constructor(
    @InjectQueue(QUEUE_EMBEDDINGS) private readonly queue: Queue<EmbeddingJob>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('embeddings.enabled', true);
    this.workersEnabled = config.get<boolean>('redis.queue.workersEnabled', true);
    this.dimensions = config.get<number>('embeddings.dimensions', 384);
  }

  /**
   * Request an embedding for a component. Safe to call without awaiting
   * in a request path — failures are logged, not propagated. Idempotent
   * via BullMQ's jobId (same componentId dedupes).
   */
  async enqueue(componentId: string): Promise<void> {
    if (!this.enabled) return;

    if (!this.workersEnabled) {
      try {
        await this.deliver(componentId);
      } catch (err) {
        this.logger.warn(
          `inline embedding failed for ${componentId}: ${(err as Error).message}`,
        );
      }
      return;
    }

    await this.queue.add(
      'embed',
      { componentId },
      {
        jobId: `embed:${componentId}`,
        // The publish-hook fires post-commit, so the row should already
        // be visible. A small delay helps when a burst of enqueues lands
        // before the read replicas catch up on deployments with replicas.
        delay: 250,
      },
    );
  }

  /**
   * Actual embedding write. Shared by the processor and the inline
   * fallback. Loads the current row, builds the input text, generates
   * the vector, writes with a parameterised UPDATE.
   *
   * A concurrent regeneration (fast update → new backfill enqueue →
   * old inline finishing) might overwrite with a slightly stale vector;
   * the next cron tick sees `embeddingGeneratedAt < updatedAt` and fixes
   * it. Acceptable given the eventual-consistency semantics.
   */
  async deliver(componentId: string): Promise<void> {
    if (!this.enabled) return;

    const [row] = (await this.dataSource.query(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.framework,
        (
          SELECT string_agg(t.slug, ', ' ORDER BY t.slug)
          FROM component_tags ct
          JOIN tags t ON t.id = ct."tagId"
          WHERE ct."componentId" = c.id
        ) AS tags,
        (
          SELECT LEFT(cv.code, 600)
          FROM component_versions cv
          WHERE cv.id = c."currentVersionId"
        ) AS "codeSnippet"
      FROM components c
      WHERE c.id = $1 AND c."deletedAt" IS NULL
      `,
      [componentId],
    )) as ComponentRow[];

    if (!row) {
      this.logger.debug(`component ${componentId} gone — skipping embedding`);
      return;
    }

    const input = this.assembleInput(row);
    const vector = await this.provider.embedPassage(input);
    if (vector.length !== this.dimensions) {
      throw new Error(
        `refusing to write embedding of dim ${vector.length}, expected ${this.dimensions}`,
      );
    }

    await this.dataSource.query(
      `
      UPDATE components
      SET "embedding" = $1::vector,
          "embeddingGeneratedAt" = NOW()
      WHERE id = $2
      `,
      [this.toPgVector(vector), componentId],
    );
  }

  /**
   * Exposes the query-side provider for SemanticSearchService so it
   * doesn't need a second DI binding. Private-by-intent — the search
   * service is the only outside caller.
   */
  embedQuery(text: string): Promise<Float32Array> {
    if (!this.enabled) {
      return Promise.reject(new Error('embeddings are disabled'));
    }
    return this.provider.embedQuery(text);
  }

  // ── helpers ─────────────────────────────────────────────────────────

  /**
   * Assembles the passage text that goes into the embedder. Kept
   * compact and deterministic so the same row always produces the same
   * vector, and the tokenizer never spends budget on noise.
   */
  private assembleInput(row: ComponentRow): string {
    const parts = [
      row.name,
      row.framework,
      row.description ?? '',
      row.tags ? `tags: ${row.tags}` : '',
      row.codeSnippet ? `code: ${row.codeSnippet.replace(/\s+/g, ' ')}` : '',
    ].filter(Boolean);
    return parts.join(' | ');
  }

  /**
   * pgvector accepts vectors as a text literal like `[0.1,0.2,-0.3,…]`.
   * The pg driver doesn't know the `vector` type natively, so we send
   * the string and let the server cast. Numbers are emitted with fixed
   * precision to keep index cache hits stable across restarts.
   */
  private toPgVector(vec: Float32Array): string {
    // 6 sig-digits — below the noise floor of int8-quantised E5 but
    // avoids the drift you'd get with full Float32 text round-trip.
    const chunks = new Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      chunks[i] = vec[i].toFixed(6);
    }
    return `[${chunks.join(',')}]`;
  }
}
