import { ConfigService } from '@nestjs/config';

import { SupabaseJwtVerifier } from '../auth/supabase-jwt-verifier';
import { SessionService } from '../session/session.service';
import { RealtimeGateway } from './realtime.gateway';

function makeGateway(maxSubs = 3) {
  const verifier = { verify: jest.fn() } as unknown as SupabaseJwtVerifier;
  const sessions = { hydrate: jest.fn() } as unknown as SessionService;
  const redis = { duplicate: jest.fn() } as any;
  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'realtime.enabled') return true;
      if (key === 'realtime.maxComponentSubscriptions') return maxSubs;
      if (key === 'realtime.adapter') return 'memory';
      return fallback;
    },
  } as unknown as ConfigService;
  return new RealtimeGateway(verifier, sessions, redis, config);
}

function makeSocket(authenticated = true) {
  return {
    id: 'sid-1',
    data: authenticated
      ? { userId: 'u1', componentSubscriptions: new Set<string>() }
      : ({} as any),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('RealtimeGateway.subscribe:component', () => {
  const VALID = '11111111-1111-4111-8111-111111111111';

  it('rejects non-uuid component ids', async () => {
    const gw = makeGateway();
    const sock = makeSocket();
    const result = await gw.onSubscribeComponent(sock, 'not-a-uuid');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_component_id');
    expect(sock.join).not.toHaveBeenCalled();
  });

  it('rejects when socket is not authenticated', async () => {
    const gw = makeGateway();
    const sock = makeSocket(false);
    const result = await gw.onSubscribeComponent(sock, VALID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_authenticated');
  });

  it('joins the component room and records the subscription', async () => {
    const gw = makeGateway();
    const sock = makeSocket();
    const result = await gw.onSubscribeComponent(sock, VALID);
    expect(result.ok).toBe(true);
    expect(sock.join).toHaveBeenCalledWith(`component:${VALID}`);
    expect(sock.data.componentSubscriptions.has(VALID)).toBe(true);
  });

  it('is idempotent — same id twice returns ok without re-joining', async () => {
    const gw = makeGateway();
    const sock = makeSocket();
    await gw.onSubscribeComponent(sock, VALID);
    sock.join.mockClear();
    const result = await gw.onSubscribeComponent(sock, VALID);
    expect(result.ok).toBe(true);
    expect(sock.join).not.toHaveBeenCalled();
  });

  it('enforces the per-socket subscription cap', async () => {
    const gw = makeGateway(2);
    const sock = makeSocket();
    await gw.onSubscribeComponent(sock, VALID);
    await gw.onSubscribeComponent(sock, '22222222-2222-4222-8222-222222222222');
    const overflow = await gw.onSubscribeComponent(
      sock,
      '33333333-3333-4333-8333-333333333333',
    );
    expect(overflow.ok).toBe(false);
    expect(overflow.error).toBe('subscription_limit_reached');
  });
});

describe('RealtimeGateway.unsubscribe:component', () => {
  const VALID = '11111111-1111-4111-8111-111111111111';

  it('leaves the room and forgets the subscription', async () => {
    const gw = makeGateway();
    const sock = makeSocket();
    await gw.onSubscribeComponent(sock, VALID);
    await gw.onUnsubscribeComponent(sock, VALID);
    expect(sock.leave).toHaveBeenCalledWith(`component:${VALID}`);
    expect(sock.data.componentSubscriptions.has(VALID)).toBe(false);
  });

  it('silently ignores unknown ids', async () => {
    const gw = makeGateway();
    const sock = makeSocket();
    await gw.onUnsubscribeComponent(sock, VALID);
    expect(sock.leave).not.toHaveBeenCalled();
  });
});
