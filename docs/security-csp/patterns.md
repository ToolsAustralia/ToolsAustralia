# Security & CSP — Patterns

## P1. Per-request nonce injection

Middleware generates a nonce, attaches as `x-nonce` response header. Server components read `headers().get("x-nonce")` and pass to inline scripts via `nonce={...}`.

## P2. Layered headers

Middleware adds dynamic headers (CSP with nonce). next.config.ts adds static fallback headers (X-Frame-Options, etc.). Both layers cooperate.

## P3. Per-route header overrides

Special routes (Stripe webhook) need different headers. Handled via path-specific logic in middleware.

## P4. Centralized CSP construction

All CSP directives live in `csp.ts` — single source of truth. Don't sprinkle `Content-Security-Policy` headers across handlers.

## P5. Rate limit at the boundary

Rate limiting applies at the API handler boundary, not deeper. The handler does an early return with 429 if limit exceeded.

## P6. Claim-and-refund across two distributed limiters

For a long cap plus a short cooldown, where a token must not be burned unless the guarded action
really happened. Reference: `claimOtpSendAllowance` in
[src/utils/auth/mobile-otp.ts](../../src/utils/auth/mobile-otp.ts) (buckets
`sms-otp-send-daily` and `sms-otp-send-cooldown`).

1. `check()` the **long window first** — a caller already blocked for the day must not also
   consume a cooldown token.
2. `check()` the short window.
3. Cooldown rejected → `refund()` the long window. Nothing was sent, so nothing should be spent;
   without this, three rapid taps exhaust a whole day's allowance while delivering nothing.
4. Allowed → return a `release()` closure that refunds **both** buckets, for the caller to invoke
   when the downstream action fails.

`release()` is idempotent (a `released` flag) and a no-op when rate limiting is bypassed, so an
error path can call it unconditionally. Only `createDistributedRateLimiter` has `refund` — the
in-memory limiter does not, and shouldn't be used for this (its counters aren't shared).
