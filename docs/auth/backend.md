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
