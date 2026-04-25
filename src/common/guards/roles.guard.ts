import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser, UserRole } from '../types/auth-user.type';

const RANK: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
};

/**
 * Applied per-controller or per-handler with `@Roles('admin')`.
 *
 * Runs AFTER SupabaseAuthGuard so `req.user.role` is already populated
 * from the fresh session hydrate. Admin satisfies moderator; moderator
 * satisfies user. A 403 is thrown on mismatch — not a 404 — because
 * the admin surface is not meant to be discoverable by non-staff.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Insufficient privileges');

    const userRank = RANK[user.role] ?? 0;
    const minRank = Math.min(...required.map((r) => RANK[r] ?? 0));
    if (userRank < minRank) {
      throw new ForbiddenException('Insufficient privileges');
    }
    return true;
  }
}
