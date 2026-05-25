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

## Login flows: invalidate the full user-scoped cache off the fresh session

After any successful login (password, Google, email-verify auto-login, login-code, and the `/login` page), read the post-login id via `await getSession()` (not the stale `useSession()` closure), invalidate via the canonical [`usePurchaseInvalidation`](../../src/hooks/usePurchaseInvalidation.ts) (covers `users.detail`/`dashboard`/`account`, `majorDraw.*`, orders, rewards — not just the old three keys), then `router.refresh()`. The password-login flow previously guarded this on the closure `session` (null at login time), so invalidation **and** Klaviyo `identify()` were dead code. See [LoginModal](../../src/components/modals/LoginModal/index.tsx) and [/login page](../../src/app/login/page.tsx). Note the real "entries show 0 after login" symptom was an HTTP-caching issue (see [draws/gotchas.md](../draws/gotchas.md)); this invalidation cleanup is defensive.
