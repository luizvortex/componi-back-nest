import { SetMetadata } from '@nestjs/common';

export const SKIP_CONSENT_CHECK_KEY = 'skipConsentCheck';

/**
 * Opts a handler out of ConsentGuard. Reserved for the endpoints users
 * need to hit BEFORE they've accepted (the consent endpoints themselves)
 * and for paths that must stay reachable regardless of consent state
 * (data export + self-erasure — LGPD rights you can't block on acceptance
 * of the very policy the user is trying to exit).
 */
export const SkipConsentCheck = () => SetMetadata(SKIP_CONSENT_CHECK_KEY, true);
