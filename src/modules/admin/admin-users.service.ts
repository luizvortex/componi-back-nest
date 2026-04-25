import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { SessionService } from '../../common/session/session.service';
import type { UserRole } from '../../common/types/auth-user.type';

const MODERATOR_MAX_SUSPEND_HOURS = 720; // 30 days
const PERMANENT_BAN_TIMESTAMP = new Date('9999-12-31T23:59:59Z');

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Apply a temporary or permanent suspension. Acts on the protected
   * columns, so the SET LOCAL marker MUST be set inside the same
   * transaction or the trigger will reject the UPDATE with 42501.
   *
   * @param actorRole — passed in so we can enforce moderator's 30-day cap
   *                    server-side without trusting any client field.
   */
  async suspend(
    ctx: AuditContext,
    actorRole: UserRole,
    targetId: string,
    hours: number,
    reason: string,
  ): Promise<void> {
    if (ctx.actorId === targetId) {
      throw new BadRequestException('Cannot suspend yourself');
    }

    const isPermanent = hours === 0;
    if (isPermanent && actorRole !== 'admin') {
      throw new ForbiddenException('Permanent bans are admin-only');
    }
    if (!isPermanent && actorRole === 'moderator' && hours > MODERATOR_MAX_SUSPEND_HOURS) {
      throw new ForbiddenException(
        `Moderators can suspend for up to ${MODERATOR_MAX_SUSPEND_HOURS} hours`,
      );
    }

    const until = isPermanent
      ? PERMANENT_BAN_TIMESTAMP
      : new Date(Date.now() + hours * 60 * 60 * 1000);

    await this.dataSource.transaction(async (trx) => {
      // Required by the users_protect_privileged_columns trigger.
      await trx.query(`SET LOCAL app.privileged_update = 'true'`);

      const result = await trx
        .createQueryBuilder()
        .update(User)
        .set({ suspendedUntil: until, suspensionReason: reason.trim() })
        .where('id = :id AND "deletedAt" IS NULL', { id: targetId })
        .execute();

      if (!result.affected) {
        throw new NotFoundException('User not found');
      }

      await this.audit.log(ctx, {
        action: isPermanent ? 'ban_user' : 'suspend_user',
        targetType: 'user',
        targetId,
        reason,
        metadata: { hours, until: until.toISOString() },
      });
    });

    // Drop the cached session so the suspended user is rejected on their
    // very next request rather than after the 30s TTL.
    await this.sessions.invalidate(targetId);
  }

  async unsuspend(ctx: AuditContext, targetId: string, reason: string): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      await trx.query(`SET LOCAL app.privileged_update = 'true'`);

      const result = await trx
        .createQueryBuilder()
        .update(User)
        .set({ suspendedUntil: null, suspensionReason: null })
        .where('id = :id', { id: targetId })
        .execute();

      if (!result.affected) {
        throw new NotFoundException('User not found');
      }

      await this.audit.log(ctx, {
        action: 'unsuspend_user',
        targetType: 'user',
        targetId,
        reason,
        metadata: {},
      });
    });

    await this.sessions.invalidate(targetId);
  }

  /**
   * Change a user's role. Admin-only at the controller layer
   * (`@Roles('admin')`); this method also rejects the demote-yourself
   * footgun so we don't lock the platform out.
   */
  async setRole(
    ctx: AuditContext,
    targetId: string,
    newRole: UserRole,
    reason: string,
  ): Promise<void> {
    if (ctx.actorId === targetId && newRole !== 'admin') {
      throw new BadRequestException('Cannot demote yourself');
    }

    await this.dataSource.transaction(async (trx) => {
      await trx.query(`SET LOCAL app.privileged_update = 'true'`);

      const rows = (await trx.query(
        `SELECT "id", "role" FROM "users" WHERE "id" = $1 AND "deletedAt" IS NULL`,
        [targetId],
      )) as Array<{ id: string; role: UserRole }>;
      if (!rows.length) {
        throw new NotFoundException('User not found');
      }
      const previousRole = rows[0].role;
      if (previousRole === newRole) {
        return; // no-op
      }

      // Floor: there must remain at least one admin if we're demoting one.
      if (previousRole === 'admin' && newRole !== 'admin') {
        const remaining = (await trx.query(
          `SELECT COUNT(*)::int AS n FROM "users" WHERE "role" = 'admin' AND "deletedAt" IS NULL AND "id" <> $1`,
          [targetId],
        )) as Array<{ n: number }>;
        if ((remaining[0]?.n ?? 0) === 0) {
          throw new BadRequestException(
            'Cannot demote the last admin — promote another user first',
          );
        }
      }

      await trx
        .createQueryBuilder()
        .update(User)
        .set({ role: newRole })
        .where('id = :id', { id: targetId })
        .execute();

      const action =
        ['user', 'moderator', 'admin'].indexOf(newRole) >
        ['user', 'moderator', 'admin'].indexOf(previousRole)
          ? 'promote_role'
          : 'demote_role';

      await this.audit.log(ctx, {
        action,
        targetType: 'user',
        targetId,
        reason,
        metadata: { previousRole, newRole },
      });
    });

    await this.sessions.invalidate(targetId);
  }
}
