# Componi — Frontend Integration Pack

This folder is the contract between the Componi backend and any frontend
that consumes it. **Copy this folder into the root of the frontend repo**
(or git-submodule it) and point your Claude/agent setup at it via the
frontend's `CLAUDE.md`.

## What's here

| File | What it covers | When to consult |
|------|----------------|-----------------|
| `openapi.json` | Machine-readable HTTP contract (paths, payloads, error shapes) | Before writing any `fetch`/`axios` call. Generate types from it (see `client.md`). |
| `auth.md` | Supabase OAuth + JWT + the consent-versioning dance | Before wiring login, before writing any authenticated request |
| `http-conventions.md` | Error response shape, status-code semantics, paging, throttle headers, request IDs | When deciding how to handle a non-2xx response |
| `realtime.md` | Socket.IO connection, event catalog, room rules, reconnect/error semantics | Before adding any "live" UI — notifications, like counts, presence |
| `client.md` | Recommended client recipe — `openapi-fetch` + `socket.io-client` with end-to-end types | Once, at project setup |
| `types/realtime.ts` | Standalone copy of the realtime event types so frontend `Socket<>` is fully typed | Import directly, no build step |

## Workflow

### Backend → Frontend

When the backend changes a route, DTO, or `@Api*` decorator:

```bash
# in the backend repo
npm run openapi:generate
git add docs/frontend-integration/openapi.json && git commit -m "openapi: <change>"
```

The PR review surfaces the diff in `openapi.json` so contract changes are
visible. The frontend regenerates its types from the new spec.

### Frontend → Backend

If the frontend needs a new field, endpoint, or event:

1. Open an issue / PR in the backend repo describing the need.
2. Once merged + spec regenerated, frontend pulls the latest `openapi.json`.
3. Re-run `openapi-typescript` to refresh the types.

### Keeping this folder in sync

Three options, pick one and stick with it:

- **Manual copy** (simplest) — `cp -r docs/frontend-integration/* ../componi-frontend/docs/api/` after each backend change.
- **Git submodule** — add the backend repo as a submodule of the frontend, point at this subdirectory.
- **CI publish** — the backend CI uploads `openapi.json` (and the .md files) to a versioned location (S3, GitHub Pages); the frontend pulls on build.

The current expectation is **manual copy** — easiest while the schema is
still moving fast.

## High-level architecture (what lives where)

```
┌───────────────────────────────────────────────────────────────────┐
│  Frontend (React / Next / Whatever)                              │
│                                                                   │
│   ┌──────────────────┐         ┌────────────────────────────┐    │
│   │ openapi-fetch    │         │ socket.io-client           │    │
│   │ (typed HTTP)     │         │ (typed events from         │    │
│   └────────┬─────────┘         │  types/realtime.ts)        │    │
│            │                    └────────────┬───────────────┘    │
└────────────┼──────────────────────────────────┼───────────────────┘
             │                                  │
             │  HTTPS  /api/v1/*                │  WSS  /realtime
             ▼                                  ▼
┌───────────────────────────────────────────────────────────────────┐
│  Componi Backend (this repo)                                     │
│                                                                   │
│   - SupabaseAuthGuard (HTTP)         - RealtimeGateway (WS)      │
│   - Same SupabaseJwtVerifier on both — token format identical    │
│                                                                   │
│   ConsentGuard ↑ — gates writes when privacy/terms version stale │
│   ThrottlerGuard ↑ — Redis-backed sliding window                 │
└───────────────────────────────────────────────────────────────────┘
```

## Quick start (frontend dev)

```bash
# 1. Install consumer libs
npm install socket.io-client
npm install -D openapi-typescript openapi-fetch

# 2. Generate HTTP types from the spec
npx openapi-typescript ./docs/api/openapi.json -o ./src/api/types.ts

# 3. Hello world (HTTP)
import createClient from 'openapi-fetch';
import type { paths } from './api/types';

const api = createClient<paths>({ baseUrl: '/api/v1' });
const { data, error } = await api.GET('/components', {
  params: { query: { limit: 20 } },
});

# 4. Hello world (Realtime)
import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from './api/realtime';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  `${API_URL}/realtime`,
  { auth: { token: supabaseAccessToken } },
);
socket.on('notification', (n) => console.log(n));
```

The rest of this folder unpacks each piece. **Read `auth.md` first** —
nothing else makes sense without it.

## Versioning

The OpenAPI spec carries `info.version` (currently `0.1.0`). Bumps follow
[semver]:

- **Major** — breaking change (route removed, required field added,
  payload shape changed). Frontend and backend must deploy together.
- **Minor** — new endpoint, optional field added. Backwards-compatible.
- **Patch** — docs/comment changes, default-value tweaks.

Privacy/terms versions (see `auth.md`) are independent — they're tracked
in `compliance.privacyVersion` / `compliance.termsVersion` and consumed
through the `/users/me/consent` endpoint, not through the spec itself.

[semver]: https://semver.org
