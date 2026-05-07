import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComponentDraftStatus1745500000000 implements MigrationInterface {
  name = 'ComponentDraftStatus1745500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add isDraft column — drafts are hidden from all public feeds and
    // visible only to the author until explicitly published.
    await queryRunner.query(
      `ALTER TABLE "components" ADD "isDraft" boolean NOT NULL DEFAULT false`,
    );

    // Partial index: only indexes rows where isDraft = true so the
    // listDrafts query is fast without paying storage on published rows.
    await queryRunner.query(
      `CREATE INDEX "idx_components_is_draft_author"
       ON "components" ("authorId")
       WHERE "isDraft" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_components_is_draft_author"`);
    await queryRunner.query(`ALTER TABLE "components" DROP COLUMN "isDraft"`);
  }
}
