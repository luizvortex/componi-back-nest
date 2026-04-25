import { registerAs } from '@nestjs/config';

/**
 * Configuration for the WebSocket realtime layer (Socket.IO).
 *
 * Adapter strategies:
 *   - 'memory' (default): in-process room state. Only safe with a single
 *     Node instance — multi-instance deploys would only emit events to
 *     clients connected to the *same* node.
 *   - 'redis': Socket.IO Redis adapter, using the existing Redis pool.
 *     Required for any horizontal scaling. Adds ~1 PUBLISH per emit.
 */
export default registerAs('realtime', () => ({
  enabled: process.env.REALTIME_ENABLED !== 'false',
  /** 'memory' | 'redis' — see header note. */
  adapter: (process.env.REALTIME_ADAPTER ?? 'memory') as 'memory' | 'redis',
  /** Socket.IO namespace; mounted on the same HTTP server as the API. */
  namespace: process.env.REALTIME_NAMESPACE ?? '/realtime',
  /**
   * Hard cap on `component:` rooms a single socket can subscribe to at
   * once. Prevents one client from joining tens of thousands of rooms
   * to fan out a broadcast amplification.
   */
  maxComponentSubscriptions: parseInt(
    process.env.REALTIME_MAX_COMPONENT_SUBSCRIPTIONS ?? '20',
    10,
  ),
}));
