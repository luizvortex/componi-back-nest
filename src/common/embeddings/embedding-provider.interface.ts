/**
 * Pluggable embedding backend. The default implementation runs a local
 * ONNX model via @xenova/transformers; alternatives (HuggingFace
 * Inference API, Voyage, an internal microservice) can be swapped by
 * providing a different binding for `EMBEDDING_PROVIDER`.
 *
 * Implementations MUST:
 *   - return a fixed-dimension Float32Array matching the configured
 *     `embeddings.dimensions`.
 *   - L2-normalise the output (every caller assumes unit vectors —
 *     pgvector's `<=>` cosine operator is numerically cleaner then).
 *   - be thread-safe / reentrant: multiple concurrent embed() calls
 *     must not corrupt internal state.
 *
 * Error handling: throw; callers wrap with a retry via BullMQ.
 */
export interface EmbeddingProvider {
  /**
   * Preloads any heavy state (model weights, tokenizer). Called once at
   * bootstrap. Safe to call multiple times — implementations must be
   * idempotent.
   */
  warmup(): Promise<void>;

  /**
   * Embed a document (the text we're *indexing* — a component's
   * assembled input). Implementations may add a task prefix like E5's
   * `passage:` internally.
   */
  embedPassage(text: string): Promise<Float32Array>;

  /**
   * Embed a search query. Kept separate from `embedPassage` because
   * asymmetric retrieval models (E5, BGE, GTE) require different
   * prefixes for documents vs queries — embedding a query as a passage
   * degrades recall noticeably.
   */
  embedQuery(text: string): Promise<Float32Array>;

  /** Declared output dimension — used for sanity checks. */
  readonly dimensions: number;
}

/** DI token for providers. */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
