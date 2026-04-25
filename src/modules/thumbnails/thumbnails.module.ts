import { BullModule } from '@nestjs/bullmq';
import { Module, Provider } from '@nestjs/common';

import { QUEUE_THUMBNAILS } from '../../common/queue/queue.constants';
import { ThumbnailsProcessor } from './thumbnails.processor';
import { ThumbnailsService } from './thumbnails.service';

const workersEnabled = process.env.QUEUE_WORKERS_ENABLED !== 'false';
const workerProviders: Provider[] = workersEnabled ? [ThumbnailsProcessor] : [];

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_THUMBNAILS })],
  providers: [ThumbnailsService, ...workerProviders],
  exports: [ThumbnailsService],
})
export class ThumbnailsModule {}
