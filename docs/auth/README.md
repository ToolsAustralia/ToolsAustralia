# Auth domain

NextAuth (email + Google) for member sessions. Password reset, OAuth redirect handling, JWT helpers.

## Index

- [architecture.md](./architecture.md) — NextAuth setup, providers, session shape, password reset
- [frontend.md](./frontend.md) — login/reset pages, oauth-redirect, UserContext
- [backend.md](./backend.md) — `lib/auth.ts`, `lib/api-auth.ts`, `lib/jwt.ts`
- [api.md](./api.md) — `/api/auth/`, `/api/user/`, `/api/users/`
- [rules.md](./rules.md) — handler-level admin checks, password requirements, debugAuth
- [patterns.md](./patterns.md) — session reads via NextAuth, admin guard
- [gotchas.md](./gotchas.md) — middleware excludes /api, admin gating happens twice
- [models.md](./models.md) — _N/A — User model lives in [subscription](../subscription/) but is shared_
- [testing.md](./testing.md) — _TODO_

## Related domains

- **[subscription](../subscription/)** — `User` model is shared; subscription field on User
- **[security-csp](../security-csp/)** — middleware does page gating but not API gating
