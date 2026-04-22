import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import type { UserRole } from '../types/auth-user.type';
import { CacheService } from '../cache/cache.service';

export interface SessionState {
  role: UserRole;
  suspendedUntil: Date | null;
}

/**
 * Hot-path lookup for role + suspension status, used by SupabaseAuthGuard
 * on every authenticated request.
 *
 * Cached in Redis for 30 seconds to keep request latency stable, with
 * explicit invalidation on any action that mutates role or suspension
 * (suspend / unsuspend / promote / demote). 30s is a deliberate ceiling
 * on how long a just-banned user can still operate — admin flows should
 * always follow the mutation with `invalidate(userId)`.
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly cache: CacheService,
  ) {}

  async hydrate(userId: string): Promise<SessionState | null> {
    const cached = await this.cache.get<SessionState>(this.key(userId));
    if (cached) {
      // Dates round-trip as ISO strings through JSON.
      return {
        role: cached.role,
        suspendedUntil: cached.suspendedUntil
          ? new Date(cached.suspendedUntil as unknown as string)
          : null,
      };
    }

    const row = await this.users
      .createQueryBuilder('u')
      .select(['u.id', 'u.role', 'u.suspendedUntil', 'u.deletedAt'])
      .where('u.id = :id', { id: userId })
      .getOne();

    if (!row || row.deletedAt) return null;

    const state: SessionState = {
      role: row.role,
      suspendedUntil: row.suspendedUntil,
    };
    await this.cache.set(this.key(userId), state, 30, [`user:${userId}:session`]);
    return state;
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.invalidateTags(`user:${userId}:session`);
  }

  private key(userId: string): string {
    return `session:${userId}`;
  }
}
