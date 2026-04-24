import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { PurgeService } from './purge.service';

/**
 * Scheduled background maintenance. Currently just the soft-delete
 * retention cron; more cleanup jobs (stale sessions, orphaned uploads)
 * will land here as they surface.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [PurgeService],
  exports: [PurgeService],
})
export class HousekeepingModule {}
