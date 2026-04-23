# Terms of Service

**Effective:** 2026-04-23
**Version:** `2026-04-23`

These terms are a contract between you and **Componi** ("we"). By registering, you agree to them. If you don't agree, don't use the service.

## 1. The service

Componi is a platform to publish, browse, fork, and discuss reusable UI components. It's free for individual use. Features, limits, and availability may change.

## 2. Your account

- You must be **16 or older** (LGPD Art. 14) to register.
- Register with a GitHub or Google account you own. We will not provision access through impersonated third-party identities.
- You are responsible for everything that happens under your account. If you lose control of your OAuth identity, lock the upstream account and email privacy@componi.dev.
- One person, one account, unless we explicitly authorize otherwise.

## 3. Your content

- **You keep all rights** to the code, text, and media you publish. Componi claims no ownership.
- By publishing, you grant us a **non-exclusive, worldwide, royalty-free license** to host, cache, transcode, display, and transmit your content **solely to operate the service** (e.g., render thumbnails, serve the feed, enable forks and previews). This license ends when you delete the content, except for copies other users already have (forks, downloads) — you can't un-grant a fork any more than you can un-grant a pull request.
- You grant other users the right to view your public content and, where explicitly enabled, to fork and remix it. You may make components private to restrict this.
- You promise that what you publish is yours to publish (you own it or have the right to redistribute it under a compatible license).
- If you include a license file or SPDX header, we honor it. If you don't, the default understanding is "all rights reserved" — viewers may read but not reuse.

## 4. Acceptable use

You will **not**:

- Publish malware, phishing kits, crypto-miners, or code that deliberately exfiltrates user data.
- Harass, threaten, dox, or incite violence against anyone.
- Upload content that infringes others' copyright, trademark, or privacy.
- Publish sexual content involving minors, or any content illegal under Brazilian law.
- Scrape the service beyond the published rate limits or the `robots.txt`.
- Impersonate staff, other users, or third parties.
- Attempt to reverse the moderation system (evading a block with a sockpuppet account, creating accounts to mass-report others, etc.).
- Bypass rate limits, paywalls (if any), or abuse the throttler.

We decide what crosses the line, at our discretion, documented in our moderation log (`docs/MODERATION.md` forthcoming). Enforcement is tiered: warning → content takedown → temporary suspension → permanent ban. Moderator suspensions are capped at 30 days; only admins can permanently ban.

## 5. Content moderation

- We may review, hide, or remove content that violates these terms or applicable law, with or without notice.
- We do not pre-moderate. Reported content enters a queue and is reviewed by human moderators.
- Takedowns record a reason and an actor in the audit log (`audit_logs`, see `docs/SECURITY.md`). If you believe a takedown was wrong, reply to the notification or email privacy@componi.dev to appeal.

## 6. Fair use of shared infrastructure

Componi runs on shared infrastructure with posted rate limits (see `THROTTLE_*` in the server config). You may not:

- Run automated scrapers without a published user-agent that identifies them.
- Use the service as a CDN for non-component assets.
- Abuse the `/export` endpoint to back up other users' data via a compromised or borrowed account — export is rate-limited and audit-logged.

## 7. Termination

- You can delete your account at any time (`DELETE /users/me`). See `PRIVACY.md` §6 for what is erased and what is retained.
- We can terminate or suspend your account if you violate these terms, if required by law, or if the service is shutting down. We try to give notice and an export window when we can.

## 8. Disclaimers

The service is provided **"as is"**. We do not warrant that it is error-free, always available, or fit for a particular purpose. Published components are shared by users, not vetted by us — inspect code before running it.

## 9. Limitation of liability

To the maximum extent permitted by law, Componi is not liable for indirect, incidental, or consequential damages, or for lost profits, data, or goodwill. Our total liability in any 12-month period will not exceed **BRL 500 or the fees you paid us** (whichever is greater). This does not limit liability for willful misconduct, gross negligence, or anything that cannot be excluded under the Brazilian Consumer Protection Code or LGPD.

## 10. Governing law

These terms are governed by Brazilian law. Disputes are resolved in the courts of the domicile of the user (LGPD and CDC protection) or, for users outside Brazil, in São Paulo, SP.

## 11. Changes

We bump the version string at the top when we change these terms. Material changes trigger a re-consent prompt; the `termsAcceptedVersion` column records which version you accepted. Continued use after a material change without re-consent is not binding — you must affirmatively accept.
