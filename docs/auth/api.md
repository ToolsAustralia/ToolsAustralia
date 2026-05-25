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

### `POST /api/auth/register` — optional `fbc` / `fbp` (Meta CAPI enrichment — 2026-05-25)

`registerSchema` accepts two optional fields beyond the registration/attribution data:

- `fbc` — Meta Click ID (`_fbc` cookie value, or reconstructed from a landing `fbclid`).
- `fbp` — Meta browser ID (`_fbp` cookie value).

When present, these are used to enrich the server-side `CompleteRegistration` Conversions API event. In every `CompleteRegistration` block the route now prefers the body value over the cookie: `const fbc = validatedData.fbc ?? ctx.fbc` (and likewise for `fbp`), where `ctx` comes from `extractRequestContext(request)`. Both are optional — omitting them falls back to the `_fbc` / `_fbp` cookies on the request. See [gotchas.md](./gotchas.md) for why the client supplies them.

## Authorization

All protected handlers must call `getServerSession()` and verify. Middleware excludes `/api` so it does NOT gate these routes.

For admin routes elsewhere (`/api/admin/**`), use `requireAdmin(session)` consistently.
