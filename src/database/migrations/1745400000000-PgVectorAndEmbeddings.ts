import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enables pgvector and adds a semantic-embedding column to `components`
 * plus an HNSW index for sub-20ms nearest-neighbour lookup at 10-50k rows.
 *
 * The column is a fixed-size vector(384) — dimension of the
 * multilingual-e5-small ONNX model we run locally via Transformers.js.
 * Changing the model later means bumping the dimension, which is a
 * rewrite of the column (acceptable because the embedding is derived
 * data — a backfill cron regenerates it).
 *
 * The HNSW index is **partial** on `deletedAt IS NULL AND isPublic` so
 * soft-deleted or private components don't bloat the index. Private
 * components aren't searchable semantically anyway — they surface only
 * through the owner-scoped list path.
 *
 * IMPORTANT: `CREATE EXTENSION vector` needs a role with CREATE ON
 * DATABASE privilege. On Supabase this works with the default `postgres`
 * role; on other PGs the DBA may need to enable it ahead of time.
 */
export class PgVectorAndEmbeddings1745400000000 implements MigrationInterface {
  name = 'PgVectorAndEmbeddings1745400000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await q.query(`
      ALTER TABLE "components"
      ADD COLUMN "embedding" vector(384),
      ADD COLUMN "embeddingGeneratedAt" TIMESTAMPTZ
    `);

    // HNSW over cosine distance. m=16, ef_construction=64 are the
    // library defaults and give a solid recall/build-cost balance for
    // our row counts. Tune if recall@10 falls below 0.95 in practice.
    await q.query(`
      CREATE INDEX "IDX_components_embedding"
      ON "components"
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
      WHERE "deletedAt" IS NULL AND "isPublic" = true
    `);

    // Backfill helper index — lets the retry cron cheaply find
    // components that still need an embedding generated.
    await q.query(`
      CREATE INDEX "IDX_components_embedding_pending"
      ON "components" ("updatedAt")
      WHERE "embedding" IS NULL AND "deletedAt" IS NULL AND "isPublic" = true
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_components_embedding_pending"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_components_embedding"`);
    await q.query(`
      ALTER TABLE "components"
      DROP COLUMN IF EXISTS "embeddingGeneratedAt",
      DROP COLUMN IF EXISTS "embedding"
    `);
    // Intentionally NOT dropping the vector extension — other tables
    // may start using it before this down migration ever runs.
  }
}
