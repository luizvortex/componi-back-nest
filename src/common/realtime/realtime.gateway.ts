import { Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { isUUID } from 'class-validator';

import { SupabaseJwtVerifier } from '../auth/supabase-jwt-verifier';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { SessionService } from '../session/session.service';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketUserData,
} from './realtime.types';

type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketUserData
>;

/**
 * Socket.IO entrypoint. Mounted on the same HTTP server as the API.
 *
 * Connection contract:
 *   1. Client opens socket with `auth: { token: '<bearer>' }` (Socket.IO
 *      `io.auth` payload — sent during the handshake, never as a query
 *      string so the token doesn't leak into proxy access logs).
 *   2. Server verifies via SupabaseJwtVerifier, hydrates the local
 *      session (rejects suspended/deleted users), and auto-joins the
 *      `user:${userId}` room.
 *   3. Client may then `subscribe:component` to receive live updates
 *      on a specific component's detail page.
 *
 * Ack contract: `subscribe:component` takes a callback the server uses
 * to report success or a structured error code — easier to handle on
 * the client than parsing free-form `error` events.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { credentials: true },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly maxSubscriptions: number;
  private readonly enabled: boolean;
  private readonly adapterStrategy: 'memory' | 'redis';

  @WebSocketServer()
  readonly server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly verifier: SupabaseJwtVerifier,
    @Inject(forwardRef(() => SessionService))
    private readonly sessions: SessionService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('realtime.enabled', true);
    this.maxSubscriptions = config.get<number>(
      'realtime.maxComponentSubscriptions',
      20,
    );
    this.adapterStrategy = config.get<'memory' | 'redis'>(
      'realtime.adapter',
      'memory',
    );
  }

  async afterInit(server: Server): Promise<void> {
    if (!this.enabled) {
      this.logger.log('realtime disabled — gateway will reject all connections');
      return;
    }
    if (this.adapterStrategy === 'redis') {
      // Duplicate the existing client for pub + sub — Socket.IO needs
      // two dedicated subscribers, can't share with cache/throttler.
      const pubClient = this.redis.duplicate();
      const subClient = this.redis.duplicate();
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('redis adapter wired — multi-instance broadcast OK');
    } else {
      this.logger.log('memory adapter — single-instance only');
    }
  }

  async handleConnection(client: RealtimeSocket): Promise<void> {
    if (!this.enabled) {
      client.emit('error', { code: 'DISABLED', message: 'Realtime disabled' });
      client.disconnect(true);
      return;
    }

    try {
      const userId = await this.authenticate(client);
      client.data.userId = userId;
      client.data.componentSubscriptions = new Set();
      await client.join(this.userRoom(userId));
      this.logger.debug(`connected user=${userId} sid=${client.id}`);
    } catch (err) {
      this.logger.debug(
        `auth rejected sid=${client.id}: ${(err as Error).message}`,
      );
      client.emit('error', {
        code: 'AUTH',
        message: (err as Error).message,
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: RealtimeSocket): void {
    // Socket.IO drops room membership automatically. Nothing else to clean up
    // — `client.data` dies with the socket. Logging only.
    if (client.data.userId) {
      this.logger.debug(`disconnected user=${client.data.userId} sid=${client.id}`);
    }
  }

  @SubscribeMessage('subscribe:component')
  async onSubscribeComponent(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() componentId: unknown,
  ): Promise<{ ok: boolean; error?: string }> {
    if (typeof componentId !== 'string' || !isUUID(componentId)) {
      return { ok: false, error: 'invalid_component_id' };
    }
    const subs = client.data.componentSubscriptions;
    if (!subs) return { ok: false, error: 'not_authenticated' };
    if (subs.has(componentId)) return { ok: true };
    if (subs.size >= this.maxSubscriptions) {
      return { ok: false, error: 'subscription_limit_reached' };
    }
    await client.join(this.componentRoom(componentId));
    subs.add(componentId);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe:component')
  async onUnsubscribeComponent(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() componentId: unknown,
  ): Promise<void> {
    if (typeof componentId !== 'string' || !isUUID(componentId)) return;
    if (!client.data.componentSubscriptions?.has(componentId)) return;
    await client.leave(this.componentRoom(componentId));
    client.data.componentSubscriptions.delete(componentId);
  }

  // ── public room helpers (used by RealtimeService) ─────────────────

  userRoom(userId: string): string {
    return `user:${userId}`;
  }

  componentRoom(componentId: string): string {
    return `component:${componentId}`;
  }

  // ──────────────────────────────────────────────────────────────────

  private async authenticate(client: RealtimeSocket): Promise<string> {
    const token = this.extractToken(client);
    if (!token) throw new Error('missing token');

    const claims = await this.verifier.verify(token);
    if (!claims.sub) throw new Error('token missing subject');

    const session = await this.sessions.hydrate(claims.sub);
    if (!session) throw new Error('user not provisioned');
    if (
      session.suspendedUntil &&
      session.suspendedUntil.getTime() > Date.now()
    ) {
      throw new Error('account suspended');
    }
    return claims.sub;
  }

  /**
   * Token sources, in order of preference:
   *   1. `auth.token` from the Socket.IO handshake (recommended — never
   *      hits the URL line so it's safe from access-log leaks).
   *   2. `Authorization: Bearer …` request header (works for clients
   *      that can't set custom auth payloads).
   * Query-string tokens are intentionally NOT supported — too easy to
   * end up in proxy logs / browser history.
   */
  private extractToken(client: RealtimeSocket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (auth && typeof auth.token === 'string' && auth.token.length) {
      return auth.token;
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string') {
      const [scheme, token] = header.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) return token.trim();
    }
    return null;
  }
}
