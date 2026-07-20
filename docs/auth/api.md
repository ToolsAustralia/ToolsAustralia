# Auth — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| _NextAuth_ | `/api/auth/[...nextauth]/` | NextAuth handler (signin, callback, signout, session) |
| _TODO_ | `/api/auth/**` | Domain-specific auth helpers (signup, password reset, etc.) |
| `POST` | `/api/user/change-password` | Change **or** first-time set the session user's password |
| _TODO_ | `/api/user/**` | Other current-user reads/writes |
| `GET` | `/api/users/[id]` | Session user (or staff w/ `users.view`) — enriched user record, **include-list projected** |
| `GET` | `/api/users/[id]/my-account` | Session user (or staff w/ `users.view`) — my-account payload (user + activeMiniDraws + recentOrders + insights), **include-list projected** |
| _TODO_ | `/api/users/**` | Multi-user reads (admin-only typically) |

> _TODO: read each handler under [src/app/api/auth/](../../src/app/api/auth/), [src/app/api/user/](../../src/app/api/user/), [src/app/api/users/](../../src/app/api/users/) and document._

### `GET /api/users/[id]` + `GET /api/users/[id]/my-account` — explicit wire projections (2026-07-19)

Both routes select the User document with the **additive include-list** `MY_ACCOUNT_USER_FIELDS` from
[src/utils/dashboard/my-account-projection.ts](../../src/utils/dashboard/my-account-projection.ts) — on **both** the
`findById` branch and the `findOne`-by-email (Google OAuth id) branch. This replaced the old 3-field exclude-list
(`-password -emailVerificationToken -passwordResetToken`), which still shipped every other auth secret
(`smsOtpCode`, `loginCode`, `emailVerificationCode`, `inviteToken`, reset expiries…) plus wire bloat
(`processedPayments`, `upsellHistory`, `upsellPurchases`, `redemptionHistory`, `cart`) to the client.

The my-account route additionally projects its sibling queries: `MiniDraw.find().select(MY_ACCOUNT_MINI_DRAW_FIELDS)`
(kills the MB-scale per-user `entries[]` arrays that used to ship with every poll) and
`Order.find().select(MY_ACCOUNT_ORDER_FIELDS)`.

`hasPassword` on `/api/users/[id]` is unaffected — it comes from a separate password-only query.
`subscription` is projected as the whole subdocument, so the streak fields (`streakMonths`, `streakGeneration`),
`lastMonthAccumulatedEntries`, and `previousSubscription` all still ship. **Footgun:** a new client-consumed User
field must be added to `MY_ACCOUNT_USER_FIELDS` or it silently vanishes — see [gotchas.md](./gotchas.md).
Guarded by `npm run test:my-account-projection`.

### `POST /api/user/change-password` (set-password support — 2026-05-19)

Body: `{ currentPassword?: string; newPassword: string }` (`newPassword` ≥ 6 chars). `currentPassword` is **optional** in the Zod schema.

The `password` field on `User` is **not** `select:false`, so `User.findOne` loads it directly. Behaviour branches on `isFirstTimeSet = !user.password`:

- **Account has a password** → `currentPassword` is required and verified via `bcrypt.compare`. Missing → `400 "Current password is required"`; wrong → `400 "Current password is incorrect"`.
- **Account has no password** (Google OAuth / SMS-OTP / email-code "passwordless" accounts — same `!user.password` condition the credentials provider in [auth.ts](../../src/lib/auth.ts) uses to reject login) → **first-time set**. `currentPassword` is ignored; the active session is the sole proof of identity. Success message is `"Password set successfully"` vs `"Password updated successfully"`.

The pre-2026-05-19 `400 "Password changes not available for this account"` guard was **removed** in favour of this set-password path. If you see that string reappear, the fix was reverted (it has been reverted by a branch reset once before). Client counterpart: `PasswordTab.tsx` set-password mode — see [dashboard-account/frontend.md](../dashboard-account/frontend.md).

## Internal Norm endpoints (`/api/internal/norm/v1/**`)

These are HMAC-signed read/write/trigger endpoints for the Norm service account. All go through `withNorm()` ([src/lib/internal-norm/withNorm.ts](../../src/lib/internal-norm/withNorm.ts)) which validates the signature, checks Norm's Role permission, applies the rate limit, audits the call, and enforces the registry's `responseSchema` on outbound payloads.

