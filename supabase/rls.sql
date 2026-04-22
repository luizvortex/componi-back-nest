-- ─────────────────────────────────────────────────────────────────────────
-- Componi — Row-Level Security policies
-- ─────────────────────────────────────────────────────────────────────────
--
-- Apply this AFTER `npm run migration:run`.
-- Paste in Supabase → SQL Editor, or run via psql against the same DATABASE_URL.
--
-- Threat model
-- ────────────
-- The Nest backend uses the `postgres` superuser (or `service_role` PgBouncer
-- string), which bypasses RLS. RLS is the safety net for:
--   • supabase-js calls from the frontend (anon / authenticated roles)
--   • a leaked service role key (still harmful, but at least RLS gives one
--     more layer for the anon path)
--
-- Pattern: every public-readable resource ships with an "is publicly visible"
-- predicate; every write goes through the backend (service_role bypass).
-- Specific direct-from-frontend writes (likes, follows, favorites) are opt-in
-- below — comment them out if you want a hard "writes only via Nest" rule.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "users"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "components"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "component_versions"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "component_tags"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "likes"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "favorites"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "follows"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collections"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shares"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"         ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "users_public_read" ON "users"
  FOR SELECT USING ("deletedAt" IS NULL);

CREATE POLICY "users_self_update" ON "users"
  FOR UPDATE TO authenticated
  USING (auth.uid() = "id")
  WITH CHECK (auth.uid() = "id");

-- ─────────────────────────────────────────────────────────────────────────
-- components
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "components_public_read" ON "components"
  FOR SELECT USING (
    "deletedAt" IS NULL AND ("isPublic" = true OR "authorId" = auth.uid())
  );

CREATE POLICY "components_owner_insert" ON "components"
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = "authorId");

CREATE POLICY "components_owner_update" ON "components"
  FOR UPDATE TO authenticated
  USING (auth.uid() = "authorId")
  WITH CHECK (auth.uid() = "authorId");

CREATE POLICY "components_owner_delete" ON "components"
  FOR DELETE TO authenticated
  USING (auth.uid() = "authorId");

-- ─────────────────────────────────────────────────────────────────────────
-- component_versions — visibility follows the parent component
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "versions_public_read" ON "component_versions"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "components" c
      WHERE c."id" = "component_versions"."componentId"
        AND c."deletedAt" IS NULL
        AND (c."isPublic" = true OR c."authorId" = auth.uid())
    )
  );

CREATE POLICY "versions_owner_insert" ON "component_versions"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "components" c
      WHERE c."id" = "component_versions"."componentId" AND c."authorId" = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- tags
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "tags_public_read" ON "tags" FOR SELECT USING (true);
CREATE POLICY "tags_authenticated_insert" ON "tags"
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- component_tags
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "component_tags_public_read" ON "component_tags"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "components" c
      WHERE c."id" = "component_tags"."componentId"
        AND c."deletedAt" IS NULL
        AND (c."isPublic" = true OR c."authorId" = auth.uid())
    )
  );

CREATE POLICY "component_tags_owner_write" ON "component_tags"
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "components" c WHERE c."id" = "component_tags"."componentId" AND c."authorId" = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "components" c WHERE c."id" = "component_tags"."componentId" AND c."authorId" = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- likes / favorites / follows — opt-in direct-from-frontend writes
-- (comment out the INSERT/DELETE policies if you want all writes via Nest)
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "likes_public_read" ON "likes" FOR SELECT USING (true);
CREATE POLICY "likes_self_insert" ON "likes"
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = "userId");
CREATE POLICY "likes_self_delete" ON "likes"
  FOR DELETE TO authenticated USING (auth.uid() = "userId");

CREATE POLICY "favorites_self_read" ON "favorites"
  FOR SELECT TO authenticated USING (auth.uid() = "userId");
CREATE POLICY "favorites_self_insert" ON "favorites"
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = "userId");
CREATE POLICY "favorites_self_delete" ON "favorites"
  FOR DELETE TO authenticated USING (auth.uid() = "userId");

CREATE POLICY "follows_public_read" ON "follows" FOR SELECT USING (true);
CREATE POLICY "follows_self_insert" ON "follows"
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = "followerId");
CREATE POLICY "follows_self_delete" ON "follows"
  FOR DELETE TO authenticated USING (auth.uid() = "followerId");

-- ─────────────────────────────────────────────────────────────────────────
-- comments
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "comments_public_read" ON "comments"
  FOR SELECT USING (
    "deletedAt" IS NULL AND EXISTS (
      SELECT 1 FROM "components" c
      WHERE c."id" = "comments"."componentId"
        AND c."deletedAt" IS NULL
        AND (c."isPublic" = true OR c."authorId" = auth.uid())
    )
  );

CREATE POLICY "comments_self_insert" ON "comments"
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = "authorId");
CREATE POLICY "comments_self_update" ON "comments"
  FOR UPDATE TO authenticated USING (auth.uid() = "authorId") WITH CHECK (auth.uid() = "authorId");
CREATE POLICY "comments_self_delete" ON "comments"
  FOR DELETE TO authenticated USING (auth.uid() = "authorId");

-- ─────────────────────────────────────────────────────────────────────────
-- collections + items
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "collections_visible" ON "collections"
  FOR SELECT USING (
    "deletedAt" IS NULL AND ("isPublic" = true OR "ownerId" = auth.uid())
  );

