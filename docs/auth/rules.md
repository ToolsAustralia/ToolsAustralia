# Auth — Rules

## R1. API auth is per-handler

Middleware excludes `/api` (per CLAUDE.md). Every protected `/api/**` handler MUST call `getServerSession()` and verify role/identity. Don't assume middleware gating applies.

## R2. Admin gate is double-layered

Admin pages (`/admin/**`) are gated by middleware AND by handler-level checks. Don't rely on either alone — middleware is for UX (redirect), handler is for security.

## R3. Don't bypass with `debugAuth`

[src/lib/debugAuth.ts](../../src/lib/debugAuth.ts) is dev-only. Don't import from production-path code. The bundler / lint should catch leakage.

## R4. Affiliate session is separate

Don't conflate affiliate auth with member auth. They're different user systems.

## R5. Password reset tokens have TTL

JWT-based reset tokens via `lib/jwt.ts` carry an expiry. Don't extend without security review.

## R6. PII redaction in logs

When logging auth events to `ErrorReport` ([error-reporting](../error-reporting/)), redact:
- Passwords (always)
- Reset tokens
- OAuth secrets

Email is acceptable for support; password / token / secret is not.
