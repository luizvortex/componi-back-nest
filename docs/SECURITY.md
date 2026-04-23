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

- **JWT** verification against Supabase JWKS (asymmetric) with HS256 fallback for local dev.
- **Role-based access control** (`user` → `moderator` → `admin`) enforced by NestJS guards **and** a Postgres `BEFORE UPDATE` trigger that blocks writes to `role` / `suspendedUntil` unless `SET LOCAL app.privileged_update = 'true'` is active in the session — so even a compromised `service_role` key cannot self-escalate through a normal SQL write.
- **Append-only audit log** with a Postgres trigger that rejects `UPDATE` and `DELETE` for all roles, including superuser. Every privileged action writes a row with actor, IP, user-agent, reason, and metadata.
- **Rate limiting** via Redis (tiered: 10 s burst / 60 s sustained / 1 h long). The throttler keys by user ID when authenticated to avoid CGNAT cannibalization.
- **CSRF** — non-applicable: the API is bearer-token-only.
- **SQL injection** — all queries use parameterized placeholders via TypeORM QueryBuilder or `$1`-style raw queries; no string interpolation of user input into SQL.
- **Information leakage** — authorization failures return `404 Not Found`, not `403 Forbidden`, to prevent resource-ID enumeration.
- **Admin bootstrap** — the first admin is promoted via a CLI gated by `ADMIN_BOOTSTRAP_SECRET`, a timing-safe `--confirm` compare, a mandatory `--reason ≥ 10 chars`, and the Postgres trigger above. No HTTP surface can create an admin.
- **Content takedowns and user suspensions** are soft-operations: content can be restored if the takedown is appealed successfully.
- **Personal data erasure** is implemented as irreversible anonymization (see `docs/PRIVACY.md` §6).

## Out-of-band contacts

- Privacy: privacy@componi.dev (LGPD data-subject requests)
- Security: security@componi.dev (vulnerability reports)
- Abuse: abuse@componi.dev (user-behavior reports)

If email is down, open a generic GitHub issue in the meta repository — **do not** include vulnerability details there, just a "please contact me" note.
