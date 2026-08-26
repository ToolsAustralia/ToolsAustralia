# Middleware

`src/middleware.ts` wraps every page request (matcher excludes `/api`, static assets, and image files) using NextAuth's `withAuth` helper, which decodes the JWT and makes it available as `req.nextauth.token` inside the middleware function.

## Responsibilities

1. **CSP nonce generation** — in production, generates a per-request nonce via `src/utils/security/nonce.ts` and writes CSP headers via `src/utils/security/csp.ts`. Disabled in development to allow Next.js dev tools.
2. **Protected route gating** — `/rewards`, `/my-account` require an authenticated session; unauthenticated visitors are redirected to `/login`.
3. **Admin route gating** — `/admin`, `/api/admin` require an internal user. An internal user is any token where `userType === "staff"` (custom-role staff member) **or** `userType === "admin"` (seeded Admin super-role). The legacy `token.role === "admin"` bridge stays active until Phase 5 cleanup drops the `User.role` field. Anyone else hitting an admin route is redirected to `/`.
4. **Staff route block** — see below.
5. **First-party cookie minting** — see below.

## First-party cookies minted here

Middleware is the right place for these because it is the **only** code that runs on the landing
document request itself, before any JavaScript. All are set on the single `NextResponse.next()`
response, inside the same block, so the CSP flow below is untouched.

| Cookie | httpOnly | TTL | Purpose |
|---|---|---|---|
| `ta_anon_id` | **yes** | 90d | A/B anonymous visitor id (`anon_<uuidv4>`). Authoritative assignment identity — see [ab-testing](../ab-testing/). |
| `ta_anon_id_pub` | **no** | 90d | Browser-**readable mirror** of the exact same value. Added 2026-07-31. |
| `ta_ttclid` | no | 90d | TikTok click id, from `?ttclid=` on the landing URL. |
| `ta_ttclid_ts` | no | 90d | Capture timestamp for the above, so the attribution resolver can window it. |

**Why `ta_anon_id_pub` exists, and why it is not a weakening.** The browser conversion pixels need
a stable anonymous id they can read to send as TikTok `external_id` (coverage was 3%). `ta_anon_id`
is `httpOnly` and stays that way — A/B assignment identity must not be forgeable from page JS —
so the mirror carries the same value under a readable name. It is **never read server-side** and is
never authoritative: it is written *from* `ta_anon_id`, never the reverse. Nothing that trusts the
anonymous id reads the `_pub` copy. If they ever diverge, middleware backfills the mirror from the
httpOnly original on the next page navigation.

**Why `ta_ttclid` is minted here.** Its previous only writer was a post-hydration client effect, so
every visitor who bounced, blocked JS, or converted before hydration produced requests with no
click id — TikTok's Events Manager reported **0% click-id coverage on every server event** while
the browser pixel reported 82%. Minting it on the landing request removes the JS dependency. See
[tracking](../tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md).

**The `?ttclid=` value is length-validated** (`isPlausibleTtclid`, 256 chars) before being
persisted. It is attacker-controllable via the URL and flows onward into Stripe metadata as
`capi_ttclid`; Stripe **fails the entire API call** on any metadata value over 500 characters, so an
unbounded value here could brick a checkout.

**Encoding invariant.** Next's `ResponseCookies.set` percent-**encodes** on write and
`RequestCookies` **decodes** on parse. Middleware therefore passes cookie values **raw** — hand-
encoding would double-encode. The client-side writer in `tiktok-helpers.ts` *must* encode, because
`document.cookie` is raw. Both writers also share the same `domain` (`TTCLID_COOKIE_DOMAIN`): a
host-scoped and a `Domain=`-scoped cookie of one name are two different cookies, and `cookies.get()`
would pick between them non-deterministically.

> **Known gap:** the staff-block, protected-route and admin redirects all `return` before this
> block, so a landing that immediately redirects mints no cookies. Acceptable today — those are all
> authenticated/internal paths, and ad traffic never lands on them.

## Staff route block

`src/middleware.ts` redirects staff users (`token.userType === "staff"`) to `/admin` when they attempt to load any path prefix in `STAFF_BLOCKED_PREFIXES`. This is intentional: staff accounts are not customer accounts. If a staff member wants to purchase, they must create a separate customer account.

The check is a **strict equality** to `"staff"`. Users with `userType === "admin"` (the seeded Admin super-role) are **exempt by design** — they can visit customer pages such as `/shop` and `/my-account` normally. Only custom-role staff (Ads Manager, Customer Support, etc.) are blocked.

The block fires before the protected-route and admin-route checks, so a staff user visiting `/my-account` is always redirected to `/admin` — never to `/login`.

The block-list lives in [`src/utils/security/staffRouteAccess.ts`](../../src/utils/security/staffRouteAccess.ts) as `STAFF_BLOCKED_PREFIXES` + the `isStaffBlockedPath()` predicate — extracted from `middleware.ts` on 2026-08-20 so it is unit-testable (`npm run test:staff-route-access`). Edit the array there:

```
/my-account, /affiliate, /shop, /checkout, /purchase-success,
/mini-draw-success, /upsell-success, /rewards, /membership, /partner
```

**The rule the list encodes:** block a route when visiting it would **create or expose customer state** — an account surface, a purchase flow, or a post-purchase confirmation. *Not* "is it outside `/admin`". `/mini-draws`, `/major-draw`, `/draw-results` and `/winners` are public read-only pages and are **not** blocked; `/mini-draw-success` is, because viewing a draw is read-only and buying into one is not. (`/mini-draws` and `/major-draw` were on the list until 2026-08-20 — see [gotchas.md](./gotchas.md).)

⚠️ **This list is not a purchase guard.** Removing a prefix removes whatever the block *incidentally* prevented. Taking `/mini-draws` off it exposed a working buy widget on a page whose endpoint only checked authentication, so the employee-exclusion guard now lives at `POST /api/mini-draw/purchase` (`isEmployeeAccount`, Terms §5.5). Ask the same question of any future removal.

## Matcher

```
/((?!api|_next/static|_next/image|favicon\.ico|robots\.txt|sitemap\.xml|manifest\.json|sw\.js|icon\.ico|apple-icon\.png|\.well-known/|images/|fonts/|.*\.(png|jpg|jpeg|gif|webp|avif|svg|ico|ttf|woff|woff2|otf|map|txt|xml|json)$).*)
```

Single entry with a negative lookahead — all exclusions are in one regex so they are OR'd correctly (multiple matcher entries use include semantics in Next.js).

## Route-class branch (2026-07-19)

`middleware()` now decides the CSP class before generating a nonce: `isStaticMarketingRoute(pathname)` → no nonce is generated, `buildSecurityHeaders()` (no-nonce variant) is set explicitly, and no `x-nonce` request header is attached (so `getNonce()` returns `undefined` and inline scripts render un-nonced). All other routes keep the existing per-request nonce flow unchanged. The redirect paths (protected-route → /login, admin → /) are always nonce-class. Middleware still runs for marketing routes even when Vercel serves cached HTML — the headers it sets apply to the cached response.
