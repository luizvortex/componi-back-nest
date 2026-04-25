import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SupabaseClaims, SupabaseJwtVerifier } from '../auth/supabase-jwt-verifier';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
import { SessionService } from '../session/session.service';
import type { AuthUser } from '../types/auth-user.type';

/**
 * Validates Supabase-issued JWTs.
 *
 * Behavior by decorator:
 *   • @Public()        — no auth, req.user is never populated
 *   • @OptionalAuth()  — auth attempted; valid token populates req.user, missing/invalid is ignored
 *   • (default)        — bearer token required; throws 401 if missing/invalid
 *
 * The actual JWT crypto is delegated to SupabaseJwtVerifier so the
 * WebSocket gateway can reuse it without duplicating the strategy
 * branching.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: SupabaseJwtVerifier,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractBearer(req);

    if (!token) {
      if (isOptional) return true;
      throw new UnauthorizedException('Missing bearer token');
    }

    let claims: SupabaseClaims;
    try {
      claims = await this.verifier.verify(token);
      if (!claims.sub) throw new Error('Token missing subject');
    } catch (err) {
      this.logger.debug(`JWT verification failed: ${(err as Error).message}`);
      if (isOptional) return true;
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Hydrate role + suspension from the local users row (cached 30s).
    // A valid JWT for a suspended user must still be rejected — the ban
    // check cannot live in JWT claims because tokens last up to 1h.
    const session = await this.sessions.hydrate(claims.sub as string);
    if (!session) {
      // Auth row not yet provisioned (first request after signup). Proceed
      // as a default 'user' — AuthService will mirror the row shortly.
      req.user = this.toAuthUser(claims, 'user', null, null, null);
      return true;
    }

    if (session.suspendedUntil && session.suspendedUntil.getTime() > Date.now()) {
      throw new ForbiddenException({
        message: 'Account suspended',
        suspendedUntil: session.suspendedUntil.toISOString(),
      });
    }

    req.user = this.toAuthUser(
      claims,
      session.role,
      session.suspendedUntil,
      session.privacyAcceptedVersion,
      session.termsAcceptedVersion,
    );
    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token.trim();
  }

  private toAuthUser(
    claims: SupabaseClaims,
    role: AuthUser['role'],
    suspendedUntil: Date | null,
    privacyAcceptedVersion: string | null,
    termsAcceptedVersion: string | null,
  ): AuthUser {
    return {
      id: claims.sub as string,
      email: claims.email ?? null,
      githubUsername:
        claims.user_metadata?.user_name ?? claims.user_metadata?.preferred_username ?? null,
      provider: claims.app_metadata?.provider ?? null,
      role,
      suspendedUntil,
      privacyAcceptedVersion,
      termsAcceptedVersion,
      claims,
    };
  }
}
