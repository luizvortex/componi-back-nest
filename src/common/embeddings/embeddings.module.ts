import { BullModule } from '@nestjs/bullmq';
import { Global, Module, Provider } from '@nestjs/common';

import { QUEUE_EMBEDDINGS } from '../queue/queue.constants';
import { EMBEDDING_PROVIDER } from './embedding-provider.interface';
import { EmbeddingsProcessor } from './embeddings.processor';
import { EmbeddingsService } from './embeddings.service';
import { LocalOnnxEmbeddingProvider } from './providers/local-onnx.provider';

/**
 * Global so ComponentsService, SemanticSearchService and the backfill
 * cron all inject EmbeddingsService without forming circular imports.
 * The concrete provider is bound behind EMBEDDING_PROVIDER so a future
 * remote/Ollama variant is a single-line swap here.
 */
const workersEnabled = process.env.QUEUE_WORKERS_ENABLED !== 'false';
const workerProviders: Provider[] = workersEnabled ? [EmbeddingsProcessor] : [];

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_EMBEDDINGS })],
  providers: [
    LocalOnnxEmbeddingProvider,
    {
      provide: EMBEDDING_PROVIDER,
      useExisting: LocalOnnxEmbeddingProvider,
    },
    EmbeddingsService,
    ...workerProviders,
  ],
  exports: [EmbeddingsService, EMBEDDING_PROVIDER],
})
export class EmbeddingsModule {}
