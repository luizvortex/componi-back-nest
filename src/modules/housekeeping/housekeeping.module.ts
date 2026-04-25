import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { EmbeddingsBackfillService } from './embeddings-backfill.service';
import { PurgeService } from './purge.service';

/**
 * Scheduled background maintenance — soft-delete retention, embedding
 * backfill, and any future periodic chores. EmbeddingsModule is global
 * so we don't need to import it explicitly.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [PurgeService, EmbeddingsBackfillService],
  exports: [PurgeService, EmbeddingsBackfillService],
})
export class HousekeepingModule {}
