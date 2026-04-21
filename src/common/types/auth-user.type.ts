/**
 * Shape of the user attached to the request by SupabaseAuthGuard after
 * validating the JWT. Extra claims (role, etc.) live in `claims`.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  githubUsername: string | null;
  /** OAuth provider that minted this token: "github", "google", "email", … */
  provider: string | null;
  claims: Record<string, unknown>;
}
