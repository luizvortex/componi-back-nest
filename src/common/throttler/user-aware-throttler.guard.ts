import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

import type { AuthUser } from '../types/auth-user.type';

/**
 * Keys throttling by userId when a token was validated, falls back to IP
 * otherwise. Without this, one logged-in user behind a CGNAT cannot share
 * an IP with another user without cannibalizing each other's quota — and
 * a banned user can rotate IPs to bypass limits.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: AuthUser }).user;
    if (user?.id) return `u:${user.id}`;
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded ?? '').toString().split(',')[0].trim() || req.ip;
    return `ip:${ip ?? 'unknown'}`;
  }
}
