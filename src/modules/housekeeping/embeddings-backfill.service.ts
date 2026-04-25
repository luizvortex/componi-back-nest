import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { EmbeddingsService } from '../../common/embeddings/embeddings.service';

interface PendingRow {
  id: string;
}

/**
 * Re-enqueues components whose embedding is missing or stale.
 *
 * "Stale" means `embeddingGeneratedAt < updatedAt - 5s` — the 5-second
 * grace prevents a race with the publish-hook write where the row is
 * saved a beat before the embedding job lands and would otherwise look
 * stale on the very next tick.
 *
 * Runs every 30 minutes at :07/:37 (off-the-hour to avoid clustering).
 * Batch capped at 50 per tick so a sudden flood doesn't saturate the
 * single-concurrency embeddings worker — natural backpressure via
 * BullMQ catches up over the next ticks.
 *
 * Idempotent: BullMQ jobId = `embed:<componentId>` dedupes within the
 * keep-on-complete window, so re-running the cron with the same set
 * doesn't multiply work.
 */
@Injectable()
export class EmbeddingsBackfillService {
  private readonly logger = new Logger(EmbeddingsBackfillService.name);
  private readonly enabled: boolean;
  private readonly batchSize = 50;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly embeddings: EmbeddingsService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('embeddings.enabled', true);
  }

  @Cron('7,37 * * * *', { name: 'embeddings-backfill', timeZone: 'UTC' })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    await this.run();
  }

  /**
   * Exposed for manual / CLI execution. Returns the count enqueued
   * so a caller (or a future admin endpoint) can report progress.
   */
  async run(): Promise<{ enqueued: number }> {
    const started = Date.now();

    // The partial index `IDX_components_embedding_pending` covers the
    // NULL branch directly; the stale branch falls back to the
    // `(updatedAt)` column index. ORDER BY updatedAt ASC drains the
    // oldest pending rows first.
    const rows = (await this.dataSource.query(
      `
      SELECT id FROM components
      WHERE "deletedAt" IS NULL
        AND "isPublic" = true
        AND (
          "embedding" IS NULL
          OR "embeddingGeneratedAt" IS NULL
          OR "embeddingGeneratedAt" < "updatedAt" - INTERVAL '5 seconds'
        )
      ORDER BY "updatedAt" ASC
      LIMIT $1
      `,
      [this.batchSize],
    )) as PendingRow[];

    for (const row of rows) {
      await this.embeddings.enqueue(row.id);
    }

    if (rows.length) {
      this.logger.log(
        `enqueued ${rows.length} stale/missing embeddings in ${Date.now() - started}ms`,
      );
    }
    return { enqueued: rows.length };
  }
}
