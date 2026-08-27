# Auth — Backend

> **`GET /api/users/[id]/my-account` reconciles the partner-discount queue (2026-07-06):** this account-data
> route (`.lean()` read, consumed by `useMyAccountData` → `useDashboardState`) now sweeps an in-memory CLONE of
> `partnerDiscountQueue` via `processPartnerDiscountQueue` before returning `user`, so the client receives the
> member's REAL current entitlement rather than a stale stored `status`. Without it, a past-due member's eligible
> one-time pack (still `queued` behind the defunct membership row) read as 0% partner access. Sanctioned read
> side of the reconcile-then-read rule (mirrors `getReconciledPartnerDiscountSummary`); **side-effect-free** — the
> canonical persisted sweep stays with the cron + `GET /api/partner-discount/queue`. See
> [dashboard-account/frontend.md](../dashboard-account/frontend.md) and [partner/](../partner/).

## Lib

| File | Role |
|---|---|
| `lib/auth.ts` | NextAuth handler config + providers |
| `lib/api-auth.ts` | `getServerSession`, `requireAdmin`, etc. |
| `lib/jwt.ts` | JWT utilities (password-reset tokens) |
| `lib/debugAuth.ts` | Dev-only debugging |

## Route protection

API handlers should:
1. Call `getServerSession()` (or domain-specific helper from `api-auth.ts`)
2. Check user / admin role
3. Return 401 / 403 if unauthorized

For admin routes (`/api/admin/**`), the helper `requireAdmin(session)` is the canonical pattern.

## Affiliate auth — separate

Affiliate portal uses [src/lib/affiliate-auth.ts](../../src/lib/affiliate-auth.ts) — distinct from NextAuth. See [affiliate](../affiliate/).

## Norm internal API auth (`src/lib/internal-norm/`)

The `/api/internal/norm/**` surface is consumed by Norm (the in-house agent), not by browser users. It has its own auth/permission stack independent of NextAuth.

| File | Role |
|---|---|
| `internal-norm/auth.ts` | Bearer + HMAC signature + replay-nonce verification (`verifyNormRequest`) |
| `internal-norm/permissions.ts` | Resolves Norm's Mongo `User` → `Role.permissions`; cached 30 s (`hasNormPermission`) |
| `internal-norm/killSwitch.ts` | Per-endpoint disable flag (env + Mongo) — short-circuits before rate-limit consumption |
| `internal-norm/rateLimits.ts` | Per-tier + per-endpoint sliding-window limiter |
| `internal-norm/classification.ts` | Registry of endpoint specs (tier, required permission, schemas) |
| `internal-norm/audit.ts` | `beginAudit` / `endAudit` write `NormCallLog` rows (TTL 90 d) |
| `internal-norm/withNorm.ts` | Higher-order route wrapper — orchestrates all of the above |
| `internal-norm/schemas/manifest.ts` | Zod schema for the published tools manifest (`NormManifestSchema`) |
| `scripts/build-norm-manifest.ts` | Build-time generator → `src/generated/normToolsManifest.json` |

### `withNorm(options, handler)` ordering

Every Norm route handler is wrapped with `withNorm`. The wrapper runs gates in this exact order, by design:

1. **Auth** — bearer + HMAC signature + timestamp/nonce. Bad auth never touches the DB.
2. **Permission** — `hasNormPermission(options.requiredPermission)` against Norm's Role. Audited even on rejection so 403s are debuggable.
3. **Kill switch** — `isEndpointDisabled(registryKey)` allows ops to shut down a single endpoint without redeploy. Runs *after* permission so a forbidden endpoint still 403s rather than masking with 503.
4. **Rate limit** — `checkNormRateLimit` enforces per-tier and per-endpoint quotas. Last gate before real work, so forbidden requests don't burn quota.
5. **Audit begin** — `NormCallLog` row is written *before* the handler runs, so a hung/crashed handler still leaves a record.
6. **Handler** — runs inside try/catch. `ctx.ok(data)` validates against `options.responseSchema` and returns 500 on schema drift rather than serving a malformed payload.
7. **Audit end** — single `updateOne` by `requestId` patches `responseStatus`, `durationMs`, `responseHash`, `errorCode`. `durationMs` covers auth + permission + handler.

`requestId` is a 32-char hex (UUID without dashes). It appears in every response body (`{ requestId }`) and matches the `NormCallLog.requestId` field, so operators can grep logs end-to-end.

### Tools manifest generator

