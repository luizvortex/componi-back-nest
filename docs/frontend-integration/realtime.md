# Realtime — Socket.IO

The backend exposes a Socket.IO namespace at **`/realtime`** for live
notifications, follower alerts, and per-component-detail events
(likes, comments arriving while the user is viewing the component).

> **The DB row is the source of truth.** Every realtime event has a
> matching row that landed first. If a user's socket is offline, they
> still see the data on next page load — the live stream is a *push
> nudge*, not a sync protocol.

## Connection contract

```ts
import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from './types/realtime'; // copy of src/common/realtime/realtime.types.ts

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  `${API_URL}/realtime`,
  {
    auth: { token: supabaseAccessToken }, // ← never as query string
    transports: ['websocket'],
    reconnection: true,
  },
);
```

### What happens server-side on connect

1. Pulls the token from `auth.token` (preferred) or `Authorization:
   Bearer …` header. **Query-string tokens are not supported.**
2. Verifies the JWT via the same `SupabaseJwtVerifier` the HTTP guard
   uses — algorithm, audience, issuer all match.
3. Hydrates the local session — rejects if the user is suspended or
   their account hasn't been provisioned yet.
4. Auto-joins `user:${userId}` so personal events reach them.

If any step fails the server emits a single `error` event and
disconnects:

```ts
socket.on('error', ({ code, message }) => {
  if (code === 'AUTH') {
    // refresh token + reconnect, or redirect to login
  }
  if (code === 'DISABLED') {
    // backend has REALTIME_ENABLED=false; degrade gracefully
  }
});
```

## Event catalogue

All events are **server → client** unless noted otherwise. The full type
definition lives in `types/realtime.ts` — keep that file as the source
of truth on the frontend.

### `notification` — pushed when any notification row is written

```ts
socket.on('notification', ({ type, actorId, payload, createdAt }) => {
  // type:    'like' | 'favorite' | 'comment' | 'reply'
  //        | 'follow' | 'mention' | 'version'
  // actorId: who caused it (or null for system events)
  // payload: { componentId?, commentId?, ... } — opaque, type-dependent
  // createdAt: ISO timestamp
});
```

Sent to: `user:${recipientId}`. Only the recipient gets it.

### `component:like` / `component:unlike`

```ts
socket.on('component:like', ({ componentId, actorId, likesCount }) => {
  // Update the like count in the component's UI; bump if needed
});
```

Sent to: `component:${componentId}` room. **You only receive these if
you've subscribed** — see *Subscriptions* below.

### `component:comment`

```ts
socket.on('component:comment', ({
  componentId,
  commentId,
  actorId,
  commentsCount,
}) => {
  // Show "new comment" toast or prepend to the list
});
```

Sent to: `component:${componentId}` room. Same subscription rule.

### `user:follow` — someone followed *you*

```ts
socket.on('user:follow', ({ followerId, followersCount }) => {
  // Bump the follower count, optionally show a toast
});
```

Sent to: `user:${followeeId}`. The followee receives it; nobody else.

### `error` — terminal connection error

Already covered in *Connection contract*. Fired and the socket is
disconnected by the server.

## Subscriptions (component rooms)

Component-detail events are opt-in to keep the broadcast graph cheap.
Send a `subscribe:component` message when the user opens a component
detail page; send `unsubscribe:component` when they navigate away.

```ts
// Subscribing to a component room (call when entering /components/:id)
const componentId = '...'; // must be a valid UUID
socket.emit('subscribe:component', componentId, (ack) => {
  // ack: { ok: boolean, error?: string }
  if (!ack.ok) console.warn('subscribe failed:', ack.error);
});

// Unsubscribing (call when leaving the page)
socket.emit('unsubscribe:component', componentId);
```

### Server-side rules

- `subscribe:component` validates the UUID. Anything else returns
  `{ ok: false, error: 'invalid_component_id' }`.
- A single socket may be subscribed to **at most 20 components** at a
  time. Beyond that you get
  `{ ok: false, error: 'subscription_limit_reached' }`.
- Re-subscribing to the same id is a no-op (idempotent).
- An unauthenticated socket (rare — should have been rejected at
  connect) gets `{ ok: false, error: 'not_authenticated' }`.

## Reconnect / dropped connection

Socket.IO reconnects automatically. The client SDK preserves the
`auth.token` payload, so reconnects re-authenticate transparently.

What you DO need to handle:

- **Token refreshed mid-session** — when Supabase refreshes the access
  token, update the auth payload before the next reconnect:
  ```ts
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) socket.auth = { token: session.access_token };
  });
  ```
- **Component subscriptions don't survive reconnects** — the server
  forgets your room memberships when the socket drops. Re-subscribe
  on the `connect` event:
  ```ts
  socket.on('connect', () => {
    if (currentComponentId) {
      socket.emit('subscribe:component', currentComponentId, () => {});
    }
  });
  ```
- **User got suspended while connected** — the server doesn't actively
  kick existing sockets when an admin suspends a user; the kick happens
  on next reconnect. For now, when the user gets a 403 *Account
  suspended* on an HTTP request, manually disconnect the socket too.

## Ordering and durability

- **Within a single component room**, events are ordered (Socket.IO
  preserves order per-namespace per-room).
- **Across rooms**, no global ordering. A user might receive a `notification`
  event for a comment after the `component:comment` event hits the
  detail page. That's fine — they're independent.
- **No replay.** If the socket was disconnected when the event fired,
  it's gone from the realtime layer. The DB row is still there — fall
  back to `GET /notifications` on next page load.

## Multi-instance deployments

The current default is `REALTIME_ADAPTER=memory` — fine for single-Node
deploys (the typical hobby setup). If the backend scales to >1 instance,
the operator flips to `REALTIME_ADAPTER=redis` and Socket.IO uses the
existing Redis client to broadcast across nodes. **Frontend code
doesn't change** either way — the client sees a single endpoint.

## Block-state and existing subscriptions

Known limitation: a socket already subscribed to `component:${id}`
keeps receiving events on that room even if the author blocks the user
mid-session (the new HTTP request would be 404'd, but the existing
subscription persists). On client side, when the user gets a 404 on
the component (e.g., on a refresh), `socket.emit('unsubscribe:component', id)`
to clean up.

## Disabling

If the backend is deployed with `REALTIME_ENABLED=false`, the gateway
emits `error: { code: 'DISABLED' }` immediately on connect and
disconnects. The frontend should:

```ts
socket.on('error', ({ code }) => {
  if (code === 'DISABLED') {
    realtimeAvailable.value = false;
    socket.disconnect();
  }
});
```

…then fall back to polling for notifications (`GET /notifications`).
The rest of the UI works fine — realtime is purely additive.

## Hello-world (React + supabase-js)

```ts
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { supabase } from './supabase-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from './types/realtime';

export function useRealtime() {
  const ref = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || cancelled) return;

      const socket = io(`${import.meta.env.VITE_API_URL}/realtime`, {
        auth: { token },
        transports: ['websocket'],
      });

      socket.on('notification', (n) => {
        // toast or update notifications store
        console.log('notification', n);
      });

      socket.on('error', ({ code, message }) => {
        console.warn('realtime error', code, message);
      });

      ref.current = socket;
    })();

    return () => {
      cancelled = true;
      ref.current?.disconnect();
      ref.current = null;
    };
  }, []);

  return ref;
}
```
