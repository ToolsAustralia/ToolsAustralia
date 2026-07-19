# Middleware

`src/middleware.ts` wraps every page request (matcher excludes `/api`, static assets, and image files) using NextAuth's `withAuth` helper, which decodes the JWT and makes it available as `req.nextauth.token` inside the middleware function.

## Responsibilities

1. **CSP nonce generation** — in production, generates a per-request nonce via `src/utils/security/nonce.ts` and writes CSP headers via `src/utils/security/csp.ts`. Disabled in development to allow Next.js dev tools.
2. **Protected route gating** — `/rewards`, `/my-account` require an authenticated session; unauthenticated visitors are redirected to `/login`.
3. **Admin route gating** — `/admin`, `/api/admin` require an internal user. An internal user is any token where `userType === "staff"` (custom-role staff member) **or** `userType === "admin"` (seeded Admin super-role). The legacy `token.role === "admin"` bridge stays active until Phase 5 cleanup drops the `User.role` field. Anyone else hitting an admin route is redirected to `/`.
4. **Staff route block** — see below.

## Staff route block

`src/middleware.ts` redirects staff users (`token.userType === "staff"`) to `/admin` when they attempt to load any path prefix in `STAFF_BLOCKED_PREFIXES`. This is intentional: staff accounts are not customer accounts. If a staff member wants to purchase, they must create a separate customer account.

The check is a **strict equality** to `"staff"`. Users with `userType === "admin"` (the seeded Admin super-role) are **exempt by design** — they can visit customer pages such as `/shop` and `/my-account` normally. Only custom-role staff (Ads Manager, Customer Support, etc.) are blocked.

The block fires before the protected-route and admin-route checks, so a staff user visiting `/my-account` is always redirected to `/admin` — never to `/login`.

The block-list lives inline in `middleware.ts`. To add or remove a prefix, edit the `STAFF_BLOCKED_PREFIXES` array in the middleware function:

```
/my-account, /affiliate, /shop, /checkout, /purchase-success,
/major-draw, /mini-draws, /mini-draw-success, /upsell-success,
/rewards, /membership, /partner
```

## Matcher

```
/((?!api|_next/static|_next/image|favicon\.ico|robots\.txt|sitemap\.xml|manifest\.json|sw\.js|icon\.ico|apple-icon\.png|\.well-known/|images/|fonts/|.*\.(png|jpg|jpeg|gif|webp|avif|svg|ico|ttf|woff|woff2|otf|map|txt|xml|json)$).*)
```

Single entry with a negative lookahead — all exclusions are in one regex so they are OR'd correctly (multiple matcher entries use include semantics in Next.js).

## Route-class branch (2026-07-19)

`middleware()` now decides the CSP class before generating a nonce: `isStaticMarketingRoute(pathname)` → no nonce is generated, `buildSecurityHeaders()` (no-nonce variant) is set explicitly, and no `x-nonce` request header is attached (so `getNonce()` returns `undefined` and inline scripts render un-nonced). All other routes keep the existing per-request nonce flow unchanged. The redirect paths (protected-route → /login, admin → /) are always nonce-class. Middleware still runs for marketing routes even when Vercel serves cached HTML — the headers it sets apply to the cached response.
