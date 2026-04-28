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
