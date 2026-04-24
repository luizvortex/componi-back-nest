import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SessionService } from '../../common/session/session.service';
import { User } from '../../database/entities/user.entity';

export interface ConsentStatus {
  privacy: {
    currentVersion: string;
    acceptedVersion: string | null;
    acceptedAt: Date | null;
    needsAcceptance: boolean;
  };
  terms: {
    currentVersion: string;
    acceptedVersion: string | null;
    acceptedAt: Date | null;
    needsAcceptance: boolean;
  };
}

export interface AcceptConsentDto {
  acceptPrivacy?: boolean;
  acceptTerms?: boolean;
}

/**
 * Tracks LGPD Art. 8º consent. Versions are compared as plain strings —
 * bumping `compliance.privacyVersion` / `compliance.termsVersion` in the
 * config (or env) makes existing acceptances stale, so the frontend
 * should call `getStatus` on load and surface a banner if either
 * `needsAcceptance` is true.
 */
@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
  ) {}

  async getStatus(userId: string): Promise<ConsentStatus> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: {
        id: true,
        privacyAcceptedAt: true,
        privacyAcceptedVersion: true,
        termsAcceptedAt: true,
        termsAcceptedVersion: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const currentPrivacy = this.config.get<string>('compliance.privacyVersion')!;
    const currentTerms = this.config.get<string>('compliance.termsVersion')!;

    return {
      privacy: {
        currentVersion: currentPrivacy,
        acceptedVersion: user.privacyAcceptedVersion,
        acceptedAt: user.privacyAcceptedAt,
        needsAcceptance: user.privacyAcceptedVersion !== currentPrivacy,
      },
      terms: {
        currentVersion: currentTerms,
        acceptedVersion: user.termsAcceptedVersion,
        acceptedAt: user.termsAcceptedAt,
        needsAcceptance: user.termsAcceptedVersion !== currentTerms,
      },
    };
  }

  /**
   * Records acceptance of the currently-configured version(s). Passing
   * `{}` is a no-op. The method always records the *server-side* version
   * string — we never trust a client-supplied version so a replay attack
   * can't mark an older policy as accepted.
   */
  async accept(userId: string, dto: AcceptConsentDto): Promise<ConsentStatus> {
    const patch: Record<string, Date | string> = {};
    const now = new Date();

    if (dto.acceptPrivacy) {
      patch.privacyAcceptedAt = now;
      patch.privacyAcceptedVersion = this.config.get<string>('compliance.privacyVersion')!;
    }
    if (dto.acceptTerms) {
      patch.termsAcceptedAt = now;
      patch.termsAcceptedVersion = this.config.get<string>('compliance.termsVersion')!;
    }

    if (Object.keys(patch).length) {
      const result = await this.users
        .createQueryBuilder()
        .update(User)
        .set(patch)
        .where('id = :id', { id: userId })
        .execute();
      if (!result.affected) throw new NotFoundException('User not found');
      // Drop the cached session so ConsentGuard sees the fresh versions
      // on the next request instead of up to 30s later.
      await this.sessions.invalidate(userId);
    }

    return this.getStatus(userId);
  }
}
