import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { QUEUE_THUMBNAILS } from '../../common/queue/queue.constants';

export interface ThumbnailJob {
  componentId: string;
  /** Public URL of the already-uploaded image. HEAD-checked by the worker. */
  thumbnailUrl: string;
}

/**
 * Thin wrapper around the thumbnails BullMQ queue. Today the "processing"
 * is just a reachability check — the image itself is uploaded client-side
 * to Supabase Storage and the URL is stored on the component. When the
 * platform grows past this we swap the processor for a real generator
 * (sharp, vercel/og, playwright-based screenshotting) without touching
 * callers here.
 */
@Injectable()
export class ThumbnailsService {
  private readonly logger = new Logger(ThumbnailsService.name);
  private readonly workersEnabled: boolean;

  constructor(
    @InjectQueue(QUEUE_THUMBNAILS) private readonly queue: Queue<ThumbnailJob>,
    config: ConfigService,
  ) {
    this.workersEnabled = config.get<boolean>('redis.queue.workersEnabled', true);
  }

  /**
   * Queue a thumbnail verification job. When workers are off the check
   * runs inline (it's a cheap HEAD request). Not awaited aggressively —
   * a bad URL is surfaced through logs rather than a 5xx on the set
   * endpoint, because the user already committed to the URL via Supabase.
   */
  async enqueue(job: ThumbnailJob): Promise<void> {
    if (!this.workersEnabled) {
      this.verify(job).catch((err) =>
        this.logger.warn(
          `inline thumbnail check failed for ${job.componentId}: ${(err as Error).message}`,
        ),
      );
      return;
    }
    await this.queue.add('verify', job, {
      jobId: `verify:${job.componentId}`,
    });
  }

  /**
   * Shared delivery path — invoked by the processor and by the inline
   * fallback. HEAD the URL to confirm the upload landed AND that what
   * landed is actually an image. The signed-upload flow lets the client
   * choose the Content-Type at PUT time, so an attacker could ask for
   * an image/* signed URL and then upload an HTML payload with
   * Content-Type: text/html — when the public URL is later served, the
   * browser would render it inline. Failing the verify here causes the
   * thumbnail URL to stay flagged in logs so the row can be cleaned up.
   */
  async verify(job: ThumbnailJob): Promise<void> {
    const res = await fetch(job.thumbnailUrl, { method: 'HEAD' });
    if (!res.ok) {
      throw new Error(`HEAD ${job.thumbnailUrl} returned ${res.status}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(
        `unexpected content-type "${contentType}" for ${job.thumbnailUrl}`,
      );
    }
  }
}
