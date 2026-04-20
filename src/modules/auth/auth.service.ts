import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import type { AuthUser } from '../../common/types/auth-user.type';

@Injectable()
export class AuthService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /**
   * Nest mirrors Supabase's auth.users into our own users table on first request
   * so relations and RLS work on top of a domain-owned row.
   */
  async getOrProvisionProfile(auth: AuthUser): Promise<User> {
    const existing = await this.users.findOne({ where: { id: auth.id } });
    if (existing) return existing;

    const username = auth.githubUsername ?? auth.email?.split('@')[0] ?? `user-${auth.id.slice(0, 8)}`;
    const user = this.users.create({
      id: auth.id,
      email: auth.email ?? `${auth.id}@placeholder.local`,
      username,
      githubUsername: auth.githubUsername,
    });
    return this.users.save(user);
  }
}
