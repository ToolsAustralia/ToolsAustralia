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

## R7. One-time codes: keyed hash, full keyspace, and resolve BY the channel you deliver to

Applies to every OTP path — the emailed sign-in code and the SMS codes built on
[`src/utils/auth/mobile-otp.ts`](../../src/utils/auth/mobile-otp.ts):

- **Never store a code in plaintext, and never hash it unkeyed.** A 6-digit code has only 10^6
  values; a bare SHA-256 column is rainbow-tableable. Use `hashOtpCode()` (HMAC keyed with
  `NEXTAUTH_SECRET`) and compare with `verifyOtpCode()` (constant time).
- **Generate over the full range.** `randomInt(0, 1_000_000)` padded — `randomInt(100000, 999999)`
  drops every code starting with `0`.
- **Resolve the account by the same identifier the code is delivered to.** Never look an account
  up by one field and send the secret to another supplied in the request body — that is the F-001
  takeover shape (see [gotchas.md](./gotchas.md)).
- **Refund the send allowance when nothing was sent.** A gateway failure must not consume one of
  the member's `OTP_MAX_SENDS_PER_DAY` — call the `release()` returned by
  `claimOtpSendAllowance()`.
- **Rate limiting is never disabled in production.** `SMS_OTP_RATE_LIMIT_IN_DEV` only re-enables
  it locally; don't add an inverse switch.

## R8. Every member must end setup with at least ONE verified contact channel

`environmentFlags.verifiedContactRequired()` returns `true` and step 3 of profile setup is
satisfied by **email or mobile** — see [backend.md](./backend.md). Two rules follow:

- **Don't add a third way to complete setup that skips it.** Registration is passwordless and the
  password is set in that same flow, so the verified channel is the **recovery credential** for it.
  A path that finishes setup with neither verified re-creates the locked-out cohort.
- **Derive "has a verified channel" from one function, never inline.** `computeStepsNeeded` in
  [`UserSetupModal/index.tsx`](../../src/components/modals/UserSetupModal/index.tsx) is exported for
  exactly this reason: the derivation used to be written twice (render `useMemo` + the open/restore
  effect) and the two desynced. New consumers call it.

## R9. A session is minted from a SECRET, never from a client-supplied identity

`POST /api/auth/session-from-payment` takes only the Stripe `client_secret` and derives the user
from the PaymentIntent's customer; the caller names no account. Apply the same shape to any future
"sign them in after X" route:

- **The credential must be unguessable and issued to that person only** — a client secret, an OTP,
  a signed token. An id (`userId`, `paymentIntentId`, an email) is a name, not a credential.
- **Assert the underlying event actually completed.** `auto-login` never checked
  `paymentIntent.status`; a session could be minted before the money landed. See
  [gotchas.md](./gotchas.md).
- **Never mix the two.** A route that accepts an identity *and* a secret has to keep them agreeing
  forever — the same failure mode as R7's "resolve by A, deliver to B".
