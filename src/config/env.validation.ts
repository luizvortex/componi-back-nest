import * as Joi from 'joi';

/**
 * Fail-fast schema for the process environment. Runs once at boot via
 * ConfigModule's `validationSchema`. A typo like `DATABASE_SS=true`
 * used to turn into an `undefined` config lookup at runtime — with this
 * schema the process refuses to start.
 *
 * `allowUnknown: true` keeps surprise env vars from breaking deploys;
 * only the keys listed here are type-checked.
 */
export const envValidationSchema = Joi.object({
  // ── App ──────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().default(''),

  // ── Database ─────────────────────────────────────────────────────────
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  DATABASE_SSL: Joi.boolean().default(true),
  DATABASE_LOGGING: Joi.boolean().default(false),
  DATABASE_SYNCHRONIZE: Joi.boolean().default(false),

  // ── Supabase ─────────────────────────────────────────────────────────
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_JWT_STRATEGY: Joi.string().valid('hs256', 'jwks').default('hs256'),
  SUPABASE_JWT_SECRET: Joi.string().when('SUPABASE_JWT_STRATEGY', {
    is: 'hs256',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  SUPABASE_JWKS_URI: Joi.string().uri().when('SUPABASE_JWT_STRATEGY', {
    is: 'jwks',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  SUPABASE_JWT_AUDIENCE: Joi.string().default('authenticated'),
  SUPABASE_JWT_ISSUER: Joi.string().allow('').optional(),
  SUPABASE_STORAGE_BUCKET: Joi.string().default('component-thumbnails'),

  // ── Redis ────────────────────────────────────────────────────────────
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).default('redis://localhost:6379'),
  REDIS_TLS: Joi.boolean().default(false),
  REDIS_KEY_PREFIX: Joi.string().default('componi:'),
  CACHE_DEFAULT_TTL: Joi.number().integer().positive().default(60),
  CACHE_FEED_TTL: Joi.number().integer().positive().default(30),

  // ── Queue ────────────────────────────────────────────────────────────
  QUEUE_CONCURRENCY: Joi.number().integer().positive().default(8),
  QUEUE_REMOVE_ON_COMPLETE_COUNT: Joi.number().integer().positive().default(500),
  QUEUE_REMOVE_ON_FAIL_COUNT: Joi.number().integer().positive().default(5000),
  // Workers are a separate concern from the queue client — see
  // QueueModule for the reason we may want the API nodes to publish
  // without also running workers (free-tier Redis cmd-cap protection).
  QUEUE_WORKERS_ENABLED: Joi.boolean().default(true),

  // ── Throttler ────────────────────────────────────────────────────────
  THROTTLE_SHORT_LIMIT: Joi.number().integer().positive().default(20),
  THROTTLE_LONG_LIMIT: Joi.number().integer().positive().default(2000),

  // ── Compliance ───────────────────────────────────────────────────────
  PRIVACY_VERSION: Joi.string().default('2026-04-23'),
  TERMS_VERSION: Joi.string().default('2026-04-23'),

  // ── Embeddings (local ONNX via Transformers.js, zero paid deps) ──────
  EMBEDDINGS_ENABLED: Joi.boolean().default(true),
  EMBEDDINGS_MODEL: Joi.string().default('Xenova/multilingual-e5-small'),
  EMBEDDINGS_DIMENSIONS: Joi.number().integer().positive().default(384),
  EMBEDDINGS_MAX_INPUT_CHARS: Joi.number().integer().positive().default(1800),
  EMBEDDINGS_MAX_QUERY_CHARS: Joi.number().integer().positive().default(200),
  EMBEDDINGS_SEARCH_CACHE_TTL: Joi.number().integer().positive().default(300),

  // ── Realtime (Socket.IO) ─────────────────────────────────────────────
  REALTIME_ENABLED: Joi.boolean().default(true),
  REALTIME_ADAPTER: Joi.string().valid('memory', 'redis').default('memory'),
  REALTIME_NAMESPACE: Joi.string().default('/realtime'),
  REALTIME_MAX_COMPONENT_SUBSCRIPTIONS: Joi.number().integer().positive().default(20),

  // ── Admin bootstrap CLI (optional at runtime; required for the CLI) ──
  ADMIN_BOOTSTRAP_SECRET: Joi.string().min(32).optional(),
});
