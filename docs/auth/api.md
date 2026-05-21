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

## Authorization

All protected handlers must call `getServerSession()` and verify. Middleware excludes `/api` so it does NOT gate these routes.

For admin routes elsewhere (`/api/admin/**`), use `requireAdmin(session)` consistently.
