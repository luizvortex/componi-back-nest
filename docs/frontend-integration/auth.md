# Authentication & Consent

Componi auth is **delegated to Supabase**: the frontend never sees a
password, only an OAuth redirect to GitHub or Google. The backend
trusts a Supabase-issued JWT — there's no separate session cookie, no
refresh-token endpoint to call, no "log out" route on this API. Sign-in
state is whatever the Supabase client SDK reports.

## High-level flow

```
┌────────────┐                                           ┌──────────┐
│  Frontend  │                                           │   User   │
└─────┬──────┘                                           └────┬─────┘
      │                                                       │
      │  click "Login with GitHub"                            │
      ├──────── supabase.auth.signInWithOAuth({github}) ──────┤
      │                                                       │
      │             redirect to GitHub OAuth                  │
      │                          ⇅                            │
      │      (user approves) → Supabase callback → redirect   │
      │                                                       │
      │  supabase JS SDK now holds the session locally        │
      │  (access_token expires in 1h; refresh_token survives) │
      │                                                       │
      │  BEFORE every API call:                               │
      │    const { data: { session } } = await                │
      │      supabase.auth.getSession();                      │
      │    fetch('/api/v1/...', {                             │
      │      headers: {                                       │
      │        Authorization: `Bearer ${session.access_token}`│
      │      }                                                │
      │    });                                                │
```

The Componi backend doesn't issue tokens, doesn't store passwords, and
has no `/login` route of its own. Everything is bearer-token-based.

## Concrete recipe (React + supabase-js)

```ts
// supabase-client.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
);

// auth-token.ts — call before every API request
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// LoginButton.tsx
function LoginButton() {
  return (
    <button
      onClick={() =>
        supabase.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        })
      }
    >
      Sign in with GitHub
    </button>
  );
}
```

## Sending the token

Two channels, same token:

| Channel | Where the token goes |
|---------|----------------------|
| HTTP | `Authorization: Bearer <token>` header. Used on every request to `/api/v1/*` (except a few `@Public()` endpoints — see below). |
| Socket.IO | `auth: { token }` payload in the `io()` constructor. **Never** pass it as a query string — it would land in proxy access logs. |

## Endpoints that don't need auth (`@Public`)

These work without `Authorization` header:

- `GET /api/v1/health` — liveness probe
- `GET /api/v1/users/:username` — public profile lookup
- `GET /api/v1/users/me/export` — wait, this is authenticated
- `GET /api/v1/feed/trending` — `@OptionalAuth` (works either way; logged-in callers get block-filtered results)
- `GET /api/v1/components/*` — `@OptionalAuth` (same shape — anonymous gets only public, logged-in gets block-filtered)
- `GET /api/v1/search` — keyword search
- `GET /api/v1/search/semantic` — vector search
- `GET /robots.txt`, `GET /.well-known/security.txt` — RFC well-knowns

A 401 response means the token is missing or invalid. Refresh via
`supabase.auth.refreshSession()` and retry once.

## Suspended accounts

If a moderator suspends the user, every authenticated request returns:

```json
HTTP/1.1 403 Forbidden
{
  "statusCode": 403,
  "message": "Account suspended",
  "suspendedUntil": "2026-05-23T15:00:00.000Z",
  "path": "/api/v1/components",
  "timestamp": "2026-04-25T10:12:00.000Z",
  "requestId": "..."
}
```

Show a suspension screen with the date. **Don't auto-retry.** The token
itself is still valid — re-logging in won't help. The status clears
automatically after `suspendedUntil`.

## Consent versioning (LGPD / GDPR)

This is the **most important non-obvious piece**. Read carefully.

### What it is

The backend tracks which version of `docs/PRIVACY.md` and `docs/TERMS.md`
each user has accepted. When the documents change, every user's status
goes stale and **write operations start returning 403 until they
re-accept**.

### What the user sees

On their next write attempt (creating a component, liking, commenting,
following — any non-GET request) they get:

```json
HTTP/1.1 403 Forbidden
{
  "statusCode": 403,
  "message": "Consent required",
  "code": "CONSENT_REQUIRED",
  "needsPrivacy": true,
  "needsTerms": false,
  "currentVersions": { "privacy": "2026-04-23", "terms": "2026-04-23" }
}
```

Detect via `error.code === 'CONSENT_REQUIRED'` and surface a modal.

### Recommended frontend flow

```ts
// 1. After login, check status:
const { data: status } = await api.GET('/users/me/consent');
// status:
// {
//   privacy: { currentVersion, acceptedVersion, acceptedAt, needsAcceptance },
//   terms:   { currentVersion, acceptedVersion, acceptedAt, needsAcceptance },
// }

if (status.privacy.needsAcceptance || status.terms.needsAcceptance) {
  showConsentModal({
    needsPrivacy: status.privacy.needsAcceptance,
    needsTerms: status.terms.needsAcceptance,
  });
}

// 2. When user clicks "I accept":
await api.POST('/users/me/consent', {
  body: { acceptPrivacy: true, acceptTerms: true },
});
// Server records the *server-side* current version — it ignores any
// version sent by the client. Replay-safe by design.
```

### Endpoints that bypass the consent gate

LGPD rights remain reachable even with stale consent — otherwise we'd
trap users:

- `GET /users/me/export` — data portability
- `DELETE /users/me` — erasure (irreversible anonymization)
- `GET /users/me/consent` — read status
- `POST /users/me/consent` — accept

You can always hit those four. Everything else is gated.

### Reads always work

Consent only gates `POST/PUT/PATCH/DELETE`. `GET` requests pass through
regardless — so the frontend can render the consent modal with fresh
data even when the user hasn't accepted yet.

## Token refresh

The Supabase JS client refreshes automatically. If you build a manual
client, watch for:

- The access_token has 1h lifetime (default).
- Backend rejects expired tokens with **401**.
- Listen to `supabase.auth.onAuthStateChange` to update local state.

```ts
supabase.auth.onAuthStateChange((event, session) => {
  // event: 'TOKEN_REFRESHED' | 'SIGNED_IN' | 'SIGNED_OUT' | ...
  if (!session) router.push('/login');
});
```

## Logout

There's no API call. Just:

```ts
await supabase.auth.signOut();
// Optionally: navigate to / and reset client state
```

The backend session cache (30s TTL) drops naturally; the next request
with a missing/invalid token gets a 401.

## Provisioning timing

A brand-new Supabase signup may hit the API before the local `users` row
exists. The backend handles this by treating that first request as role
`user` with no consent yet, then auto-creating the row through
`AuthService`. Frontend code doesn't need to do anything special — the
auth response just works.

The only side-effect: `GET /users/me/consent` returns
`acceptedAt: null, acceptedVersion: null, needsAcceptance: true` for
both privacy and terms on the very first call. Show the modal.

## Common pitfalls

- **Sending the token as `Authorization: ${token}`** (no `Bearer` prefix)
  → 401. The header must be `Authorization: Bearer <token>`.
- **Reusing a stale token after `signOut()`** → 401. Always re-fetch
  the session before each request batch, or use the supabase JS client's
  built-in cache.
- **Putting the token in a query string for WebSockets** → it'll work
  but it leaks into logs. Use `auth: { token }` on `io()`.
- **Catching `CONSENT_REQUIRED` and silently retrying after accept** —
  the consent acceptance invalidates the session cache; retry should
  use a fresh request, not the in-flight one.
