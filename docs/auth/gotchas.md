# Auth — Gotchas

## Middleware doesn't gate /api

The most common bug: thinking `/api/admin/**` is gated by middleware. It's NOT. Middleware's matcher excludes `/api`. Each handler must check session + role itself.

## Two systems sharing Mongo

Member auth (NextAuth) and affiliate auth (custom `affiliate-auth.ts`) share a Mongo instance but use different models / collections. Don't try to reconcile session shapes.

## `debugAuth` leaking to prod

[src/lib/debugAuth.ts](../../src/lib/debugAuth.ts) is dev-only. If you import it from a production-path file, the bundle leaks debug helpers. Lint config should catch this; if it doesn't, file an issue.

## OAuth callback state

The `oauth-redirect` page handles the OAuth callback. If the state doesn't match (stale tab, race), the redirect should error gracefully and offer a re-login link.

## Password reset token reuse

Tokens are single-use. After successful reset, the token is invalidated server-side. Don't allow re-use even if the user double-clicks.

## CSP and auth flows

NextAuth callbacks include inline scripts in some cases. The CSP config in [security-csp](../security-csp/) must allow these — verify when adding/removing CSP directives.