CREATE POLICY "collections_owner_write" ON "collections"
  FOR ALL TO authenticated
  USING (auth.uid() = "ownerId")
  WITH CHECK (auth.uid() = "ownerId");

CREATE POLICY "collection_components_visible" ON "collection_components"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "collections" col
      WHERE col."id" = "collection_components"."collectionId"
        AND col."deletedAt" IS NULL
        AND (col."isPublic" = true OR col."ownerId" = auth.uid())
    )
  );

CREATE POLICY "collection_components_owner_write" ON "collection_components"
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "collections" col WHERE col."id" = "collection_components"."collectionId" AND col."ownerId" = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "collections" col WHERE col."id" = "collection_components"."collectionId" AND col."ownerId" = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- shares
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "shares_public_read" ON "shares" FOR SELECT USING (true);
CREATE POLICY "shares_authenticated_insert" ON "shares"
  FOR INSERT TO authenticated WITH CHECK (
    "userId" IS NULL OR auth.uid() = "userId"
  );

-- ─────────────────────────────────────────────────────────────────────────
-- notifications — strictly private to the recipient
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "notifications_self_read" ON "notifications"
  FOR SELECT TO authenticated USING (auth.uid() = "userId");
CREATE POLICY "notifications_self_update" ON "notifications"
  FOR UPDATE TO authenticated USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

-- ─────────────────────────────────────────────────────────────────────────
-- Auto-provision public.users from auth.users
-- (Optional — Nest also does this on first /auth/me; trigger removes the
--  cold-start race when the frontend reads the user before hitting Nest.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  candidate_username text;
  unique_username text;
  attempt int := 0;
BEGIN
  candidate_username := COALESCE(
    NEW.raw_user_meta_data->>'user_name',
    NEW.raw_user_meta_data->>'preferred_username',
    split_part(COALESCE(NEW.email, NEW.id::text), '@', 1)
  );
  candidate_username := lower(regexp_replace(candidate_username, '[^a-z0-9_]+', '-', 'g'));
  unique_username := candidate_username;

  WHILE EXISTS (SELECT 1 FROM public.users WHERE lower("username") = unique_username) LOOP
    attempt := attempt + 1;
    unique_username := candidate_username || '-' || attempt;
  END LOOP;

  INSERT INTO public.users ("id", "email", "username", "githubUsername", "displayName", "avatarUrl")
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.id::text || '@placeholder.local'),
    unique_username,
    NEW.raw_user_meta_data->>'user_name',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT ("id") DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─────────────────────────────────────────────────────────────────────────
-- Moderation + admin hardening
-- ─────────────────────────────────────────────────────────────────────────
--
-- The backend connects as `postgres` superuser or `service_role`, both of
-- which bypass RLS. So the primary defense for privileged columns and the
-- audit trail is NOT a RLS policy but a TRIGGER — triggers DO run for
-- superuser writes.
--
-- Two triggers below enforce:
--   1. `users.role` / `suspendedUntil` / `suspensionReason` can only be
--      changed inside a transaction that sets `app.privileged_update`
--      to 'true'. The admin API does this explicitly; random UPDATE
--      statements fail with a clear error.
--   2. `audit_logs` is append-only — UPDATE and DELETE are rejected for
--      every role. Retention cleanup must be done out-of-band by the DBA.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "blocks"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mutes"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reports"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"  ENABLE ROW LEVEL SECURITY;

-- blocks / mutes: no direct-from-frontend writes (backend only).
-- Users see their own records via authenticated reads for the settings UI.
CREATE POLICY "blocks_self_read" ON "blocks"
  FOR SELECT TO authenticated
  USING (auth.uid() = "blockerId");

CREATE POLICY "mutes_self_read" ON "mutes"
  FOR SELECT TO authenticated
  USING (auth.uid() = "muterId");

-- reports: reporter can see their own reports (for a "my reports" page).
-- Everything else goes through the admin API.
CREATE POLICY "reports_self_read" ON "reports"
  FOR SELECT TO authenticated
  USING (auth.uid() = "reporterId");

-- audit_logs: no anon/authenticated visibility. Staff reads go through
-- the backend which performs its own role checks.

-- ── Trigger: protect users.role / suspendedUntil / suspensionReason ──────
CREATE OR REPLACE FUNCTION public.users_protect_privileged_columns()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."suspendedUntil" IS DISTINCT FROM OLD."suspendedUntil"
    OR NEW."suspensionReason" IS DISTINCT FROM OLD."suspensionReason"
  ) THEN
    IF current_setting('app.privileged_update', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Modifying users.role / suspendedUntil / suspensionReason requires a transaction with SET LOCAL app.privileged_update = ''true''.',
        ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_protect_privileged_columns_trigger ON public.users;
CREATE TRIGGER users_protect_privileged_columns_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_protect_privileged_columns();

-- ── Trigger: audit_logs is append-only ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    MESSAGE = format('audit_logs is append-only (op=%s, role=%s)', TG_OP, current_user),
    ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();

-- ── Defense in depth: revoke privileged column UPDATE from non-service roles ──
-- Noop when the backend runs as superuser; meaningful if you ever point
-- the API at a least-privilege role, and blocks supabase-js from
-- attempting these updates directly.
REVOKE UPDATE ("role", "suspendedUntil", "suspensionReason")
  ON public.users FROM anon, authenticated;
