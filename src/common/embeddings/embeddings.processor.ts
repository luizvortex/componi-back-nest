import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_EMBEDDINGS } from '../queue/queue.constants';
import { EmbeddingJob, EmbeddingsService } from './embeddings.service';

/**
 * BullMQ consumer. Delivery logic lives on EmbeddingsService.deliver so
 * the inline fallback (workers off) and the queued path share code.
 * Only registered in the module when `redis.queue.workersEnabled` is
 * true (see EmbeddingsModule).
 *
 * Concurrency is capped at 1 in the queue worker config — the ONNX
 * session isn't safe for concurrent calls within a single process, and
 * embedding is CPU-bound so parallelism wouldn't help latency anyway.
 */
@Processor(QUEUE_EMBEDDINGS, { concurrency: 1 })
export class EmbeddingsProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingsProcessor.name);

  constructor(private readonly embeddings: EmbeddingsService) {
    super();
  }

  async process(job: Job<EmbeddingJob>): Promise<void> {
    try {
      await this.embeddings.deliver(job.data.componentId);
    } catch (err) {
      this.logger.error(
        `embed failed for ${job.data.componentId}: ${(err as Error).message}`,
      );
      throw err; // let BullMQ retry per defaultJobOptions
    }
  }
}
