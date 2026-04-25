import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records which revision of docs/PRIVACY.md and docs/TERMS.md each user
 * agreed to, and when. The acceptance flow is handled by the app layer —
 * the DB just stores the outcome so a re-prompt on version bump is a
 * single comparison against the config string.
 *
 * Nullable columns: accounts created before this migration have NULL for
 * both, which the auth layer treats as "never accepted → needs prompt".
 */
export class UserConsentTracking1745200000000 implements MigrationInterface {
  name = 'UserConsentTracking1745200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "users"
      ADD COLUMN "privacyAcceptedAt" TIMESTAMPTZ,
      ADD COLUMN "privacyAcceptedVersion" text,
      ADD COLUMN "termsAcceptedAt" TIMESTAMPTZ,
      ADD COLUMN "termsAcceptedVersion" text
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "users"
      DROP COLUMN "termsAcceptedVersion",
      DROP COLUMN "termsAcceptedAt",
      DROP COLUMN "privacyAcceptedVersion",
      DROP COLUMN "privacyAcceptedAt"
    `);
  }
}
