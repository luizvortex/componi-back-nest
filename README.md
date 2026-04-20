# Componi — Backend (NestJS)

Open-source social network for reusable UI components. Users publish code + deps, others render a live preview on the client, fork/like/comment, build personal collections, and follow other makers.

This repo is the API layer. It does **zero** server-side compilation of user code — the backend only persists component source + metadata, and the frontend renders previews via `sucrase` in a sandboxed iframe.

## Tech stack

- [NestJS 10](https://nestjs.com/) — HTTP framework
- [TypeORM](https://typeorm.io/) + PostgreSQL (via [Supabase](https://supabase.com/))
- [Supabase Auth](https://supabase.com/auth) with GitHub OAuth — JWTs validated inside Nest via a custom guard (no Passport local)
- [Supabase Storage](https://supabase.com/storage) — component thumbnails
- Swagger (`/api/v1/docs`), Helmet, global validation, throttling

## Quick start

```bash
# 1. Install
npm install

# 2. Create a Supabase project (free tier is fine)
#    - Enable GitHub OAuth under Authentication → Providers
#    - Create a public bucket `component-thumbnails` under Storage
#    - Copy the project URL, anon key, service role key, and JWT secret

# 3. Configure env
cp .env.example .env
#   then fill in DATABASE_URL, SUPABASE_* keys

# 4. Run migrations (after you generate the first one — see below)
npm run migration:run

# 5. Start dev server
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
│   ├── decorators/         # @CurrentUser, @Public
│   ├── filters/            # HttpExceptionFilter
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

1. Frontend handles GitHub OAuth with `@supabase/supabase-js` — it never talks to Nest for login.
2. Every authenticated request sends `Authorization: Bearer <supabase-jwt>`.
3. `SupabaseAuthGuard` (registered globally via `APP_GUARD`) validates the token and attaches `req.user: AuthUser`.
4. Controllers access the user with `@CurrentUser()`. Public routes opt out via `@Public()`.
5. On first authenticated request, `AuthService#getOrProvisionProfile` mirrors the Supabase `auth.users` row into our own `users` table so relations work.

Two JWT verification strategies are supported (`SUPABASE_JWT_STRATEGY`):
- `hs256` (default, simplest) — shared `SUPABASE_JWT_SECRET`
- `jwks` (safer) — RS256 keys fetched from `SUPABASE_JWKS_URI`

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

Licensed under the [Apache License, Version 2.0](LICENSE). 
See the [NOTICE](NOTICE) file for attribution information.
