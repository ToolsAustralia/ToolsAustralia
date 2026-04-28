# Security & CSP — Gotchas

## Stripe webhook COEP

If you accidentally apply COEP to `/api/stripe/webhook`, server-to-server POSTs from Stripe break. CSP for that route is intentionally relaxed.

## Third-party SDK CSP failures

Adding a tracking provider but forgetting CSP → silent failure. Pixel doesn't load, no errors visible (browser blocks before fetch). Always verify in DevTools network tab.

## Inline script without nonce

Server component renders `<script>` inline → CSP blocks → broken UX. Use the nonce pattern.

## Middleware path-matching surprise

Middleware excludes `/api/**` via the matcher config. If you move a page to be served from `/api/some-public-page/`, it loses middleware-applied CSP. Don't.

## Rate limit bypass

Dev mode often bypasses rate limits for testing. Check the env-flag to ensure it's only off in dev. Production shipping a "dev rate limit bypass" = security incident.

## Migrated from `docs/security-regression-checklist.md`

> _TODO: read root file and merge._
