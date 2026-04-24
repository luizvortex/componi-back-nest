import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SKIP_CONSENT_CHECK_KEY } from '../decorators/skip-consent-check.decorator';
import type { AuthUser } from '../types/auth-user.type';

/**
 * Rejects write requests (POST / PUT / PATCH / DELETE) from authenticated
 * users whose privacy or terms acceptance is older than the current
 * server-side version. Reads (GET / HEAD / OPTIONS) are allowed so the
 * frontend can still render the consent modal data.
 *
 * Unauthenticated requests (no req.user) pass through — they're handled
 * by other guards. Service-account or internal calls without a user
 * object aren't in scope.
 *
 * Opt-outs via @SkipConsentCheck():
 *   - GET/POST /users/me/consent — the user needs to be able to read
 *     the current version and accept it.
 *   - DELETE /users/me — LGPD erasure must remain reachable.
 *   - GET /users/me/export — LGPD portability must remain reachable.
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CONSENT_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user) return true;

    // Only gate mutations — reads are always allowed so the client can
    // fetch what it needs to render the consent prompt.
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;

    const currentPrivacy = this.config.get<string>('compliance.privacyVersion');
    const currentTerms = this.config.get<string>('compliance.termsVersion');

    const needsPrivacy = req.user.privacyAcceptedVersion !== currentPrivacy;
    const needsTerms = req.user.termsAcceptedVersion !== currentTerms;

    if (needsPrivacy || needsTerms) {
      throw new ForbiddenException({
        message: 'Consent required',
        code: 'CONSENT_REQUIRED',
        needsPrivacy,
        needsTerms,
        currentVersions: { privacy: currentPrivacy, terms: currentTerms },
      });
    }

    return true;
  }
}
