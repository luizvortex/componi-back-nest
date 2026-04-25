import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import * as jwt from 'jsonwebtoken';

import type { SupabaseJwtStrategy } from '../../config/supabase.config';

/**
 * Supabase-issued JWT claims we care about. The full Supabase token has
 * many fields — we only declare the ones the app actually reads.
 */
export type SupabaseClaims = JWTPayload & {
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
 * Single source of truth for verifying Supabase JWTs. Used by the HTTP
 * SupabaseAuthGuard and by the WebSocket RealtimeGateway — keeping the
 * crypto in one place avoids the "two slightly different implementations
 * drift apart over time" failure mode.
 *
 * Strategy is picked by config:
 *   - 'jwks' — RS256, public keys fetched from SUPABASE_JWKS_URI.
 *     Production-grade; rotates without redeployment.
 *   - 'hs256' — shared secret (SUPABASE_JWT_SECRET). Easier in dev.
 *
 * The JWKS client is cached lazily — first call creates it, subsequent
 * calls reuse the same fetcher (`jose` rotates the keys internally).
 */
@Injectable()
export class SupabaseJwtVerifier {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<SupabaseClaims> {
    const strategy = this.config.get<SupabaseJwtStrategy>(
      'supabase.jwt.strategy',
      'hs256',
    );
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
