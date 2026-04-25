import { registerAs } from '@nestjs/config';

/**
 * Version strings identify which revision of docs/PRIVACY.md and
 * docs/TERMS.md a user accepted. Bumping either one here makes the
 * consent middleware treat existing acceptances as stale, so the
 * frontend should re-prompt on next login.
 *
 * Use ISO-date strings matching the "Version:" header in the docs so
 * the trail back to the source-controlled file is obvious.
 */
export default registerAs('compliance', () => ({
  privacyVersion: process.env.PRIVACY_VERSION ?? '2026-04-23',
  termsVersion: process.env.TERMS_VERSION ?? '2026-04-23',
}));
