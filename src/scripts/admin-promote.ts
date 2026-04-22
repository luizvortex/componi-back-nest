#!/usr/bin/env node
/* eslint-disable no-console */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

import dataSource from '../database/data-source';

/**
 * Bootstrap path for elevating a user's role.
 *
 * Security model
 * ──────────────
 * This CLI is the ONLY way to create the first admin. After that, existing
 * admins can promote/demote via the admin API (which logs to audit_logs
 * with a full actor identity).
 *
 * Gates, in order:
 *   1. `ADMIN_BOOTSTRAP_SECRET` env var must be set (≥ 32 chars) — this
 *      forces the operator to retrieve it from a secrets manager.
 *   2. `--confirm <secret>` must match the env var — prevents accidental
 *      runs inside a shell that already has the env exported.
 *   3. A non-empty `--reason` is required for the audit row.
 *   4. A DB trigger (see supabase/rls.sql) rejects role/suspension writes
 *      unless the session sets `app.privileged_update = 'true'` — this
 *      script sets it inside the transaction.
 *
 * Usage
 * ─────
 *   ADMIN_BOOTSTRAP_SECRET=<secret> \
 *     npm run admin:promote -- \
 *       --user-id <uuid> \
 *       --role admin \
 *       --reason "Founder bootstrap" \
 *       --confirm <same-secret>
 */

type Role = 'user' | 'moderator' | 'admin';
const ALLOWED_ROLES: ReadonlyArray<Role> = ['user', 'moderator', 'admin'];

interface Args {
  userId: string;
  role: Role;
  reason: string;
  confirm: string;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!k.startsWith('--')) continue;
    switch (k) {
      case '--user-id':
        out.userId = v;
        i++;
        break;
      case '--role':
        out.role = v as Role;
        i++;
        break;
      case '--reason':
        out.reason = v;
        i++;
        break;
      case '--confirm':
        out.confirm = v;
        i++;
        break;
      default:
        die(`Unknown flag: ${k}`);
    }
  }
  if (!out.userId) die('Missing --user-id <uuid>');
  if (!out.role) die('Missing --role <user|moderator|admin>');
  if (!out.reason) die('Missing --reason "<justification>"');
  if (!out.confirm) die('Missing --confirm <bootstrap-secret>');
  if (!ALLOWED_ROLES.includes(out.role)) {
    die(`Invalid role "${out.role}". Must be one of ${ALLOWED_ROLES.join(', ')}.`);
  }
  return out as Args;
}

function die(msg: string): never {
  console.error(`[admin:promote] ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!secret || secret.length < 32) {
    die(
      'ADMIN_BOOTSTRAP_SECRET must be set in the environment (>= 32 chars). ' +
        'Retrieve it from your secrets manager before running this script.',
    );
  }

  const args = parseArgs(process.argv.slice(2));

  // Constant-time compare is overkill for a local CLI, but cheap and
  // hardens against the (unlikely) case of a shared-TTY timing attack.
  const a = Buffer.from(args.confirm);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    die('Confirmation secret does not match ADMIN_BOOTSTRAP_SECRET.');
  }

  if (args.reason.trim().length < 10) {
    die('Reason must be at least 10 characters — audit entries need context.');
  }

  await dataSource.initialize();
  try {
    await dataSource.transaction(async (trx) => {
      // Unlock the protected columns for this transaction only.
      await trx.query(`SET LOCAL app.privileged_update = 'true'`);

      const rows = (await trx.query(
        `SELECT "id", "username", "role" FROM "users" WHERE "id" = $1 AND "deletedAt" IS NULL`,
        [args.userId],
      )) as Array<{ id: string; username: string; role: Role }>;
      if (!rows.length) {
        throw new Error(`User ${args.userId} not found or soft-deleted.`);
      }
      const [user] = rows;
      const previousRole = user.role;

      if (previousRole === args.role) {
        console.log(
          `[admin:promote] No-op: ${user.username} (${user.id}) is already ${args.role}.`,
        );
        return;
      }

      await trx.query(`UPDATE "users" SET "role" = $1 WHERE "id" = $2`, [
        args.role,
        args.userId,
      ]);

      // Self-attributed because the CLI pre-dates the existence of any
      // other admin. The metadata.via='cli' label makes the source
      // unambiguous in forensics.
      await trx.query(
        `INSERT INTO "audit_logs" ("actorId", "action", "targetType", "targetId", "metadata", "reason", "ipAddress", "userAgent")
         VALUES ($1, 'promote_role', 'user', $1, $2::jsonb, $3, NULL, 'cli/admin-promote')`,
        [
          args.userId,
          JSON.stringify({ via: 'cli', previousRole, newRole: args.role }),
          args.reason.trim(),
        ],
      );

      console.log(
        `[admin:promote] OK: ${user.username} (${user.id}): ${previousRole} → ${args.role}`,
      );
    });
  } finally {
    await dataSource.destroy();
  }
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { timingSafeEqual: tse } = require('crypto');
  return tse(a, b);
}

main().catch((err) => {
  console.error('[admin:promote] failed:', err?.message || err);
  process.exit(1);
});
