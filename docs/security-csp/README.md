# Security & CSP domain

Content Security Policy, security headers, rate limiting, CSP nonce injection, middleware.

## Index

- [architecture.md](./architecture.md) — middleware, CSP construction, nonce injection
- [frontend.md](./frontend.md) — _Mostly N/A — CSP affects all frontend but no UI here_
- [backend.md](./backend.md) — middleware, csp.ts, rate-limiting
- [api.md](./api.md) — _N/A — middleware operates on all routes_
- [rules.md](./rules.md) — Stripe webhook exception, no inline scripts without nonce
- [patterns.md](./patterns.md) — nonce injection, header layering
- [gotchas.md](./gotchas.md) — webhook COEP, third-party SDKs, debug
- [models.md](./models.md) — _N/A_
- [testing.md](./testing.md) — security-regression-checklist

## Migrated from `docs/security-regression-checklist.md`

> _TODO: read root file and merge._
