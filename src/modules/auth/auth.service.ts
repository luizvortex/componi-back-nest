import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import type { AuthUser } from '../../common/types/auth-user.type';

@Injectable()
export class AuthService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /**
   * Mirrors Supabase's auth.users into our own users table on first request
   * so domain relations and RLS policies work against a row we own.
   *
   * Provider-aware: pulls username from GitHub's `user_name`, Google's
   * email prefix, etc. Username collisions get a numeric suffix.
   */
  async getOrProvisionProfile(auth: AuthUser): Promise<User> {
    const existing = await this.users.findOne({ where: { id: auth.id } });
    if (existing) return existing;

    const meta = (auth.claims['user_metadata'] ?? {}) as Record<string, unknown>;
    const baseUsername = this.deriveUsername(auth, meta);
    const displayName =
      (meta['full_name'] as string | undefined) ?? (meta['name'] as string | undefined) ?? null;
    const avatarUrl = (meta['avatar_url'] as string | undefined) ?? null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const username = attempt === 0 ? baseUsername : `${baseUsername}-${attempt + 1}`;
      try {
        const user = this.users.create({
          id: auth.id,
          email: auth.email ?? `${auth.id}@placeholder.local`,
          username,
          githubUsername: auth.githubUsername,
          displayName,
          avatarUrl,
        });
        return await this.users.save(user);
      } catch (err) {
        if (err instanceof QueryFailedError && (err as { code?: string }).code === '23505') {
          continue;
        }
        throw err;
      }
    }
    throw new Error('Could not allocate a unique username after 5 attempts');
  }

  private deriveUsername(auth: AuthUser, meta: Record<string, unknown>): string {
    const candidate =
      (meta['user_name'] as string | undefined) ??
      (meta['preferred_username'] as string | undefined) ??
      auth.githubUsername ??
      auth.email?.split('@')[0] ??
      `user-${auth.id.slice(0, 8)}`;
    return candidate
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || `user-${auth.id.slice(0, 8)}`;
  }
}
