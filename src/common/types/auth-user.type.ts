export type UserRole = 'user' | 'moderator' | 'admin';

/**
 * Shape of the user attached to the request by SupabaseAuthGuard after
 * validating the JWT AND hydrating the local session row (role + suspension).
 *
 * `role` and `suspendedUntil` come from our `users` table, not the JWT —
 * JWT claims are immutable between refreshes (up to 1h), so we'd keep
 * serving a suspended user until their next login otherwise.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  githubUsername: string | null;
  /** OAuth provider that minted this token: "github", "google", "email", … */
  provider: string | null;
  /** Authorization role, refreshed from the DB on each request (cached 30s). */
  role: UserRole;
  /** Non-null + future means the user is banned; guard rejects the request. */
  suspendedUntil: Date | null;
  /** Latest privacy/terms version accepted — null if never accepted. ConsentGuard compares against the server-side current versions. */
  privacyAcceptedVersion: string | null;
  termsAcceptedVersion: string | null;
  claims: Record<string, unknown>;
}
