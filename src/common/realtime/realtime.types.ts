import type { NotificationType } from '../../database/entities/notification.entity';

/**
 * Server-to-client event catalogue. Keeping this exhaustive helps the
 * frontend type the listener side (it can import this same file) and
 * lets us spot dead emit paths during code review.
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

export interface ClientToServerEvents {
  /** Subscribe the socket to a component's room. Acks success/failure. */
  'subscribe:component': (
    componentId: string,
    ack: (result: { ok: boolean; error?: string }) => void,
  ) => void;
  'unsubscribe:component': (componentId: string) => void;
}

export interface SocketUserData {
  userId: string;
  /** Component room IDs the socket is currently joined to (cap-enforced). */
  componentSubscriptions: Set<string>;
}