`scripts/build-norm-manifest.ts` walks `NORM_ENDPOINTS` and emits `src/generated/normToolsManifest.json`, the static payload served from `/api/internal/norm/v1/manifest`. Norm fetches it on startup to discover capabilities. Only entries with a `responseSchema` declared in the registry are published — unwired/roadmap entries (and the framework `health` / `manifest` endpoints, which Norm knows by convention) are filtered out. The generator runs via `npm run build:norm-manifest` and is chained into `prebuild` / `predev` so dev and prod builds always start with a fresh manifest. The JSON file is committed so contributors can see the current shape without running the build.

## Signup click-platform capture (2026-07-24)

`POST /api/auth/register` now records **which paid platform a signup came from**, into `User.signupAttribution.clickPlatform`.

`resolveSignupClickPlatform(request)` reads the request's click-id cookies via `extractClickIdsFromRequest` — the **same** extractor the payment-attribution path uses, so a signup and the purchase that follows it agree on the platform. When more than one click id is present (a visitor clicked ads on two platforms), the most recently captured wins, matching the recency rule in [`platformPriority.ts`](../../src/services/attribution/platformPriority.ts); an undated signal loses to any dated one. Organic traffic ⇒ `undefined`. The whole resolution is wrapped in `try/catch` — **attribution must never break registration**.

**Only the resolved platform name is persisted, never the raw click id** — signup analytics get click-verified confidence without adding a new identifier to the customer record (see [CUSTOMER.md §2h/§8e](../../CUSTOMER.md)).

**All four registration branches stamp it.** The value is resolved once in the handler and threaded into every `buildSignupAttribution(...)` call: existing-plain-account, existing-by-email, existing-by-mobile, and brand-new. Missing any one would silently under-count paid signups for returning users — the exact class of bug CLAUDE.md rule 6 exists to prevent. `buildSignupAttribution` also now persists when a click platform is present even with **no** promo slug and **no** UTMs (a paid click with an untagged landing URL is still real attribution, and previously produced no record at all).

Consumed by `getSignupsByPlatform` for the admin Advertising card's per-platform signup counts — see [admin/backend.md](../admin/backend.md#signups-per-acquisition-platform-2026-07-24).

## Mobile OTP policy (2026-08-25)

[`src/utils/auth/mobile-otp.ts`](../../src/utils/auth/mobile-otp.ts) owns the **policy** for SMS
one-time codes — generation, hashing, expiry, attempt cap, send rate limiting. It is deliberately
split from the **gateway**, [`src/lib/sms.ts`](../../src/lib/sms.ts) (owned by
[email](../email/)), which is the only file that names the SMS provider. Policy knows nothing
about who delivers the message; the gateway knows nothing about auth. Four routes consume it —
`send-mobile-login-code` / `verify-mobile-login` (logged-out sign-in) and
`send-mobile-verification` / `verify-mobile` (session-authed verification, 2026-08-27); see
[api.md](./api.md) and the design at
[2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).

It mirrors the already-hardened email-code path (`/api/auth/verify-login-code`) rather than
inventing a second scheme: crypto-random code, never stored in plaintext, short expiry, attempt
cap, constant-time compare, distributed limiter.

| Constant | Value | Meaning |
|---|---|---|
| `OTP_EXPIRY_MINUTES` | `10` | Code validity from issue (`getOtpExpiry` / `isOtpExpired`) |
| `OTP_MAX_SENDS_PER_DAY` | `3` | Sends per identifier per rolling 24 h |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Minimum gap between two sends to one identifier |
| `OTP_MAX_VERIFY_ATTEMPTS` | `5` | Wrong-code submissions against a single issued code |

**`generateOtpCode()` uses the full keyspace.** `randomInt(0, 1_000_000)` padded to six digits —
**not** the common `randomInt(100000, 999999)`, which silently excludes every code beginning with
`0`, discarding ~10% of the keyspace and biasing the first digit.

**`hashOtpCode()` is HMAC-SHA256 keyed with `NEXTAUTH_SECRET`, not a bare digest.** There are only
10^6 possible codes, so an unkeyed SHA-256 is rainbow-tableable in milliseconds — a database read
would expose every live code. Keying with a secret that lives only in the environment means a DB
leak alone does not. It **throws** when `NEXTAUTH_SECRET` is absent rather than degrading to an
unkeyed digest. `verifyOtpCode()` compares with `timingSafeEqual` (length-guarded, since
`timingSafeEqual` throws on mismatched lengths).

### `claimOtpSendAllowance(identifier)` — two limiters, ordered, with refund

