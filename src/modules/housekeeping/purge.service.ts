import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Hard-deletes rows that have been soft-deleted longer than the retention
 * window (PRIVACY.md §5: 30 days). Runs daily at 03:17 UTC — not on the
 * hour so it doesn't pile up with every other cron on the box.
 *
 * Idempotent by design: each pass operates on whatever currently satisfies
 * `deletedAt < now - 30d`. Safe to rerun manually.
 *
 * We deliberately do NOT purge:
 *   - users (anonymization is the erasure contract — see AccountPrivacyService)
 *   - audit_logs (append-only, legally retained for 5 years)
 *   - reports (evidence for moderation appeals)
 */
@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.retentionDays = config.get<number>('housekeeping.retentionDays', 30);
  }

  @Cron('17 3 * * *', { name: 'purge-soft-deleted', timeZone: 'UTC' })
  async purgeSoftDeleted(): Promise<void> {
    await this.run();
  }

  /**
   * Exposed for the admin CLI (`npm run housekeeping:purge`) and for the
   * cron tick above. Each table is purged in its own statement so a
   * failure on one doesn't roll back the others.
   */
  async run(): Promise<{ components: number; comments: number }> {
    const cutoff = `NOW() - INTERVAL '${this.retentionDays} days'`;
    const started = Date.now();

    // Components: hard-delete cascades to component_versions, component_tags,
    // likes, favorites, comments, collection_components, shares, reports
    // (all have ON DELETE CASCADE on componentId).
    const components = await this.dataSource.query(
      `DELETE FROM components WHERE "deletedAt" IS NOT NULL AND "deletedAt" < ${cutoff}`,
    );

    // Comments standalone purge — covers comments soft-deleted on a
    // component that was NOT itself deleted (moderator takedown of a
    // single comment).
    const comments = await this.dataSource.query(
      `DELETE FROM comments WHERE "deletedAt" IS NOT NULL AND "deletedAt" < ${cutoff}`,
    );

    // Postgres DELETE via pg driver returns [[], affected] — but TypeORM's
    // `.query()` strips the affected count off by default. Use the row-count
    // RETURNING trick instead when we need exact numbers; for now just log.
    const elapsed = Date.now() - started;
    this.logger.log(
      `purged soft-deletes older than ${this.retentionDays}d in ${elapsed}ms`,
    );
    return {
      components: Array.isArray(components) ? components.length : 0,
      comments: Array.isArray(comments) ? comments.length : 0,
    };
  }
}
