# HTTP Conventions

Things that are true for every HTTP route on the API. Things that
**aren't** in the OpenAPI spec because they're cross-cutting.

## Base URL & versioning

```
https://<host>/api/v1/...
```

The `/api/v1` prefix is global. Health and the well-knowns sit outside:

```
GET /api/v1/health             ← composite DB + Redis health
GET /robots.txt                ← apex
GET /.well-known/security.txt  ← apex
```

When we cut `v2` we'll mount it side-by-side; never mutate `v1`.

## Error response shape

Every non-2xx response — without exception — has this body:

```json
{
  "statusCode": 404,
  "message": "Component not found",
  "path": "/api/v1/components/abc123",
  "timestamp": "2026-04-25T10:12:00.000Z",
  "requestId": "0193d1f9-7d5c-7a3e-b8fc-...",
  // Optional fields, depending on the error:
  "code": "CONSENT_REQUIRED",       // machine-readable error id
  "errors": ["name must be at most 80 chars"]  // class-validator details
}
```

- `statusCode` — same as the HTTP status; here for clients that prefer
  to read it from the body.
- `requestId` — copy of the `x-request-id` header (see below). **Always
  include it in support tickets.**
- `code` — present on errors where the client needs to branch on a
  specific cause (`CONSENT_REQUIRED`, `RATE_LIMITED`, etc.).
- `errors` — present on `400` from the validation pipe; one string per
  failed `class-validator` constraint.

## Status code conventions

| Code | When |
|------|------|
| `200` | Success with body |
| `201` | Resource created (POST). `Location` header points to the new resource. |
| `204` | Success, no body (DELETE, like/unlike, follow/unfollow) |
| `400` | Validation error from `class-validator`. Read `errors[]`. |
| `401` | Missing or invalid bearer token. Refresh and retry once. |
| `403` | Authenticated but forbidden. **Three sub-cases distinguished by `code`:** |
| | • `code` absent → role/scope mismatch (e.g. user trying to hit `/admin/*`) |
| | • `Account suspended` message → user is banned, surface `suspendedUntil` |
| | • `code: 'CONSENT_REQUIRED'` → user must accept the latest privacy/terms (see `auth.md`) |
| `404` | Resource doesn't exist **or** the caller has no right to know it exists. We deliberately collapse "not found" and "forbidden for an owned resource you don't own" into 404 to avoid leaking IDs. |
| `409` | Conflict — usually a unique-index violation (e.g. you've already filed an open report on this target). |
| `429` | Rate limited — see throttle section. |
| `503` | Dependent service is down. Possible causes: Redis dropping (only on guards that fail open — usually we degrade silently); semantic search returning 503 when embeddings are disabled. |

## Request ID

Every request gets one — either copied from an inbound `x-request-id`
header (good for tracing through a CDN / gateway) or minted server-side
as a v4 UUID. It's:

- echoed back in the response `x-request-id` header
- attached to every server log line for that request
- included as `requestId` in error response bodies

When you build telemetry / Sentry / support flows, **carry this through**.
A user's bug report with a `requestId` lets us pull the entire log trace
in one query.

```ts
// recommended: send a client-generated id so you can correlate
// frontend errors with backend logs even on success responses
const requestId = crypto.randomUUID();
fetch(url, { headers: { 'x-request-id': requestId, ... } });
```

## Throttling

Three tiers run in parallel; the strictest trips first:

| Tier | Window | Default limit | Block duration |
|------|--------|---------------|----------------|
| `short` | 10 s | 20 requests | 10 s |
| `medium` | 60 s | 100 requests | 60 s |
| `long` | 1 h | 2000 requests | 5 min |

Keying:

- Authenticated callers — by `userId` (so CGNAT'd users don't share a
  budget; so an attacker rotating IPs from the same account doesn't get
  more budget).
- Unauthenticated — by source IP.

When throttled:

```
HTTP/1.1 429 Too Many Requests
retry-after: 12
```

`retry-after` is in seconds. Back off and try again. Don't retry inside
the window — every request inside an active block extends the block.

Treat 429 as "the user is doing too much, slow down" — for batch ops
(e.g. bulk-favoriting), space the requests out client-side.

## Pagination

Where pagination exists today:

- `GET /components?limit=20&cursor=...` — cursor-based.
  Cursors are opaque base64 strings; **don't parse them**.
- `GET /feed/following?limit=20` — same shape.
- `GET /admin/reports?limit=20&cursor=...` — same.

Response shape (when paginated — not all list endpoints are):

```json
{
  "items": [ /* … */ ],
  "nextCursor": "eyJjcmVhdGVkQXQi..." | null
}
```

`nextCursor: null` means you've reached the end.

A few list endpoints (notifications, comments) return a flat array
without a cursor — they're capped server-side at 50 items because the
domain doesn't need infinite scrolling. Check the OpenAPI spec for the
specific response shape.

## Authentication header

Always:

```
Authorization: Bearer <supabase access_token>
```

See `auth.md` for the full flow. Wrong header → 401, right header but
expired → 401, missing header on a `@Public()` route → still 200.

## CORS

The API allowlists origins via `app.corsOrigins` config. The Socket.IO
namespace uses the same allowlist (set runtime by the gateway, not
in the decorator). If your fetch is being blocked by CORS, the
deployed backend just needs to add your origin — open an issue.

`credentials: true` is set, so if you need to send cookies you can —
but the API doesn't use cookies, so this only matters if you proxy
through your own backend and need session cookies for that.

## Content-Type

- Requests — always `application/json` for non-GET. The body parser is
  capped at **256 KB** (a comfortable ceiling for component payloads
  including code; image uploads bypass the API entirely via signed
  Supabase Storage URLs).
- Responses — always `application/json` except for the well-knowns
  (`text/plain`).

## Caching

Several endpoints set `Cache-Control` headers — most lists hit a
short-TTL Redis cache server-side, so repeated calls within ~30 s
return the cached payload. Don't add a frontend cache layer on top
unless you know what you're doing; Redis already does this.

`/feed/following`, `/feed/trending`, `/components/:id`, `/search/semantic`
are the cached endpoints. Mutations (likes, comments, etc.) tag-invalidate
the cache, so a user's own action immediately reflects on their next
fetch.

## Compression

The API serves gzip-compressed responses to any client that includes
`Accept-Encoding: gzip` (every browser does by default). Don't
double-compress at the proxy layer.

## Dates

All dates are ISO 8601 UTC strings: `2026-04-25T10:12:00.000Z`. Parse
with `new Date(s)` — it accepts the format directly.

## Common gotchas

- **Trailing slashes** — the API is strict; `GET /components/` and
  `GET /components` may differ. Don't add trailing slashes unless the
  spec shows them.
- **Boolean query params** — pass as `?isPublic=true` (string), not as
  `1`/`0`. The validation pipe transforms strings to booleans.
- **Empty arrays in optional fields** — sending `[]` is treated as
  "explicitly empty"; omitting the key entirely is treated as "no
  change". This matters on `PATCH` requests.
- **404 means 404** — don't retry. Re-fetching the parent resource
  may surface that the item moved or was deleted.
