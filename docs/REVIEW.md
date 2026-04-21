# Componi backend — review & proposals

Quick first-pass review of the scaffold, plus an innovative-feature pitch at the end.

## Security

### Fixed in this round

| Issue | What was wrong | Fix |
| --- | --- | --- |
| `@Public()` broke viewer-aware responses | Owner couldn't read own private component on `GET /components/:id` (route was fully public — no JWT parsed, `req.user` always undefined). | New `@OptionalAuth()` decorator: parses JWT if present, silently skips if absent/invalid. Applied to listing/detail/lineage/trending/comments/collection-detail endpoints. |
| Unbounded `code` / `dependencies` payload | `code` and `dependencies` took any string/object — a 100MB POST would pass validation. | `code` capped at 200KB; `dependencies` capped at 50 entries + 8KB JSON + strict package-name / semver-range regex (rejects `"rm -rf"` as a version). |
| Slug collisions | `slugify(name)` produced the same slug for two components of the same name; INSERT would throw 500 or silently overlap. | Partial unique index on `(authorId, lower(slug)) WHERE deletedAt IS NULL` + `insertWithUniqueSlug` retry loop appending `-2`, `-3`… |
| Thumbnail URL = SSRF / phishing | `setThumbnail` accepted any URL the client posted. Stored and echoed publicly → could be used as an open redirect / to host malware in previews. | Strict origin whitelist against the configured `SUPABASE_URL` host. HTTPS only. |
| Username collision on provisioning | Two users with the same GitHub username (rare — but the local-dev "fake user" flow could easily collide) would 500 on the second signup. | Retry loop with numeric suffix in `AuthService`, plus a case-insensitive unique partial index. |

### Open items — pick your priority

1. **Rate limiting is global-only.** `@nestjs/throttler` is configured for all endpoints at 100 req/min/IP. Writes (create component, publish version, comment) should have tighter per-user throttles — e.g., 10 components/hour, 60 comments/hour. Easy win: `@Throttle({ short: { limit: 10, ttl: 3600_000 } })` on those handlers.
2. **No abuse/content moderation hooks.** Component `code`, `description`, comment `body` are stored as-is. Frontend must escape; that's fine — but we should add a signal so a moderator can soft-delete. Since entities already have `deletedAt`, just a `/admin/components/:id/takedown` endpoint with a role check is enough for v1.
3. **XSS in the rendered preview is the frontend's problem** (sucrase + sandboxed iframe), but worth documenting in the threat model that the backend intentionally stores arbitrary JS. Add `Content-Security-Policy` headers on the preview route on the frontend.
4. **Service-role key handling.** The `.env.example` ships a `SUPABASE_SERVICE_ROLE_KEY` slot. Nothing uses it yet, but once the thumbnail-upload endpoint is added, **never** expose it to the frontend. Document this in the README.
5. **Request body size** is Nest default (100KB). Bump `app.use(json({ limit: '300kb' }))` in `main.ts` once thumbnail/code lengths solidify, and keep Nginx/CloudFlare limits in lockstep.
6. **RLS writes still allow direct frontend mutations for likes/follows/favorites.** Left opt-in intentionally; comment out those policies if you want "all writes via Nest, no exceptions."
7. **JWT clock skew** — `jsonwebtoken` has a 0s default leeway. If Supabase and our server clocks drift, tokens near expiry fail. Add `clockTolerance: 5` in the HS256 verify call once you see false 401s.

## Performance

### Fixed in this round

| Issue | Fix |
| --- | --- |
| `ILIKE '%term%'` scans the whole table | Added `pg_trgm` + GIN indexes on `components.name`, `components.description`, `users.username`, `users.displayName`. Trigram search now uses the index even on `%term%`. |
| `components` had no index on owner+time or public+time | Added partial indexes excluding soft-deleted rows. |
| `notifications` unread query was a full table scan | Partial index `WHERE readAt IS NULL`. |
| Search accepted any length and blew up the regex cost | Min 2, max 60 chars; limit capped at 50. |

### Open items

1. **Counter columns under heavy like bursts.** Each `like`/`unlike` takes a row-level lock on the target `components` row. Popular components become a contention hotspot. Options, cheapest first:
   - Move `likesCount` updates off the hot path: write likes normally, run a cron/trigger that aggregates every minute. Simple, slightly stale counts.
   - Use Postgres `SUM(…)` + materialized view refreshed on a schedule.
   - For real scale, Redis counter + periodic drain to Postgres. Overkill until we hit 10k+ writes/min.
