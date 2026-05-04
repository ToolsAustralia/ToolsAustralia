# Auth — Backend

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
