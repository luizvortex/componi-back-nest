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
import type { AuthUser } from '../types/auth-user.type';
import type { SupabaseJwtStrategy } from '../../config/supabase.config';

type SupabaseClaims = JWTPayload & {
  email?: string;
  user_metadata?: {
    user_name?: string;
    preferred_username?: string;
    [k: string]: unknown;
  };
  app_metadata?: {
    provider?: string;
    providers?: string[];
    [k: string]: unknown;
  };
};

/**
 * Validates Supabase-issued JWTs on every request.
 *
 * Two strategies are supported (see SUPABASE_JWT_STRATEGY):
 *   • hs256 — symmetric verification with the shared JWT secret. Simplest.
 *   • jwks  — asymmetric verification against Supabase's JWKS endpoint. Safer.
 *
 * Routes annotated with @Public() skip validation entirely.
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

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractBearer(req);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const claims = await this.verify(token);
    if (!claims.sub) throw new UnauthorizedException('Token missing subject');

    req.user = {
      id: claims.sub,
      email: claims.email ?? null,
      githubUsername:
        claims.user_metadata?.user_name ?? claims.user_metadata?.preferred_username ?? null,
      claims,
    };
    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token.trim();
  }

  private async verify(token: string): Promise<SupabaseClaims> {
    const strategy = this.config.get<SupabaseJwtStrategy>('supabase.jwt.strategy', 'hs256');
    const audience = this.config.get<string>('supabase.jwt.audience');
    const issuer = this.config.get<string | undefined>('supabase.jwt.issuer');

    try {
      if (strategy === 'jwks') {
        const jwksUri = this.config.get<string>('supabase.jwt.jwksUri');
        if (!jwksUri) throw new Error('SUPABASE_JWKS_URI not configured');
        if (!this.jwks) this.jwks = createRemoteJWKSet(new URL(jwksUri));
        const { payload } = await jwtVerify(token, this.jwks, {
          audience,
          issuer,
        });
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
    } catch (err) {
      this.logger.debug(`JWT verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
