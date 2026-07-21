# Security & CSP — Rules

## R1. No `unsafe-inline` in CSP

Per-request nonce is the way. Don't add `unsafe-inline` to script-src "to make it work" — fix the inline script with a nonce.

## R2. New tracking provider = CSP update

Adding Facebook / Google / Klaviyo / TikTok / etc. requires their script + img + connect domains in CSP. Update [src/utils/security/csp.ts](../../src/utils/security/csp.ts).

**TikTok pixel uses TWO connect-src hosts:** `https://analytics.tiktok.com` (events) **and** `https://analytics-ipv6.tiktok.com` (IPv6 enrichment — `/ipv6/enrich`, captures the user's IPv6 for match quality). Both must be in `connect-src` or the browser console shows `Refused to connect … violates … connect-src` for the IPv6 host and you silently lose IP-based matching. The Events API (`business-api.tiktok.com`) is server-to-server and needs **no** CSP entry.

## R3. Don't break the Stripe webhook

The webhook route has a different header set. Don't accidentally apply COEP to it — Stripe POSTs from a different origin and the response would fail.

## R4. Middleware doesn't gate /api

Auth gate every `/api/**` handler explicitly. Middleware excludes the API namespace.

## R5. Rate-limit public endpoints

Anything public (contact, signup, password-reset request) needs IP-based rate limiting to prevent abuse.

## R6. Mandatory QA review

`.cursor/rules/orchestrator.mdc` requires QA review for security/auth changes. Always.

## R7. Never public-cache per-user responses

A response whose body varies by the authenticated user (anything built from `getServerSession`) must **never** be sent with a shared/`public` `Cache-Control` keyed only by URL. A CDN or browser cache will serve one user's body — or a guest's `null` body — to a different user on the same URL. This caused a production bug where the dashboard showed **0 entries after login**: [`/api/major-draw`](../../src/app/api/major-draw/route.ts) cached a guest copy (`userStats: null`) and served it to a freshly-logged-in user until the cache window lapsed (a reload "fixed" it). It is also a privacy leak (user A's stats served to user B).

Use [`userScopedCacheControl`](../../src/utils/security/cache-control.ts): authenticated requests get `private, no-store`; guests keep the route's public value but with `Vary: Cookie`. `private, no-store` on the authenticated response alone is **not** enough — without `Vary: Cookie`, a previously cached guest `public` entry can still be served to an authenticated (cookie-bearing) request. Because guests on these pages also carry cookies (A/B anonymousId, tracking), `Vary: Cookie` fragments guest caching in practice; the correctness/privacy guarantee takes priority over guest hit-rate. Dev sends `no-store` for these routes, so this class of bug only manifests on staging/production. When adding any route that embeds per-user data, route its `Cache-Control` through the helper.

## R8. New public page? Pick its CSP route class explicitly (2026-07-19)

Static/cacheable marketing page → add its pathname to `STATIC_MARKETING_PATHS` in `src/middleware.ts` AND give the page a `revalidate`; it must not read `headers()`/`cookies()`/session server-side (that includes `getNonce()`). Anything else → the page (or its subtree layout) must export `dynamic = "force-dynamic"`. Never let a page prerender under the nonce CSP — the baked nonce breaks every script on the cached copy. Check: `npm run build` route table shows `ƒ` for every non-marketing page. See architecture.md "Route classes".