`identifier` is a user id, or a normalised mobile when there is no session yet. Two
`createDistributedRateLimiter` instances back it (`sms-otp-send-daily`, `sms-otp-send-cooldown`),
so the caps hold across Vercel instances.

1. **Daily cap first.** A daily-blocked caller must not also burn a cooldown token.
2. **Cooldown second.** If it rejects, the daily token is **refunded** — no message was sent, so
   the allowance must go back. Without that, three rapid taps would eat a whole day's allowance
   while delivering nothing.
3. On success the caller gets `release()` — invoke it when the **gateway** fails (error, no
   credit, blocked number) so a downstream failure never costs the member one of their three
   daily sends. Idempotent (guarded by a `released` flag) and a no-op under the dev bypass.

`refund()` itself is new on the limiter — see
[`src/utils/security/rateLimiter.ts`](../../src/utils/security/rateLimiter.ts) and
[security-csp/](../security-csp/). `check()` consumes a token on call (there is no peek), so
refund is the only way to give one back. It decrements a **live** window only and never below
zero, so a stray refund cannot mint allowance.

**Deliberate caveat:** `createDistributedRateLimiter` **fails open** when Mongo is unreachable, so
a store outage lets sends through. That is the right trade for auth (never lock everyone out), and
the spend exposure is bounded by the prepaid credit balance plus the caller-side eligibility gate.

### Dev bypass — and the override that makes it testable

`isOtpRateLimitBypassed()` turns rate limiting **off in development** so the flow can be exercised
repeatedly. Setting `SMS_OTP_RATE_LIMIT_IN_DEV=true` forces it back **on** locally — without that
escape hatch the limiter could only ever run in production, which is the same as not knowing
whether it works. **Production always enforces; no env var can disable it there** (the bypass
short-circuits on `isDevelopment()` first).

`describeOtpRefusal(refusal)` returns the customer-facing sentence for a refused send, kept here so
every OTP route words it identically. Rule-11 safe, and the daily-cap message offers the **email**
fallback rather than dead-ending the member.

## The "at least one verified channel" requirement — the gate is now ON (2026-08-27)

`environmentFlags.emailVerificationMandatory()` in
[`src/lib/environment.ts`](../../src/lib/environment.ts) was hardcoded `false` — the gate was built
and left off, so members finished profile setup with **nothing** verified. It is replaced by
`environmentFlags.verifiedContactRequired()`, which returns `true`, and renamed at all five call
sites: [`UserSetupModal/index.tsx`](../../src/components/modals/UserSetupModal/index.tsx) ×4,
[`Header.tsx`](../../src/components/layout/Header.tsx), and `logEnvironmentInfo`.

**Why it matters.** Registration is passwordless, and step 1 of setup is where the member sets
their password — so the verified channel *is* the recovery credential for that password. With
neither verified, a mistyped email leaves them with zero self-service routes back in: password
reset, the emailed sign-in code and the verify-email bridge all mail an inbox they cannot read.

**Either channel satisfies it**, and both server paths that can set one are session-authed:
`POST /api/auth/verify-email` and `POST /api/auth/verify-mobile` ([api.md](./api.md)). Email is
free to send, so the UI defaults to it; SMS costs a credit and is the alternative for someone who
cannot reach their inbox. The client-side derivation lives in `computeStepsNeeded` — see
[shared-ui/](../shared-ui/) for the modal and [frontend.md](./frontend.md) for the surfaces.

Note the rename is **not** a behaviour-preserving refactor: the flag flipped `false` → `true` in
the same change. A reader who greps only for the old name will conclude the gate is still off.

## `hasEverPaid` is stamped onto the JWT (2026-08-27)

The jwt callback in [`src/lib/auth.ts`](../../src/lib/auth.ts) sets
`token.hasEverPaid = hasEverPaid(dbUser)` on **both** branches — the first-token branch and the
per-request refresh branch. It is free there: `dbUser` is already loaded for the role/name claims.
Stamping both is what makes a first purchase unlock the dashboard on the next navigation instead of
at the next sign-in.

The claim is declared on `next-auth/jwt`'s `JWT` in
[`src/types/global.d.ts`](../../src/types/global.d.ts) and consumed only by
[`src/middleware.ts`](../../src/middleware.ts). Gate semantics — including why `undefined` is let
through — are in [architecture.md](./architecture.md#dashboard-access-gate--haseverpaid-on-the-jwt-2026-08-27).

**Adding a claim is not free at every call site, only at these two.** A new claim computed from
something *not* already loaded would add a query to every request the refresh branch handles.
Check what `dbUser` already carries before reaching for another read.
