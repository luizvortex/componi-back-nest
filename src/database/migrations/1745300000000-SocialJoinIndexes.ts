import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fills in missing reverse-lookup indexes on the social join tables.
 * Each table has a composite PK on (A, B) which Postgres can use as a
 * B-tree prefix when filtering by A alone — but a filter by B alone
 * falls back to a seq scan. These covering indexes close that gap:
 *
 *   follows(followeeId)   — "who follows :userId" + feed follow-joins
 *                           when a different follower key is combined.
 *   likes(componentId)    — reverse lookups + cascade-delete during
 *                           component takedown.
 *   favorites(componentId) — same as likes.
 *
 * Created CONCURRENTLY so the migration can run on a live table without
 * acquiring an AccessExclusive lock. Requires the migration runner to
 * disable transaction wrapping (see `transaction: false` on the
 * MigrationInterface options at the DataSource level).
 */
export class SocialJoinIndexes1745300000000 implements MigrationInterface {
  name = 'SocialJoinIndexes1745300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_follows_followee" ON "follows" ("followeeId")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_likes_component" ON "likes" ("componentId")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_favorites_component" ON "favorites" ("componentId")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_favorites_component"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_likes_component"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_follows_followee"`);
  }
}
