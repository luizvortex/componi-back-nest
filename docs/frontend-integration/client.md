# Client recipe

Pick your stack:

- HTTP — **`openapi-fetch`** + **`openapi-typescript`** (recommended)
- Realtime — **`socket.io-client`** + the typed events from `types/realtime.ts`

You don't need anything else. Both libs are tiny and framework-agnostic.

## Why openapi-fetch (and not orval / openapi-generator)

| Tool | Pros | Cons |
|------|------|------|
| **openapi-fetch** ⭐ | ~5 KB runtime; **types only**, no generated classes; works with any data-fetching library (TanStack Query, SWR, plain `useEffect`) | Doesn't generate React hooks for you |
| `orval` | Generates React Query hooks, mutations, mocks | Heavy, opinionated about TanStack Query, lots of generated boilerplate |
| `openapi-typescript-codegen` | Generates classes per tag | Older, less actively maintained, generates more code than you need |
| `swagger-typescript-api` | Configurable | Generates a full client class — same boilerplate problem as above |

**openapi-fetch wins** on the simplicity-and-objectivity axis. The types
are pure types (zero runtime cost), the fetch wrapper is ~5 KB, and you
keep full control over how requests are dispatched.

If you later decide you want React Query hooks generated for you, swap
to orval — your endpoint-handler code barely changes because the
contract is the same.

## Install

```bash
npm install socket.io-client
npm install -D openapi-typescript openapi-fetch
```

## Generate types from the spec

After copying `docs/frontend-integration/openapi.json` into your repo:

```bash
npx openapi-typescript ./docs/api/openapi.json -o ./src/api/types.ts
```

Wire it into the frontend's npm scripts:

```json
{
  "scripts": {
    "api:types": "openapi-typescript ./docs/api/openapi.json -o ./src/api/types.ts"
  }
}
```

Run it whenever you pull a new `openapi.json`.

## Set up the HTTP client

```ts
// src/api/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './types';
import { supabase } from '../auth/supabase-client';

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export const api = createClient<paths>({ baseUrl });

// Inject the bearer token on every request:
api.use({
  async onRequest({ request }) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      request.headers.set('Authorization', `Bearer ${data.session.access_token}`);
    }
    return request;
  },
  async onResponse({ response }) {
    // Pass through. Do error mapping per call site or in a thin wrapper.
    return response;
  },
});
```

## Using it

```ts
// Read
const { data, error } = await api.GET('/components', {
  params: { query: { limit: 20, sort: 'trending' } },
});
if (error) {
  // error is fully typed — see http-conventions.md for the shape
  console.error(error.requestId, error.message);
} else {
  // data is fully typed too
  console.log(data.length, 'components');
}

// Write
const { data: created, error } = await api.POST('/components', {
  body: {
    name: 'Glass Button',
    description: 'Frosted button',
    framework: 'react',
    code: '<source code…>',
    isPublic: true,
  },
});

// 204 endpoints (like/unlike/follow)
const { error } = await api.POST('/components/{id}/like', {
  params: { path: { id: componentId } },
});
```

## Error-handling pattern

```ts
import type { paths } from './types';

type ApiError = {
  statusCode: number;
  message: string;
  code?: string;
  requestId?: string;
  errors?: string[];
};

export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error as ApiError;
  return data as T;
}

// Use:
try {
  const components = await unwrap(api.GET('/components', { params: { query: {} } }));
} catch (err) {
  const apiErr = err as ApiError;
  if (apiErr.code === 'CONSENT_REQUIRED') {
    showConsentModal();
  } else if (apiErr.statusCode === 401) {
    await supabase.auth.refreshSession();
  } else {
    showToast(apiErr.message, { meta: { requestId: apiErr.requestId } });
  }
}
```

## Realtime setup (typed events)

```ts
// src/api/realtime.ts
import { io, type Socket } from 'socket.io-client';
import { supabase } from '../auth/supabase-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from './realtime-events'; // from docs/frontend-integration/types/realtime.ts

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function connectRealtime(): Promise<
  Socket<ServerToClientEvents, ClientToServerEvents> | null
> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
    `${baseUrl}/realtime`,
    {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    },
  );

  socket.on('error', ({ code, message }) => {
    if (code === 'AUTH') {
      // refresh + reconnect
    }
  });

  return socket;
}
```

The `Socket<S, C>` generics make the rest of your code type-safe — `socket.on('notification', ...)` autocompletes the payload shape, and
`socket.emit('subscribe:component', id, ack)` enforces the ack signature.

## With React Query (optional)

`openapi-fetch` plays well with TanStack Query — wrap each call in a
custom hook:

```ts
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './client';

export function useComponents(query: { limit?: number; sort?: string } = {}) {
  return useQuery({
    queryKey: ['components', query],
    queryFn: () => unwrap(api.GET('/components', { params: { query } })),
  });
}
```

This is optional. Plenty of projects ship without React Query and use
the `openapi-fetch` client directly inside `useEffect` / Suspense. Pick
what fits your stack — the API contract doesn't care.

## Caching & revalidation

The backend already runs short-TTL Redis caches on `/feed/*`,
`/components/:id`, `/search/semantic`. Adding TanStack Query / SWR caches
on top is fine, just don't set absurd `staleTime` values — you'd see
your own writes lag.

After a write that affects a list (creating a component, liking, etc.),
invalidate the affected queries:

```ts
const { mutate } = useMutation({
  mutationFn: () => unwrap(api.POST('/components/{id}/like', { params: { path: { id } } })),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['components', id] });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  },
});
```

Or rely on the realtime `component:like` event to nudge the cache:

```ts
socket.on('component:like', ({ componentId, likesCount }) => {
  queryClient.setQueryData(['components', componentId], (old) =>
    old ? { ...old, likesCount } : old,
  );
});
```

## Smoke-testing the wiring

In dev, hit `/api/v1/health` first — it returns 200 if DB + Redis are up.
If that's green and your bearer token works on `GET /api/v1/users/me/consent`,
your client setup is correct.

```ts
const { data, error } = await api.GET('/health');
console.log('health', error ?? data);
```
