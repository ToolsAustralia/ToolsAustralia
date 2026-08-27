# Auth — Architecture

## Stack

- **NextAuth** for session management
- **Email + password** + **Google OAuth** providers
- Sessions stored in JWT (decoded server-side)
- Mongoose for `User` model (lives in [subscription](../subscription/) for ownership reasons; auth reads it)

## Files

| File | Role |
|---|---|
| [src/lib/auth.ts](../../src/lib/auth.ts) | NextAuth config, providers, session callbacks |
| [src/lib/api-auth.ts](../../src/lib/api-auth.ts) | Helpers for route handlers (get session, require admin) |
| [src/lib/jwt.ts](../../src/lib/jwt.ts) | JWT utilities for password-reset tokens / similar |
| [src/lib/debugAuth.ts](../../src/lib/debugAuth.ts) | Dev-only auth debugging helpers |
| [src/utils/auth/mobile-otp.ts](../../src/utils/auth/mobile-otp.ts) | SMS one-time-code **policy** — generation, keyed hash, expiry, send allowance (2026-08-25) |
| [src/utils/auth/has-ever-paid.ts](../../src/utils/auth/has-ever-paid.ts) | The one "is this a real customer?" predicate (2026-08-27). Reads `processedPayments`, **never** `subscription.isActive` (excludes 4,613 lapsed payers) and **never** `stripeCustomerId` (true for ~44k never-paid registrants). Test: `npm run test:has-ever-paid` |
| [src/lib/environment.ts](../../src/lib/environment.ts) | `environmentFlags.verifiedContactRequired()` — the "at least one verified contact channel" gate (2026-08-27). Replaced `emailVerificationMandatory`, which was hardcoded `false`. Lives in [infrastructure](../infrastructure/); listed here because auth owns the rule ([rules.md](./rules.md) R8) |
| [src/middleware.ts](../../src/middleware.ts) | Page gating — unauthenticated → `/login`, staff → `/admin`, and the `hasEverPaid` dashboard gate below. Lives in [security-csp](../security-csp/) |
| [src/contexts/UserContext.tsx](../../src/contexts/UserContext.tsx) | React context for user session in components |

## Pages

- `/login` — login + signup
- `/reset-password` — password reset
- `/oauth-redirect` — OAuth callback handling

## Two-layer gating

Per CLAUDE.md:
- **Pages** gated by [src/middleware.ts](../../src/middleware.ts) (matcher excludes `/api`)
- **API routes** must do their OWN auth via `api-auth.ts` helpers — middleware doesn't gate them

This matters for admin: `/admin/**` pages are gated by middleware, but `/api/admin/**` handlers must check `session.user.role === "admin"` themselves.

## Dashboard access gate — `hasEverPaid` on the JWT (2026-08-27)

A third page redirect sits alongside the existing staff→`/admin` and unauthenticated→`/login`
ones, in the same [src/middleware.ts](../../src/middleware.ts) block: signed in **and** `token.hasEverPaid === false`
**and** not an internal user ⇒ `/my-account` and `/rewards` redirect to `/membership`. An account
that never bought anything has an empty dashboard; the join page is at least a conversion surface.

Three things about the shape are deliberate:

- **`hasEverPaid`, never `subscription.isActive`.** Cancelled, paused and past-due members have
  paid and must keep access — past-due members still hold live draw entries. The predicate is
  [`src/utils/auth/has-ever-paid.ts`](../../src/utils/auth/has-ever-paid.ts).
- **`undefined` is allowed through.** A token minted before this shipped carries no stamp. Bouncing
  an existing signed-in member mid-session is worse than letting one request past, and the next
  request carries the stamp (the jwt callback re-runs per request).
- **Staff are already diverted** to `/admin` by the `isStaffBlockedPath` rule; `isInternalUser` is a
  second belt.

The claim is stamped by the jwt callback in [src/lib/auth.ts](../../src/lib/auth.ts) on **both**
branches — first token and per-request refresh — so a first purchase unlocks the dashboard on the
next navigation with no re-login. It is free: the user document is already loaded there. Declared
on `next-auth/jwt`'s `JWT` in [src/types/global.d.ts](../../src/types/global.d.ts).

## Session shape

> _TODO: pull session callback from `lib/auth.ts` and document the exact session object shape (user fields exposed)._
