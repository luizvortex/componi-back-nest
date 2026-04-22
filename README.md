# Componi — Backend (NestJS)

Open-source social network for reusable UI components. Users publish code + deps, others render a live preview on the client, fork/like/comment, build personal collections, and follow other makers.

This repo is the API layer. It does **zero** server-side compilation of user code — the backend only persists component source + metadata, and the frontend renders previews via `sucrase` in a sandboxed iframe.

## Tech stack

- [NestJS 10](https://nestjs.com/) — HTTP framework
- [TypeORM](https://typeorm.io/) + PostgreSQL (via [Supabase](https://supabase.com/))
- [Supabase Auth](https://supabase.com/auth) with GitHub OAuth — JWTs validated inside Nest via a custom guard (no Passport local)
- [Supabase Storage](https://supabase.com/storage) — component thumbnails
- **Redis** — shared by three subsystems:
  - Distributed rate limit (tiered: 10s / 1m / 1h windows, keyed by `userId` when authenticated, IP otherwise)
  - Read-through cache for feed, trending, and component detail (tag-based invalidation)
  - [BullMQ](https://docs.bullmq.io/) queues for notification fan-out and (future) thumbnail generation
- Swagger (`/api/v1/docs`), Helmet, global validation, throttling

## Quick start

```bash
# 1. Install
npm install

# 2. Create a Supabase project (free tier is fine)
#    - Enable GitHub OAuth under Authentication → Providers
#    - Create a public bucket `component-thumbnails` under Storage
#    - Copy the project URL, anon key, service role key, and JWT secret

# 3. Start Redis locally (needed for rate limit + cache + queues)
docker compose up -d redis
#   or: brew services start redis

# 4. Configure env
cp .env.example .env
#   then fill in DATABASE_URL, SUPABASE_* keys (REDIS_URL defaults to localhost)

# 5. Run migrations (after you generate the first one — see below)
npm run migration:run

# 6. Start dev server
npm run start:dev
#   → http://localhost:3000/api/v1
#   → Swagger UI at http://localhost:3000/api/v1/docs
```

## Project layout

```
src/
├── config/                 # typed config namespaces (app, database, supabase)
├── common/
│   ├── guards/             # SupabaseAuthGuard (global via APP_GUARD)
│   ├── decorators/         # @CurrentUser, @Public, @OptionalAuth
│   ├── filters/            # HttpExceptionFilter
│   ├── redis/              # shared ioredis client (global module)
│   ├── cache/              # CacheService (get/set/wrap/invalidateTags)
│   ├── queue/              # BullMQ wiring + queue name constants
│   ├── throttler/          # Redis-backed storage + user-aware guard
│   ├── dto/                # shared DTOs (pagination)
│   └── types/              # AuthUser
├── database/
│   ├── entities/           # 13 TypeORM entities
│   ├── migrations/         # generated with `npm run migration:generate`
│   ├── seeds/
│   └── data-source.ts      # shared by Nest runtime + TypeORM CLI
├── modules/
│   ├── auth/               # /auth/me — provisions local user row
│   ├── users/              # public profiles + self updates
│   ├── components/         # CRUD (core)
│   ├── versions/           # publish v2, v3… list/read versions
│   ├── tags/               # popular + search + find-or-create
│   ├── social/             # likes, favorites, follows
│   ├── comments/           # threaded comments
│   ├── collections/        # user-curated collections
│   ├── feed/               # following + trending
│   ├── search/             # components + users
│   └── notifications/      # in-app notifications
├── app.module.ts
└── main.ts
```

## Auth flow

1. Frontend handles OAuth with `@supabase/supabase-js` (GitHub **and/or** Google — both supported, see below) — it never talks to Nest for login.
2. Every authenticated request sends `Authorization: Bearer <supabase-jwt>`.
3. `SupabaseAuthGuard` (registered globally via `APP_GUARD`) validates the token and attaches `req.user: AuthUser`.
4. Controllers access the user with `@CurrentUser()`. Three decorator modes:
   - default — auth required, 401 if missing/invalid
   - `@OptionalAuth()` — auth attempted, valid token populates `req.user`, missing/invalid is silently ignored
   - `@Public()` — auth never attempted (e.g., `/auth/health`)
5. On first authenticated request, `AuthService#getOrProvisionProfile` mirrors the Supabase `auth.users` row into our own `users` table so relations work. The same is also done by a Postgres trigger (`supabase/rls.sql`) to remove the cold-start race.

Two JWT verification strategies are supported (`SUPABASE_JWT_STRATEGY`):
- `hs256` (default, simplest) — shared `SUPABASE_JWT_SECRET`
- `jwks` (safer) — RS256 keys fetched from `SUPABASE_JWKS_URI`

## Redis

One Redis instance backs three subsystems. The `RedisModule` in `src/common/redis` is registered globally and exposes a single `ioredis` client via the `REDIS_CLIENT` injection token.

### 1. Distributed rate limiting

`UserAwareThrottlerGuard` keys by `u:<userId>` when the request carries a valid JWT and by `ip:<address>` otherwise. Without this, multiple logged-in users behind a CGNAT cannibalize each other's quota and banned users rotate IPs to bypass limits.

Three tiers run in parallel — the strictest trips first:

| Name   | Window | Default limit | Blocks for  |
| ------ | ------ | ------------- | ----------- |
| short  | 10s    | 20 requests   | 10s         |
| medium | 60s    | 100 requests  | 60s         |
| long   | 1h     | 2000 requests | 5 min       |

Storage is `RedisThrottlerStorage` — a sliding-window implementation that fails open if Redis is unreachable (outage degrades throughput rather than 429-storming users).

### 2. Read-through cache

`CacheService` wraps ioredis with three ergonomics:

- `get` / `set` / `del` — primitive ops (JSON-serialized)
- `wrap(key, loader, { ttl, tags })` — miss-load-store in one call
- `invalidateTags(...tags)` — O(1) purge of every key that was stored with a tag

Currently cached:

| Entry                        | Key                                  | TTL |
| ---------------------------- | ------------------------------------ | --- |
| Public component detail      | `component:<id>:public`              | 120s |
| `GET /feed/trending`         | `feed:trending:<limit>`              | 30s  |
| `GET /feed/following`        | `feed:following:<userId>:<limit>`    | 30s  |

Writes to `components` (create / update / remove / fork / setThumbnail) invalidate `component:<id>`, `author:<authorId>`, and `feed:trending` tags.

### 3. BullMQ queues

The `notifications` queue fans out in-app notifications so the HTTP request returns before a row is persisted. `NotificationsProcessor` (registered as a `WorkerHost` in `NotificationsModule`) consumes jobs with:

- per-event dedupe via `dedupeKey` (prevents spam from rapid unlike/relike)
- self-notification filtering (no "you liked your own component")
- exponential-backoff retries (5 attempts, 2s → ~32s)

Triggers today: `like`, `favorite`, `follow`, `fork`. Future: `thumbnails` queue for screenshot generation, `emails` queue for digest sends.

### Running Redis locally

```bash
docker compose up -d redis
# or: brew services start redis
```

For production, use managed Redis (Upstash, Redis Cloud, AWS ElastiCache). Set `REDIS_URL` to the connection string and `REDIS_TLS=true` if the provider requires TLS.

### Enabling Google OAuth

In the Supabase dashboard:

1. **Authentication → Providers → Google → Enable**.
2. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Authorized JavaScript origin: your frontend URL.
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Paste Client ID + Client Secret into Supabase.

The backend needs **zero code changes** — `SupabaseAuthGuard` validates whatever Supabase signs, and `AuthService` already reads Google's `full_name`, `name`, and `avatar_url` claims. The OAuth provider is exposed on `AuthUser.provider` for analytics or per-provider behavior if you want it.

### Database setup

1. `npm run migration:run` — applies `src/database/migrations/1745000000000-InitialSchema.ts` (creates 13 tables, indexes, foreign keys, partial unique indexes, trigram indexes for search).
2. Open `supabase/rls.sql` and paste into Supabase → SQL Editor (or `psql $DATABASE_URL -f supabase/rls.sql`). This enables row-level security and installs the `auth.users → public.users` trigger.

## Database schema (13 tables)

`users` · `components` · `component_versions` · `tags` · `component_tags` · `likes` · `favorites` · `comments` · `follows` · `collections` · `collection_components` · `shares` · `notifications`

Enable row-level security in Supabase for defense-in-depth — Nest checks ownership at the service layer, but RLS keeps direct database access honest.

## Migrations

```bash
# after editing entities
npm run migration:generate -- src/database/migrations/InitialSchema

# apply
npm run migration:run

# rollback last
npm run migration:revert
```

Never set `DATABASE_SYNCHRONIZE=true` in production — TypeORM's auto-sync will happily drop columns.

## Scripts

| script                     | description                                |
| -------------------------- | ------------------------------------------ |
| `npm run start:dev`        | hot-reload dev server                      |
| `npm run build`            | compile to `dist/`                         |
| `npm run start:prod`       | run compiled build                         |
| `npm run lint`             | ESLint + Prettier fix                      |
| `npm test`                 | Jest unit tests                            |
| `npm run migration:generate` | diff entities → migration                |
| `npm run migration:run`    | apply pending migrations                   |
| `npm run seed`             | run `src/database/seeds/run-seed.ts`       |

## Roadmap (v1 → v2)

- v1: React/Next.js components, social features above.
- v2: Vue/Svelte/Solid support (already modeled via `framework` column), embeddable public preview URLs, full-text search via Postgres `tsvector`.

## License

## License

Licensed under the [Apache License, Version 2.0](LICENSE). 
See the [NOTICE](NOTICE) file for attribution information.

Copyright (c) 2026 Luiz Felipe Morisco.
