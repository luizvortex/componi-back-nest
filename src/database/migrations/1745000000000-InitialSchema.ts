import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstraps the full Componi v1 schema.
 *
 * Column names mirror the TypeORM entities (camelCase) — this matches the
 * default naming strategy. If you ever switch to snake_case, regenerate.
 *
 * Apply RLS policies separately via supabase/rls.sql.
 */
export class InitialSchema1745000000000 implements MigrationInterface {
  name = 'InitialSchema1745000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await q.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL,
        "email" text NOT NULL,
        "username" text NOT NULL,
        "githubUsername" text,
        "displayName" text,
        "avatarUrl" text,
        "bio" text,
        "websiteUrl" text,
        "followersCount" integer NOT NULL DEFAULT 0,
        "followingCount" integer NOT NULL DEFAULT 0,
        "componentsCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email") WHERE "deletedAt" IS NULL`);
    await q.query(`CREATE UNIQUE INDEX "UQ_users_username" ON "users" (lower("username")) WHERE "deletedAt" IS NULL`);
    await q.query(`CREATE INDEX "IDX_users_username_trgm" ON "users" USING gin ("username" gin_trgm_ops)`);
    await q.query(`CREATE INDEX "IDX_users_displayName_trgm" ON "users" USING gin ("displayName" gin_trgm_ops)`);

    await q.query(`
      CREATE TABLE "components" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "authorId" uuid NOT NULL,
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "framework" text NOT NULL DEFAULT 'react',
        "category" text,
        "thumbnailUrl" text,
        "isPublic" boolean NOT NULL DEFAULT true,
        "currentVersionId" uuid,
        "forkedFromId" uuid,
        "forksCount" integer NOT NULL DEFAULT 0,
        "likesCount" integer NOT NULL DEFAULT 0,
        "favoritesCount" integer NOT NULL DEFAULT 0,
        "commentsCount" integer NOT NULL DEFAULT 0,
        "viewsCount" integer NOT NULL DEFAULT 0,
        "sharesCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_components" PRIMARY KEY ("id"),
        CONSTRAINT "FK_components_author" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_components_forkedFrom" FOREIGN KEY ("forkedFromId") REFERENCES "components"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "UQ_components_author_slug" ON "components" ("authorId", "slug") WHERE "deletedAt" IS NULL`);
    await q.query(`CREATE INDEX "IDX_components_author_createdAt" ON "components" ("authorId", "createdAt" DESC) WHERE "deletedAt" IS NULL`);
    await q.query(`CREATE INDEX "IDX_components_public_createdAt" ON "components" ("isPublic", "createdAt" DESC) WHERE "deletedAt" IS NULL`);
    await q.query(`CREATE INDEX "IDX_components_forkedFrom" ON "components" ("forkedFromId") WHERE "forkedFromId" IS NOT NULL`);
    await q.query(`CREATE INDEX "IDX_components_name_trgm" ON "components" USING gin ("name" gin_trgm_ops)`);
    await q.query(`CREATE INDEX "IDX_components_description_trgm" ON "components" USING gin ("description" gin_trgm_ops)`);

    await q.query(`
      CREATE TABLE "component_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "componentId" uuid NOT NULL,
        "version" integer NOT NULL,
        "code" text NOT NULL,
        "dependencies" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "entryFile" text,
        "changelog" text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_component_versions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_component_version" UNIQUE ("componentId", "version"),
        CONSTRAINT "FK_versions_component" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_versions_component_createdAt" ON "component_versions" ("componentId", "createdAt" DESC)`);
    await q.query(`ALTER TABLE "components" ADD CONSTRAINT "FK_components_currentVersion" FOREIGN KEY ("currentVersionId") REFERENCES "component_versions"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED`);

    await q.query(`
      CREATE TABLE "tags" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "usageCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tags" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "UQ_tags_slug" ON "tags" ("slug")`);
    await q.query(`CREATE INDEX "IDX_tags_usageCount" ON "tags" ("usageCount" DESC)`);

    await q.query(`
      CREATE TABLE "component_tags" (
        "componentId" uuid NOT NULL,
        "tagId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_component_tags" PRIMARY KEY ("componentId", "tagId"),
        CONSTRAINT "FK_ct_component" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ct_tag" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_ct_tag" ON "component_tags" ("tagId")`);

    await q.query(`
      CREATE TABLE "likes" (
        "userId" uuid NOT NULL,
        "componentId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_likes" PRIMARY KEY ("userId", "componentId"),
        CONSTRAINT "FK_likes_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_likes_component" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_likes_component" ON "likes" ("componentId")`);

    await q.query(`
      CREATE TABLE "favorites" (
        "userId" uuid NOT NULL,
        "componentId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_favorites" PRIMARY KEY ("userId", "componentId"),
        CONSTRAINT "FK_favorites_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_favorites_component" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_favorites_component" ON "favorites" ("componentId")`);

    await q.query(`
      CREATE TABLE "comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "componentId" uuid NOT NULL,
        "authorId" uuid NOT NULL,
        "parentId" uuid,
        "body" text NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_comments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_comments_component" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comments_author" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comments_parent" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_comments_component_createdAt" ON "comments" ("componentId", "createdAt" DESC) WHERE "deletedAt" IS NULL`);
    await q.query(`CREATE INDEX "IDX_comments_author" ON "comments" ("authorId") WHERE "deletedAt" IS NULL`);

    await q.query(`
      CREATE TABLE "follows" (
        "followerId" uuid NOT NULL,
        "followeeId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_follows" PRIMARY KEY ("followerId", "followeeId"),
        CONSTRAINT "chk_follow_not_self" CHECK ("followerId" <> "followeeId"),
        CONSTRAINT "FK_follows_follower" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_follows_followee" FOREIGN KEY ("followeeId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_follows_followee" ON "follows" ("followeeId")`);

    await q.query(`
      CREATE TABLE "collections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ownerId" uuid NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "isPublic" boolean NOT NULL DEFAULT false,
        "componentsCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_collections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_collections_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_collections_owner_createdAt" ON "collections" ("ownerId", "createdAt" DESC) WHERE "deletedAt" IS NULL`);

    await q.query(`
      CREATE TABLE "collection_components" (
        "collectionId" uuid NOT NULL,
        "componentId" uuid NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_collection_components" PRIMARY KEY ("collectionId", "componentId"),
        CONSTRAINT "FK_cc_collection" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cc_component" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_cc_component" ON "collection_components" ("componentId")`);

    await q.query(`
      CREATE TABLE "shares" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "componentId" uuid NOT NULL,
        "userId" uuid,
        "channel" text NOT NULL DEFAULT 'link',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shares" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shares_component" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shares_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "IDX_shares_component_createdAt" ON "shares" ("componentId", "createdAt" DESC)`);

    await q.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "actorId" uuid,
        "type" text NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "readAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_notifications_user_createdAt" ON "notifications" ("userId", "createdAt" DESC)`);
    await q.query(`CREATE INDEX "IDX_notifications_user_unread" ON "notifications" ("userId", "createdAt" DESC) WHERE "readAt" IS NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "notifications" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "shares" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "collection_components" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "collections" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "follows" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "comments" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "favorites" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "likes" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "component_tags" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "tags" CASCADE`);
    await q.query(`ALTER TABLE "components" DROP CONSTRAINT IF EXISTS "FK_components_currentVersion"`);
    await q.query(`DROP TABLE IF EXISTS "component_versions" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "components" CASCADE`);
    await q.query(`DROP TABLE IF EXISTS "users" CASCADE`);
  }
}
