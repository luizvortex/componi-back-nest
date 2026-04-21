import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
import type { AuthUser } from '../types/auth-user.type';
import type { SupabaseJwtStrategy } from '../../config/supabase.config';

type SupabaseClaims = JWTPayload & {
  email?: string;
  user_metadata?: {
    user_name?: string;
    preferred_username?: string;
    full_name?: string;
    name?: string;
    avatar_url?: string;
    [k: string]: unknown;
  };
  app_metadata?: {
    provider?: string;
    providers?: string[];
    [k: string]: unknown;
  };
};

/**
 * Validates Supabase-issued JWTs.
 *
 * Behavior by decorator:
 *   • @Public()        — no auth, req.user is never populated
 *   • @OptionalAuth()  — auth attempted; valid token populates req.user, missing/invalid is ignored
 *   • (default)        — bearer token required; throws 401 if missing/invalid
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
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

    try {
      const claims = await this.verify(token);
      if (!claims.sub) throw new Error('Token missing subject');
      req.user = this.toAuthUser(claims);
      return true;
    } catch (err) {
      this.logger.debug(`JWT verification failed: ${(err as Error).message}`);
      if (isOptional) return true;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token.trim();
  }

  private toAuthUser(claims: SupabaseClaims): AuthUser {
    return {
      id: claims.sub as string,
      email: claims.email ?? null,
      githubUsername:
        claims.user_metadata?.user_name ?? claims.user_metadata?.preferred_username ?? null,
      provider: claims.app_metadata?.provider ?? null,
      claims,
    };
  }

  private async verify(token: string): Promise<SupabaseClaims> {
    const strategy = this.config.get<SupabaseJwtStrategy>('supabase.jwt.strategy', 'hs256');
    const audience = this.config.get<string>('supabase.jwt.audience');
    const issuer = this.config.get<string | undefined>('supabase.jwt.issuer');

    if (strategy === 'jwks') {
      const jwksUri = this.config.get<string>('supabase.jwt.jwksUri');
      if (!jwksUri) throw new Error('SUPABASE_JWKS_URI not configured');
      if (!this.jwks) this.jwks = createRemoteJWKSet(new URL(jwksUri));
      const { payload } = await jwtVerify(token, this.jwks, { audience, issuer });
      return payload as SupabaseClaims;
    }

    const secret = this.config.get<string>('supabase.jwt.secret');
    if (!secret) throw new Error('SUPABASE_JWT_SECRET not configured');
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience,
      issuer: issuer || undefined,
    });
    if (typeof decoded === 'string') throw new Error('Unexpected token shape');
    return decoded as SupabaseClaims;
  }
}
