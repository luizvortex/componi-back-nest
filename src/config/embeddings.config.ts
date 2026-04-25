import { registerAs } from '@nestjs/config';

/**
 * Local ONNX embedding generation via @xenova/transformers. Zero paid
 * dependencies — model runs in-process. See docs/SECURITY.md and the
 * discussion in etapa 14 for the capacity trade-offs.
 *
 * The model is downloaded on first use and cached under
 * `node_modules/@xenova/transformers/.cache/` (or the value of
 * `TRANSFORMERS_CACHE` env). In Docker we bake the download into the
 * build stage so cold starts don't spend 20s fetching 130 MB.
 */
export default registerAs('embeddings', () => ({
  /**
   * When false, the entire semantic-search pipeline is inert:
   *   - POST /components / PATCH /components don't enqueue embedding jobs
   *   - GET /search/semantic returns 503
   *   - The backfill cron skips its tick
   * Existing stored vectors are untouched; the feature can be
   * re-enabled without reindexing.
   */
  enabled: process.env.EMBEDDINGS_ENABLED !== 'false',

  /**
   * HuggingFace model id understood by @xenova/transformers. Default is
   * the quantized int8 version of multilingual-e5-small (~130 MB on
   * disk, 384-dimensional output, strong multilingual retrieval).
   *
   * If you swap this you MUST bump the migration's vector(N) to match
   * the new dimension and run a full backfill.
   */
  model: process.env.EMBEDDINGS_MODEL ?? 'Xenova/multilingual-e5-small',

  /**
   * Output dimension. Must equal the model's native dim unless you
   * implement Matryoshka truncation (currently we don't — we store the
   * full vector). Used for input-validation assertions.
   */
  dimensions: parseInt(process.env.EMBEDDINGS_DIMENSIONS ?? '384', 10),

  /**
   * Soft cap on the number of characters fed to the tokenizer. E5-small
   * truncates internally at 512 tokens (~2 KB of text) but we trim in
   * userland first to keep the tokenizer work predictable.
   */
  maxInputChars: parseInt(process.env.EMBEDDINGS_MAX_INPUT_CHARS ?? '1800', 10),

  /**
   * Hard cap on the size of a search query — before prefixing and
   * embedding. Rejected with 400 if exceeded. Keeps a malicious client
   * from burning CPU on giant inputs.
   */
  maxQueryChars: parseInt(process.env.EMBEDDINGS_MAX_QUERY_CHARS ?? '200', 10),

  /**
   * How long the /search/semantic response is cached in Redis, keyed
   * on a hash of the query + limit. Tuned so popular queries settle
   * into the cache without holding stale results through a deploy.
   */
  searchCacheTtlSeconds: parseInt(process.env.EMBEDDINGS_SEARCH_CACHE_TTL ?? '300', 10),
}));
