# Security Policy

## Reporting a vulnerability

Please **do not** file public GitHub issues for security problems. Email **security@componi.dev** with the details. PGP is available on request.

What to include:

- A clear description of the vulnerability and the impact.
- Reproduction steps (curl / HTTP request is ideal).
- If you can, a PoC that avoids accessing or modifying other users' data.
- Your preferred credit name (or whether you'd like to stay anonymous).

We acknowledge reports within **2 business days** and aim to close critical issues within **30 days**. We will tell you when the fix ships and credit you in the release notes unless you ask otherwise.

## Safe harbor

If you research in good faith, we will not pursue legal action for:

- Accessing your own account or a test account you created for the purpose.
- Reading data that the system returns to an unauthenticated or authenticated session *you control*.
- Staying within the published rate limits.

Please **don't**:

- Access, modify, or download data belonging to other users beyond what's strictly necessary to demonstrate the issue.
- Run destructive tests (bulk deletes, mass account creation, DoS).
- Publicly disclose the issue before we've had a reasonable window to fix it (90 days is our default; we can discuss shorter windows for actively exploited issues).
- Social-engineer staff or contractors.

## Scope

**In scope:**

- The production API (domain TBD) and the frontend that consumes it.
- This repository (`componi-back-nest`) and the paired frontend repository.

**Out of scope:**

- Supabase-operated infrastructure (report to <https://supabase.com/.well-known/security.txt>).
- GitHub / Google OAuth (report upstream).
- Third-party components published by other users — they are user-generated content, not our code.
- Denial-of-service attacks.
- Missing cookie flags on non-authenticated endpoints.
- Outdated browser warnings, banner-grabbing version disclosures.
- Social engineering.
- Physical attacks.

## Hardening already in place

So you know what to expect before looking:

### Authentication & authorization

- **JWT** verification against Supabase JWKS (asymmetric, RS256) with HS256 fallback for local dev. The verifier is a single shared service used by both the HTTP guard and the WebSocket gateway, so rotating algorithms is a one-place change.
- **Role-based access control** (`user` → `moderator` → `admin`) enforced by NestJS guards **and** a Postgres `BEFORE UPDATE` trigger that blocks writes to `role` / `suspendedUntil` unless `SET LOCAL app.privileged_update = 'true'` is active in the session — so even a compromised `service_role` key cannot self-escalate through a normal SQL write.
- **Consent gate** — write methods return `403 CONSENT_REQUIRED` when the authenticated user's `privacyAcceptedVersion` or `termsAcceptedVersion` is older than the current server-side version. The consent endpoints themselves and the LGPD rights endpoints (`/users/me/export`, `DELETE /users/me`) are explicitly opted out so a banned-from-writing user can still exercise their rights.
- **Admin bootstrap** — the first admin is promoted via a CLI gated by `ADMIN_BOOTSTRAP_SECRET`, a timing-safe `--confirm` compare, a mandatory `--reason ≥ 10 chars`, and the Postgres trigger above. No HTTP surface can create an admin.

### Data integrity & privacy

- **Append-only audit log** with a Postgres trigger that rejects `UPDATE` and `DELETE` for all roles, including superuser. Every privileged action writes a row with actor, IP, user-agent, reason, and metadata.
- **Personal data erasure** is implemented as irreversible anonymization (see `docs/PRIVACY.md` §6).
- **Content takedowns and user suspensions** are soft-operations: content can be restored if the takedown is appealed successfully.
- **Information leakage** — authorization failures return `404 Not Found`, not `403 Forbidden`, to prevent resource-ID enumeration.

### Network & request layer

- **Rate limiting** via Redis (tiered: 10 s burst / 60 s sustained / 1 h long). The throttler keys by user ID when authenticated to avoid CGNAT cannibalization.
- **CORS** allowlist enforced on both the HTTP API and the Socket.IO `/realtime` namespace from the same `app.corsOrigins` config — no permissive WebSocket upgrade.
- **CSRF** — non-applicable: the API is bearer-token-only.
- **SQL injection** — all queries use parameterized placeholders via TypeORM QueryBuilder or `$1`-style raw queries; no string interpolation of user input into SQL. Pgvector literals are constructed from validated `Float32Array` outputs of the embedding model, never from user text.
- **Body size cap** — explicit 256 KB JSON / 32 KB urlencoded limit at the bootstrap layer. Image uploads bypass the API entirely (see *Uploads* below).
- **Helmet** for the standard suite of security headers.

### Realtime layer

- **WebSocket auth** — bearer token comes from the Socket.IO handshake `auth.token` payload (not query string, never lands in proxy access logs). Suspended/deleted users are rejected at connection time.
- **Room isolation** — sockets auto-join only `user:${theirOwnId}`. Component rooms are entered through a `subscribe:component` event with strict UUID validation and a per-socket cap of 20 concurrent subscriptions to block fan-out amplification.

### Storage & uploads

- **Signed-upload flow** — the API issues short-lived Supabase Storage upload URLs scoped to `${userId}/${uuid}.{ext}` paths so one user can't overwrite another's files. The service-role key never leaves the server.
- **Content-type allowlist** — only `image/{png,jpeg,webp,avif}` are accepted for thumbnails. After upload the URL is HEAD-checked and the response `Content-Type` is verified to start with `image/` — defends against PUT-with-`text/html` bait that would otherwise render in the browser when the public URL is fetched.

### Background work

- **On-demand workers** — BullMQ processors are only registered when `QUEUE_WORKERS_ENABLED=true`. Free-tier deploys can keep them off and run a separate worker process when needed.
- **Embedding pipeline** — input is clipped to the configured `EMBEDDINGS_MAX_INPUT_CHARS`. Search queries are capped at `EMBEDDINGS_MAX_QUERY_CHARS`. Dimension mismatch from a corrupt model download is caught before any vector touches the DB.

## Out-of-band contacts

- Privacy: privacy@componi.dev (LGPD data-subject requests)
- Security: security@componi.dev (vulnerability reports)
- Abuse: abuse@componi.dev (user-behavior reports)

If email is down, open a generic GitHub issue in the meta repository — **do not** include vulnerability details there, just a "please contact me" note.
