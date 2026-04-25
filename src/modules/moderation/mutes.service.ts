import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { Mute } from '../../database/entities/mute.entity';
import { User } from '../../database/entities/user.entity';
import { CacheService } from '../../common/cache/cache.service';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class MutesService {
  constructor(
    @InjectRepository(Mute) private readonly mutes: Repository<Mute>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly cache: CacheService,
  ) {}

  async mute(muterId: string, mutedId: string): Promise<void> {
    if (muterId === mutedId) {
      throw new BadRequestException('Cannot mute yourself');
    }

    const target = await this.users.findOne({
      where: { id: mutedId },
      select: { id: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      throw new NotFoundException('User not found');
    }

    try {
      await this.mutes.insert({ muterId, mutedId });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        return; // already muted — idempotent
      }
      throw err;
    }

    // Only the muter's feed changes. The muted user is deliberately
    // unaware (that's the whole point of mute vs block), so their feed
    // stays untouched.
    await this.cache.invalidateTags(`user:${muterId}:feed`);
  }

  async unmute(muterId: string, mutedId: string): Promise<void> {
    await this.mutes.delete({ muterId, mutedId });
    await this.cache.invalidateTags(`user:${muterId}:feed`);
  }

  listForMuter(muterId: string): Promise<Mute[]> {
    return this.mutes.find({
      where: { muterId },
      relations: { muted: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
