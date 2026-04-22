import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the moderation + admin schema:
 *
 *   users.role, users.suspendedUntil, users.suspensionReason
 *   blocks          — bidirectional visibility wall (symmetric hide)
 *   mutes           — one-way, silent filter
 *   reports         — abuse queue for moderators
 *   audit_logs      — append-only trail of privileged actions
 *
 * The `role` column is protected by a CHECK constraint at the DB layer.
 * RLS policies (supabase/rls.sql) further block direct UPDATEs so even
 * a compromised service_role key cannot self-escalate — role promotion
 * goes through the `admin:promote` CLI (requires DBA-held bootstrap
 * secret) or manual SQL.
 *
 * `audit_logs` is write-once: RLS rejects UPDATE and DELETE for every
 * role, including service_role. Retention is handled at the DBA level.
 */
export class ModerationAndAdmin1745100000000 implements MigrationInterface {
  name = 'ModerationAndAdmin1745100000000';

  async up(q: QueryRunner): Promise<void> {
    // ── users: role + suspension ───────────────────────────────────────
    await q.query(`
      ALTER TABLE "users"
      ADD COLUMN "role" text NOT NULL DEFAULT 'user',
      ADD COLUMN "suspendedUntil" TIMESTAMPTZ,
      ADD COLUMN "suspensionReason" text
    `);
    await q.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_role"
      CHECK ("role" IN ('user', 'moderator', 'admin'))
    `);
    await q.query(`CREATE INDEX "IDX_users_role" ON "users" ("role") WHERE "role" <> 'user'`);
    await q.query(
      `CREATE INDEX "IDX_users_suspendedUntil" ON "users" ("suspendedUntil") WHERE "suspendedUntil" IS NOT NULL`,
    );

    // ── blocks ─────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "blocks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "blockerId" uuid NOT NULL,
        "blockedId" uuid NOT NULL,
        "reason" text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blocks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_blocks_blocker" FOREIGN KEY ("blockerId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_blocks_blocked" FOREIGN KEY ("blockedId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_blocks_self" CHECK ("blockerId" <> "blockedId")
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_blocks_pair" ON "blocks" ("blockerId", "blockedId")`,
    );
    await q.query(`CREATE INDEX "IDX_blocks_blocked" ON "blocks" ("blockedId")`);

    // ── mutes ──────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "mutes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "muterId" uuid NOT NULL,
        "mutedId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mutes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mutes_muter" FOREIGN KEY ("muterId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mutes_muted" FOREIGN KEY ("mutedId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_mutes_self" CHECK ("muterId" <> "mutedId")
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_mutes_pair" ON "mutes" ("muterId", "mutedId")`,
    );

    // ── reports ────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reporterId" uuid NOT NULL,
        "targetType" text NOT NULL,
        "targetId" uuid NOT NULL,
        "reason" text NOT NULL,
        "details" text,
        "status" text NOT NULL DEFAULT 'open',
        "resolvedById" uuid,
        "resolvedAt" TIMESTAMPTZ,
        "resolutionNote" text,
        "actionTaken" text NOT NULL DEFAULT 'none',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reports_reporter" FOREIGN KEY ("reporterId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reports_resolvedBy" FOREIGN KEY ("resolvedById")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_reports_targetType"
          CHECK ("targetType" IN ('component', 'comment', 'user')),
        CONSTRAINT "CHK_reports_reason"
          CHECK ("reason" IN ('spam','harassment','malicious_code','copyright','nsfw','impersonation','other')),
        CONSTRAINT "CHK_reports_status"
          CHECK ("status" IN ('open','reviewing','actioned','dismissed')),
        CONSTRAINT "CHK_reports_action"
          CHECK ("actionTaken" IN ('none','warned','content_removed','user_suspended','user_banned'))
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_reports_status_created" ON "reports" ("status", "createdAt")`,
    );
    await q.query(
      `CREATE INDEX "IDX_reports_target" ON "reports" ("targetType", "targetId", "status")`,
    );
    await q.query(
      `CREATE INDEX "IDX_reports_reporter" ON "reports" ("reporterId", "createdAt")`,
    );
    // One open report per (reporter, target) — reopen allowed after resolution.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_reports_open_per_reporter"
         ON "reports" ("reporterId", "targetType", "targetId")
         WHERE "status" IN ('open', 'reviewing')`,
    );

    // ── audit_logs ─────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actorId" uuid NOT NULL,
        "action" text NOT NULL,
        "targetType" text,
        "targetId" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "reason" text,
        "ipAddress" inet,
        "userAgent" text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_actor" FOREIGN KEY ("actorId")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_audit_actor_created" ON "audit_logs" ("actorId", "createdAt")`,
    );
    await q.query(
      `CREATE INDEX "IDX_audit_target" ON "audit_logs" ("targetType", "targetId", "createdAt")`,
    );
    await q.query(
      `CREATE INDEX "IDX_audit_action_created" ON "audit_logs" ("action", "createdAt")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await q.query(`DROP TABLE IF EXISTS "reports"`);
    await q.query(`DROP TABLE IF EXISTS "mutes"`);
    await q.query(`DROP TABLE IF EXISTS "blocks"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_users_suspendedUntil"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_users_role"`);
    await q.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_role"`);
    await q.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "suspensionReason",
      DROP COLUMN IF EXISTS "suspendedUntil",
      DROP COLUMN IF EXISTS "role"
    `);
  }
}