| Method | Path | Required permission | Tier | Notes |
|---|---|---|---|---|
| `GET` | `/api/internal/norm/v1/health` | `overview.view` | read | Liveness + signing-secret validation |
| `GET` | `/api/internal/norm/v1/manifest` | `overview.view` | read | Full tools manifest for Norm capability discovery |
| `GET` | `/api/internal/norm/v1/roas/summary` | `facebookAds.view` | read | Headline ad spend / revenue / ROAS / profit for a date range |
| `GET` | `/api/internal/norm/v1/roas/breakdown` | `facebookAds.view` | read | Per-campaign/adset/ad ROAS breakdown |
| `GET` | `/api/internal/norm/v1/dashboard/stats` | `overview.view` | read | Strict projection of admin dashboard stats — drops trends/enhanced/snapshotMissingForStanding |
| `GET` | `/api/internal/norm/v1/dashboard/revenue-breakdown` | `overview.view` | read | Revenue total + per-category bucket breakdown |

Dashboard routes (`dashboard/stats`, `dashboard/revenue-breakdown`) delegate to `DashboardStatsService.getStats()` and emit a **strict projection** of the admin shape: trends, enhanced metrics, snapshot-missing-for-standing, and other internal-only fields are dropped before `ctx.ok()` validates against `NormDashboardStatsSchema` / `NormRevenueBreakdownSchema`. Date ranges are resolved through `resolveNormDateRange()` so `current-draw` / `last-draw` keys resolve to real MajorDraw dates before being forwarded to the service.

### `POST /api/auth/register` — optional `fbc` / `fbp` (Meta CAPI enrichment — 2026-05-25)

`registerSchema` accepts two optional fields beyond the registration/attribution data:

- `fbc` — Meta Click ID (`_fbc` cookie value, or reconstructed from a landing `fbclid`).
- `fbp` — Meta browser ID (`_fbp` cookie value).

When present, these are used to enrich the server-side `CompleteRegistration` Conversions API event. In every `CompleteRegistration` block the route now prefers the body value over the cookie: `const fbc = validatedData.fbc ?? ctx.fbc` (and likewise for `fbp`), where `ctx` comes from `extractRequestContext(request)`. Both are optional — omitting them falls back to the `_fbc` / `_fbp` cookies on the request. See [gotchas.md](./gotchas.md) for why the client supplies them.

### `POST /api/auth/register` — TikTok Events API `CompleteRegistration` parity (2026-07-16)

The route now fires a **server-side TikTok Events API `CompleteRegistration`** in parity with the Meta CAPI `CompleteRegistration` it already sent — on **all four** registration branches (new-user, plain-account email+mobile match, plain-account email-only match, plain-account mobile-only match). Previously the TikTok call here was commented out ("client-side only"), so the legacy browser helper never ran server-side (`window` is undefined) and **TikTok received zero registration signal**.

A route-local helper `sendTikTokCompleteRegistration(request, user, eventId)` builds a `CanonicalEvent` (hashed email / phone / `external_id` = user id, plus `ttclid` / `_ttp` from `extractTikTokContext(request)` and client IP / user-agent from `extractRequestContext(request)`) and dispatches it via [`tiktokProvider.capiSend`](../../src/lib/tracking/providers/tiktok.ts). It passes the **same `pixelEventId` (`eventID`)** used for the Meta event so the browser and both server events dedup. It is `await`ed after the Meta send in each branch but is wrapped in its own try/catch and **never throws** — tracking must not break registration. Step-1 registration still does **not** auto-login (unchanged — see [gotchas.md](./gotchas.md)).

### `POST /api/auth/register` — per-IP abuse guard (2026-06-10)

Registration awaits a Stripe customer create + a Facebook CAPI call + several Mongo writes on the request path, so an unthrottled scripted loop can burn the small per-instance Mongo pool and spawn junk accounts/Stripe customers. The route applies a per-IP limiter ([`createRateLimiter`](../../src/utils/security/rateLimiter.ts), bucket `auth-register`) **before `connectDB()`**: **20 requests / minute / IP** → `429` with a `Retry-After` header and a body carrying **both `error` and `message`** ("Too many registration attempts…") — `message` is required because MembershipModal renders `result.message` in its general-error branch; without it the user sees the generic "Registration failed" fallback and just retries. The limit is intentionally more lenient than login's `5/min` (bucket `auth-login`) because registration is funnel-rate and ad spikes can route many legitimate signups through one carrier-NAT / shared egress IP. **Caveat:** the limiter store is in-memory **per serverless instance** (no Redis), so the effective ceiling is `20 × warm-instance-count` — it stops a naive single-IP flood but is not a WAF substitute for a distributed attack.

## Authorization

All protected handlers must call `getServerSession()` and verify. Middleware excludes `/api` so it does NOT gate these routes.

For admin routes elsewhere (`/api/admin/**`), use `requireAdmin(session)` consistently.
