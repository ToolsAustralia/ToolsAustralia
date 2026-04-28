# Security & CSP — Architecture

## Files

| File | Role |
|---|---|
| [src/middleware.ts](../../src/middleware.ts) | NextAuth gating + CSP nonce injection |
| [src/utils/security/](../../src/utils/security/) | CSP construction (csp.ts) |
| [src/lib/rate-limiting/](../../src/lib/rate-limiting/) | Rate limit primitives |
| [next.config.ts](../../next.config.ts) | Static fallback security headers |

## CSP construction

Per CLAUDE.md:
> `next.config.ts` and `src/middleware.ts` together build CSP via `src/utils/security/csp.ts`. In production a per-request nonce is generated in middleware and attached as `x-nonce`; static fallback headers exist in `next.config.ts` for routes middleware doesn't run for.

## Stripe webhook exception

The Stripe webhook route (`/api/stripe/webhook`) gets a special header set (no COEP) so server-to-server POSTs work. If you change CSP or add inline scripts, update both `csp.ts` and verify the nonce is being read in the relevant server component.

## Middleware matcher

Middleware runs on most routes BUT excludes `/api/**`. So:
- Pages (`/admin/`, `/login/`, `/my-account/`, etc.) → middleware gates auth
- API routes (`/api/auth/`, `/api/admin/`, etc.) → handler-level auth checks required

## Rate limiting

[src/lib/rate-limiting/](../../src/lib/rate-limiting/) — primitives for per-IP / per-user / global rate limits. Used by:
- Public endpoints (contact, public APIs)
- Admin bulk tools (charge-past-due — 1/admin/5min, 1/global/24h)
