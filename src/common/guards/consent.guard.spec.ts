import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { ConsentGuard } from './consent.guard';
import type { AuthUser } from '../types/auth-user.type';

// Minimal context factory — only what ConsentGuard actually reads.
function ctx(opts: {
  user?: Partial<AuthUser> | null;
  method?: string;
  skip?: boolean;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: opts.user ?? undefined,
        method: opts.method ?? 'POST',
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    // Reflector is what reads the skip flag — our stub below short-circuits this.
  } as unknown as ExecutionContext;
}

function make(skip = false) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(skip) } as unknown as Reflector;
  const config = {
    get: (key: string) =>
      key === 'compliance.privacyVersion'
        ? '2026-04-23'
        : key === 'compliance.termsVersion'
          ? '2026-04-23'
          : undefined,
  } as unknown as ConfigService;
  return new ConsentGuard(reflector, config);
}

const accepted: AuthUser = {
  id: 'u1',
  email: null,
  githubUsername: null,
  provider: null,
  role: 'user',
  suspendedUntil: null,
  privacyAcceptedVersion: '2026-04-23',
  termsAcceptedVersion: '2026-04-23',
  claims: {},
};

describe('ConsentGuard', () => {
  it('allows unauthenticated requests', () => {
    expect(make().canActivate(ctx({ user: null }))).toBe(true);
  });

  it('allows GET regardless of consent state', () => {
    const stale = { ...accepted, privacyAcceptedVersion: '2025-01-01' };
    expect(make().canActivate(ctx({ user: stale, method: 'GET' }))).toBe(true);
  });

  it('allows when both versions match current', () => {
    expect(make().canActivate(ctx({ user: accepted, method: 'POST' }))).toBe(true);
  });

  it('blocks writes when privacy version is stale', () => {
    const stale = { ...accepted, privacyAcceptedVersion: '2025-01-01' };
    expect(() => make().canActivate(ctx({ user: stale, method: 'POST' }))).toThrow(
      ForbiddenException,
    );
  });

  it('blocks writes when terms version is stale', () => {
    const stale = { ...accepted, termsAcceptedVersion: null };
    expect(() => make().canActivate(ctx({ user: stale, method: 'PATCH' }))).toThrow(
      ForbiddenException,
    );
  });

  it('honors @SkipConsentCheck() metadata', () => {
    const stale = { ...accepted, privacyAcceptedVersion: null };
    expect(make(true).canActivate(ctx({ user: stale, method: 'POST' }))).toBe(true);
  });
});
