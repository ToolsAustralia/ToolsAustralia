# Security & CSP — Rules

## R1. No `unsafe-inline` in CSP

Per-request nonce is the way. Don't add `unsafe-inline` to script-src "to make it work" — fix the inline script with a nonce.

## R2. New tracking provider = CSP update

Adding Facebook / Google / Klaviyo / TikTok / etc. requires their script + img + connect domains in CSP. Update [src/utils/security/csp.ts](../../src/utils/security/csp.ts).

## R3. Don't break the Stripe webhook

The webhook route has a different header set. Don't accidentally apply COEP to it — Stripe POSTs from a different origin and the response would fail.

## R4. Middleware doesn't gate /api

Auth gate every `/api/**` handler explicitly. Middleware excludes the API namespace.

## R5. Rate-limit public endpoints

Anything public (contact, signup, password-reset request) needs IP-based rate limiting to prevent abuse.

## R6. Mandatory QA review

`.cursor/rules/orchestrator.mdc` requires QA review for security/auth changes. Always.
