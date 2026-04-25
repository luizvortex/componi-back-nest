/**
 * Standalone copy of the backend's `src/common/realtime/realtime.types.ts`,
 * re-emitted without `import` statements that would resolve only inside
 * the backend tree. The frontend imports this file as-is.
 *
 * Keep in sync — the backend's CI should diff this file against the
 * canonical one and fail if they drift. (Not yet automated — for now,
 * regenerate manually after any change to the gateway events.)
 */

/**
 * Notification kinds. Mirrors the backend enum on
 * `Notification.type` — kept inline to avoid a cross-repo import.
 */
export type NotificationType =
  | 'like'
  | 'favorite'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'mention'
  | 'version';

/**
 * Server-to-client event catalogue. Use as the first generic of
 * `Socket<S, C>` from socket.io-client to get fully-typed `socket.on`.
 */
export interface ServerToClientEvents {
  /** Pushed to `user:${userId}` room when a notification row is written. */
  notification: (payload: {
    type: NotificationType;
    actorId: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
  }) => void;

  /** Like / unlike on a component the socket is subscribed to. */
  'component:like': (payload: {
    componentId: string;
    actorId: string;
    likesCount: number;
  }) => void;
  'component:unlike': (payload: {
    componentId: string;
    actorId: string;
    likesCount: number;
  }) => void;

  /** New comment landed on a subscribed component. */
  'component:comment': (payload: {
    componentId: string;
    commentId: string;
    actorId: string;
    commentsCount: number;
  }) => void;

  /** Someone followed the recipient of `user:${userId}`. */
  'user:follow': (payload: { followerId: string; followersCount: number }) => void;

  /**
   * Acknowledgements / errors back to the caller. Gateway emits
   * `error` with a `{ code, message }` shape; clients should hide
   * the connection on `code === 'AUTH'` and prompt re-login.
   */
  error: (payload: { code: string; message: string }) => void;
}

/**
 * Client-to-server event catalogue. Use as the second generic of
 * `Socket<S, C>`.
 */
export interface ClientToServerEvents {
  /** Subscribe the socket to a component's room. Acks success/failure. */
  'subscribe:component': (
    componentId: string,
    ack: (result: { ok: boolean; error?: string }) => void,
  ) => void;
  'unsubscribe:component': (componentId: string) => void;
}
