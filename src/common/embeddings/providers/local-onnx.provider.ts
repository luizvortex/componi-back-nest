import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmbeddingProvider } from '../embedding-provider.interface';

type FeatureExtractionPipeline = (
  texts: string | string[],
  options?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

/**
 * Runs a HuggingFace-compatible embedding model locally in-process via
 * @xenova/transformers (ONNX runtime under the hood). No network calls
 * after the initial model download, no API keys, zero per-request cost.
 *
 * Concurrency model: Transformers.js is single-threaded per JS runtime.
 * We serialise calls with a promise-chain queue so two concurrent
 * requests don't corrupt the pipeline's internal buffers. BullMQ worker
 * concurrency for the embeddings queue is pinned to 1 for the same
 * reason (see EmbeddingsModule).
 *
 * Why `await import()` instead of a top-level `import`:
 * @xenova/transformers ships as ESM-only. NestJS compiles to CommonJS
 * by default, so a static import would fail at require-time. Dynamic
 * import lets the CommonJS runtime load an ESM package at runtime.
 */
@Injectable()
export class LocalOnnxEmbeddingProvider
  implements EmbeddingProvider, OnApplicationBootstrap
{
  private readonly logger = new Logger(LocalOnnxEmbeddingProvider.name);
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
  private inflight: Promise<unknown> = Promise.resolve();

  readonly dimensions: number;
  private readonly modelId: string;
  private readonly maxInputChars: number;
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('embeddings.enabled', true);
    this.modelId = config.get<string>('embeddings.model', 'Xenova/multilingual-e5-small');
    this.dimensions = config.get<number>('embeddings.dimensions', 384);
    this.maxInputChars = config.get<number>('embeddings.maxInputChars', 1800);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('embeddings disabled — skipping model load');
      return;
    }
    // Fire-and-forget warmup. We don't block boot on the model load —
    // health checks would flap during the 10-20s download window on a
    // cold container. Queries that hit before warmup completes simply
    // await the same in-flight promise.
    this.warmup().catch((err) =>
      this.logger.error(`warmup failed: ${(err as Error).message}`),
    );
  }

  async warmup(): Promise<void> {
    if (!this.enabled) {
      throw new Error('embeddings are disabled (EMBEDDINGS_ENABLED=false)');
    }
    const pipe = await this.getPipeline();
    // Force a single forward pass so weights are resident and the JIT
    // caches are warm before the first real query arrives.
    await pipe('query: warmup', { pooling: 'mean', normalize: true });
    this.logger.log(`model ready: ${this.modelId} (${this.dimensions} dims)`);
  }

  embedPassage(text: string): Promise<Float32Array> {
    return this.embed(`passage: ${this.clip(text)}`);
  }

  embedQuery(text: string): Promise<Float32Array> {
    return this.embed(`query: ${this.clip(text)}`);
  }

  // ──────────────────────────────────────────────────────────────────

  private async embed(prefixedText: string): Promise<Float32Array> {
    if (!this.enabled) {
      throw new Error('embeddings are disabled');
    }
    const pipe = await this.getPipeline();
    // Serialise concurrent calls — the underlying ORT session is NOT
    // safe for parallel invocation within the same process.
    const run = this.inflight.then(async () => {
      const out = await pipe(prefixedText, { pooling: 'mean', normalize: true });
      const vec = out.data;
      if (!(vec instanceof Float32Array) || vec.length !== this.dimensions) {
        throw new Error(
          `embedding shape mismatch: got ${vec?.length}, expected ${this.dimensions}`,
        );
      }
      return vec;
    });
    // Keep the chain alive but don't let a failed call poison the next one.
    this.inflight = run.catch(() => undefined);
    return run;
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.loadPipeline();
    }
    return this.pipelinePromise;
  }

  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    this.logger.log(`loading ${this.modelId}…`);
    const start = Date.now();
    // Dynamic import keeps the ESM-only @xenova/transformers happy under CJS.
    const { pipeline, env } = await import('@xenova/transformers');
    // Point the lib at a persistent cache dir if the env asks for one —
    // in Docker we pre-fetch the model during build and mount the cache
    // into the runtime stage (see Dockerfile).
    const cacheDir = process.env.TRANSFORMERS_CACHE;
    if (cacheDir) {
      env.cacheDir = cacheDir;
    }
    // Never let the lib silently fall back to a remote call we didn't
    // ask for — we want strictly local inference after the initial fetch.
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    const pipe = (await pipeline('feature-extraction', this.modelId, {
      quantized: true,
    })) as unknown as FeatureExtractionPipeline;
    this.logger.log(`loaded in ${Date.now() - start}ms`);
    return pipe;
  }

  private clip(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length <= this.maxInputChars) return trimmed;
    return trimmed.slice(0, this.maxInputChars);
  }
}
