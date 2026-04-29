# Security & CSP — Backend

## Middleware

[src/middleware.ts](../../src/middleware.ts) — NextAuth gating + CSP nonce. Matcher excludes `/api/**`.

## CSP construction

[src/utils/security/csp.ts](../../src/utils/security/csp.ts) — produces the CSP header string. Reads from a directive config (likely env-aware for dev vs prod).

## Rate limiting

[src/lib/rate-limiting/](../../src/lib/rate-limiting/):
- Per-IP throttle for public endpoints
- Per-user throttle for admin bulk tools
- Global rate limit for radar-sensitive operations (charge-past-due)

## next.config.ts headers

Static fallback security headers (X-Frame-Options, X-Content-Type-Options, etc.) for routes middleware doesn't cover.

## Webhook exception

`/api/stripe/webhook` gets a different header set (no COEP). Configured in middleware path-handling.
