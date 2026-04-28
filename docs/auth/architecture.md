# Auth — Architecture

## Stack

- **NextAuth** for session management
- **Email + password** + **Google OAuth** providers
- Sessions stored in JWT (decoded server-side)
- Mongoose for `User` model (lives in [subscription](../subscription/) for ownership reasons; auth reads it)

## Files

| File | Role |
|---|---|
| [src/lib/auth.ts](../../src/lib/auth.ts) | NextAuth config, providers, session callbacks |
| [src/lib/api-auth.ts](../../src/lib/api-auth.ts) | Helpers for route handlers (get session, require admin) |
| [src/lib/jwt.ts](../../src/lib/jwt.ts) | JWT utilities for password-reset tokens / similar |
| [src/lib/debugAuth.ts](../../src/lib/debugAuth.ts) | Dev-only auth debugging helpers |
| [src/contexts/UserContext.tsx](../../src/contexts/UserContext.tsx) | React context for user session in components |

## Pages

- `/login` — login + signup
- `/reset-password` — password reset
- `/oauth-redirect` — OAuth callback handling

## Two-layer gating

Per CLAUDE.md:
- **Pages** gated by [src/middleware.ts](../../src/middleware.ts) (matcher excludes `/api`)
- **API routes** must do their OWN auth via `api-auth.ts` helpers — middleware doesn't gate them

This matters for admin: `/admin/**` pages are gated by middleware, but `/api/admin/**` handlers must check `session.user.role === "admin"` themselves.

## Session shape

> _TODO: pull session callback from `lib/auth.ts` and document the exact session object shape (user fields exposed)._
