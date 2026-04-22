import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';

import { AuditLog } from '../../database/entities/audit-log.entity';
import type { AuthUser } from '../types/auth-user.type';

export interface AuditContext {
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  /** Free-text justification. Required for destructive actions. */
  reason?: string;
}

/**
 * Append-only audit trail for privileged actions. Every moderator/admin
 * mutation must call `log()` inside the same transaction (or immediately
 * after) — missing audit entries leave gaps that defeat LGPD Art. 37
 * ("registro das operações de tratamento").
 *
 * The underlying table is protected by a RLS trigger that rejects UPDATE
 * and DELETE for every role, including the service_role the backend uses.
 * See supabase/rls.sql for the enforcement side.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /**
   * Actions that always require a non-empty reason. Centralized so a new
   * destructive endpoint cannot silently bypass the justification bar.
   */
  private static readonly REQUIRES_REASON = new Set([
    'suspend_user',
    'ban_user',
    'erase_user',
    'delete_component',
    'delete_comment',
    'promote_role',
    'demote_role',
  ]);

  constructor(
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
  ) {}

  /**
   * Convenience for controllers — derives the IP + user-agent from the
   * Express request so callers don't have to thread them manually.
   */
  static contextFromRequest(user: AuthUser, req: Request): AuditContext {
    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded ?? '').toString().split(',')[0].trim() || req.ip || null;
    const ua = req.headers['user-agent'];
    return {
      actorId: user.id,
      ipAddress: ipAddress ?? null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null,
    };
  }

  async log(ctx: AuditContext, entry: AuditEntry): Promise<void> {
    if (AuditService.REQUIRES_REASON.has(entry.action) && !entry.reason?.trim()) {
      throw new BadRequestException(
        `Action "${entry.action}" requires a non-empty reason for audit compliance.`,
      );
    }

    try {
      await this.auditLogs.save(
        this.auditLogs.create({
          actorId: ctx.actorId,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: entry.metadata ?? {},
          reason: entry.reason?.trim() || null,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }),
      );
    } catch (err) {
      // Surface loudly — a failed audit write on a privileged action is a
      // compliance-grade incident. We do NOT swallow it: the caller
      // transaction should roll back rather than proceed unaudited.
      this.logger.error(
        `Failed to write audit log for ${entry.action}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
