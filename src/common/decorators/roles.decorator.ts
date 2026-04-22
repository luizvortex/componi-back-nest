import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../types/auth-user.type';

export const ROLES_KEY = 'roles';

/**
 * Marks a handler as requiring one of the listed roles. Enforced by
 * RolesGuard, which runs AFTER SupabaseAuthGuard (req.user is populated
 * with the hydrated role).
 *
 * Roles form a hierarchy: admin ⊇ moderator ⊇ user. So `@Roles('moderator')`
 * is satisfied by both 'moderator' and 'admin'.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
