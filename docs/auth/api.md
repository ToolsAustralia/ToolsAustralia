# Auth — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| _NextAuth_ | `/api/auth/[...nextauth]/` | NextAuth handler (signin, callback, signout, session) |
| _TODO_ | `/api/auth/**` | Domain-specific auth helpers (signup, password reset, etc.) |
| `POST` | `/api/user/change-password` | Change **or** first-time set the session user's password |
| _TODO_ | `/api/user/**` | Other current-user reads/writes |
| _TODO_ | `/api/users/**` | Multi-user reads (admin-only typically) |

> _TODO: read each handler under [src/app/api/auth/](../../src/app/api/auth/), [src/app/api/user/](../../src/app/api/user/), [src/app/api/users/](../../src/app/api/users/) and document._

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

### `POST /api/auth/register` — per-IP abuse guard (2026-06-10)

Registration awaits a Stripe customer create + a Facebook CAPI call + several Mongo writes on the request path, so an unthrottled scripted loop can burn the small per-instance Mongo pool and spawn junk accounts/Stripe customers. The route applies a per-IP limiter ([`createRateLimiter`](../../src/utils/security/rateLimiter.ts), bucket `auth-register`) **before `connectDB()`**: **20 requests / minute / IP** → `429` with a `Retry-After` header. The limit is intentionally more lenient than login's `5/min` (bucket `auth-login`) because registration is funnel-rate and ad spikes can route many legitimate signups through one carrier-NAT / shared egress IP. **Caveat:** the limiter store is in-memory **per serverless instance** (no Redis), so the effective ceiling is `20 × warm-instance-count` — it stops a naive single-IP flood but is not a WAF substitute for a distributed attack.

## Authorization

All protected handlers must call `getServerSession()` and verify. Middleware excludes `/api` so it does NOT gate these routes.

For admin routes elsewhere (`/api/admin/**`), use `requireAdmin(session)` consistently.