2. **Cursor pagination is declared in `PaginationDto` but not implemented.** Feed/list endpoints use `.take(limit)` with no cursor. Adds duplicates if a new like shifts ordering mid-scroll. Next step: serialize cursor as `base64("<createdAt>|<id>")` and add `WHERE (c.createdAt, c.id) < (:cursorTs, :cursorId)` in each list query.
3. **`findById` always loads `componentTags.tag`.** Fine for the detail page, wasteful for the list view. Fine for now; revisit if the N+1 shows up in traces.
4. **`@ClassSerializerInterceptor` runs globally.** It's convenient but does a deep transform per response — non-trivial for large list payloads. If the feed gets slow, switch to explicit response DTOs per endpoint.
5. **No caching.** A global CDN in front (Cloudflare) caching `/components/:id` public GETs for 30–60s would shave a huge amount of DB traffic. Add `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` on anonymous responses.
6. **Every request re-parses the JWT.** Fine for HS256 (microseconds). For JWKS mode, `createRemoteJWKSet` caches keys, but verification is still RSA — consider a short-lived (30s) in-memory LRU keyed by token hash.

## Code quality

- `AppModule` is clean.
- `ComponentsService` is getting long (250 lines). Once we add AI analysis + lineage queries, consider splitting into `ComponentsService` (CRUD) + `ForksService` + `ThumbnailsService`.
- No tests yet. Ship the first one alongside `VersionsService#publish` — it's the hairiest transaction.

## Innovative differentiator — pick one

Current state: Componi = CodePen + npm + Twitter for components. To genuinely stand out, we need something the incumbents can't easily copy.

Three ideas, from most conservative to most ambitious:

### A. Remix Lineage Graph (already scaffolded)

**What**: every component tracks `forkedFromId`. Profile pages show a git-style tree: "Luiz's DatePicker → Ana's DateRange variant → Carlos's MultiDate extension." Original author gets credit cascading down.

**Why now**: `forkedFromId` column + `forksCount` counter + `POST /components/:id/fork` endpoint already exist (see commit). Frontend reads `GET /components/:id/lineage` to render the tree.

**Effort**: low (2-3 days of frontend). Biggest differentiator vs CodePen clones, which treat forks as isolated copies.

**Monetization hook**: "Top contributors to this component lineage" — social proof plus a natural place to surface sponsor-me / tip jars later.

### B. Component-as-API for LLMs

**What**: every public component gets a machine-readable endpoint:
```
GET /components/:id/spec.json   → { code, deps, props signature, inferred props, a11y hints }
GET /components/:id/for-ai      → natural-language description + copy-paste snippet
```
Tools like Cursor / Claude / Copilot can fetch components *directly* as context. "Install" becomes a single LLM tool call.

**Why**: AI-assisted dev is where the puck is going. CodePen/Dribbble are human-first, which means they're invisible to AI workflows. Componi becomes the *canonical* npm for LLM-consumable snippets.

**Effort**: medium. Requires an async pipeline that analyzes submitted code (parse AST → extract props + exports + imports → persist denormalized metadata). The piece we already have, `dependencies`, is a baby version of this.

**Monetization hook**: usage-based billing for orgs that want private spec endpoints for their internal design systems.

### C. Composable Components (my recommendation)

**What**: a component can declare that it `extends` another component, like:

```jsonc
{
  "name": "SortablePaginatedTable",
  "composes": [
    { "from": "0fb1…/Table",        "as": "base" },
    { "from": "8d2a…/Sortable",     "applies": ["headers"] },
    { "from": "9f4b…/Pagination",   "applies": ["footer"] }
  ]
}
```

The preview engine resolves the composition at render time. A user can start from someone else's Table, bolt on a Pagination variant someone else wrote, and the result is itself publishable — still referencing the parts. This creates a *DAG*, not a list, and enables real reuse.

**Why this wins**: no other component marketplace does this. shadcn/ui is copy-paste. Bit.dev is closer but way more enterprise-heavy. This is "Lego for UI" at the platform level. It also makes every component more valuable — "how many others depend on mine?" becomes a new vanity metric that encourages quality submissions.

**Effort**: the hard part is the runtime resolver (frontend). Backend is cheap: add a `component_compositions` table `(parentId, childId, mountPoint)` and an endpoint to resolve the full dependency graph for an iframe.

**Risk**: spec design is hard. Needs a few early power users to stress-test.

---

**Recommendation**: ship **(A) Remix Lineage** immediately (cheap, differentiating, already 60% done), then start prototyping **(C) Composable Components** with one design partner. (B) is a nice medium-term add-on but less urgent — easy to bolt on once we have the lineage metadata.
