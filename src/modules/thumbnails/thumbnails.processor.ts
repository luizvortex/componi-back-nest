import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_THUMBNAILS } from '../../common/queue/queue.constants';
import { ThumbnailJob, ThumbnailsService } from './thumbnails.service';

@Processor(QUEUE_THUMBNAILS)
export class ThumbnailsProcessor extends WorkerHost {
  private readonly logger = new Logger(ThumbnailsProcessor.name);

  constructor(private readonly thumbnails: ThumbnailsService) {
    super();
  }

  async process(job: Job<ThumbnailJob>): Promise<void> {
    try {
      await this.thumbnails.verify(job.data);
    } catch (err) {
      this.logger.warn(
        `verify failed for ${job.data.componentId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
