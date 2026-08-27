# Dashboard-Account — Rules

## R1. Auth-gated

`/my-account/**` requires session. Middleware redirects unauthenticated users to `/login`.

Since 2026-08-27 the same middleware applies a **second** gate: a signed-in user whose token
carries `hasEverPaid === false` is redirected off `/my-account/**` (and `/rewards`) to
`/membership` — an account that never bought anything has nothing to show, and the join page is
a conversion surface where an empty dashboard is only confusing. Cancelled, paused and past-due
members **have** paid and keep access; staff are diverted to `/admin` by an earlier rule. The
predicate is [has-ever-paid.ts](../../src/utils/auth/has-ever-paid.ts), stamped onto the JWT in
[src/lib/auth.ts](../../src/lib/auth.ts); the redirect itself lives in
[src/middleware.ts](../../src/middleware.ts) — see
[security-csp/middleware.md](../security-csp/middleware.md). Design:
[2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).

## R2. Read-only by default

The dashboard surfaces feature-domain data; mutations (cancel sub, change PM, etc.) go through the feature-domain APIs, not local logic.

## R3. Defer landing experiences

`useDashboardLandingOrchestration` decides whether to show landing-page experiences (e.g. first-visit-after-signup). Don't trigger landing logic from random components.

## R4. No business logic in dashboard pages

If you find yourself computing eligibility / entries / status here, it belongs in the source domain.
