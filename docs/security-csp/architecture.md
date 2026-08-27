# Security & CSP — Architecture

## Files

| File | Role |
|---|---|
| [src/middleware.ts](../../src/middleware.ts) | NextAuth gating + CSP nonce injection |
| [src/utils/security/](../../src/utils/security/) | CSP construction (csp.ts) |
| [src/lib/rate-limiting/](../../src/lib/rate-limiting/) | Rate limit primitives |
| [src/utils/security/rateLimiter.ts](../../src/utils/security/rateLimiter.ts) | In-memory + Mongo-backed rate limiters (`check` / `refund`) |
| [next.config.ts](../../next.config.ts) | Static fallback security headers |

## CSP construction

Per CLAUDE.md:
> `next.config.ts` and `src/middleware.ts` together build CSP via `src/utils/security/csp.ts`. In production a per-request nonce is generated in middleware and attached as `x-nonce`; static fallback headers exist in `next.config.ts` for routes middleware doesn't run for.

## Stripe webhook exception

The Stripe webhook route (`/api/stripe/webhook`) gets a special header set (no COEP) so server-to-server POSTs work. If you change CSP or add inline scripts, update both `csp.ts` and verify the nonce is being read in the relevant server component.

## Middleware matcher

Middleware runs on most page routes BUT excludes:
- `/api/**` — API routes (handler-level auth required, see R4)
- `/_next/static/**` and `/_next/image/**` — Next.js build artifacts and optimized images
- Static asset paths in `/public/`: `images/**`, `fonts/**`
- Common static files at root: `robots.txt`, `sitemap.xml`, `manifest.json`, `sw.js`, `favicon.ico`, `icon.ico`, `apple-icon.png`
- `/.well-known/**`
- Any URL ending in a static-asset file extension: `png|jpg|jpeg|gif|webp|avif|svg|ico|ttf|woff|woff2|otf|map|txt|xml|json`

So:
- Pages (`/admin/`, `/login/`, `/my-account/`, etc.) → middleware gates auth.
- API routes → handler-level auth checks required.

The matcher uses **a single regex** with all exclusions combined inside one negative lookahead — multiple matcher array entries are OR'd by Next.js (include semantics), so we cannot split path-prefix and extension excludes across two entries. Excluding static asset paths and `/api/**` from middleware avoids JWT decode + CSP nonce generation on bytes/handlers that don't need them — meaningful Edge Requests / Edge Additional CPU cost reduction.

**Gotcha to remember:** Splitting exclusions into two matcher entries causes middleware to run on paths that should be excluded. For example, two-entry exclusion of `/api/**` (entry 1) AND non-extension paths (entry 2) would still run middleware on `/api/admin/*` because entry 2's "non-extension" pattern matches it. Always keep all exclusions inside one negative lookahead in a single matcher entry.

## Page redirects in middleware — and the dashboard access gate (2026-08-27)

`middleware()` runs its redirect checks in a fixed order, each returning early. #2, #3 and #4
apply `buildSecurityHeaders(nonce)` + `x-nonce` to the redirect response, so those paths stay
nonce-class (see "Route classes" below); #1 returns a bare `NextResponse.redirect` and is the one
exception.

| # | Condition | Redirect to |
|---|---|---|
| 1 | `token.userType === "staff"` && `isStaffBlockedPath(pathname)` | `/admin` — see [middleware.md](./middleware.md) |
| 2 | protected route && no token | `/login` |
| 3 | protected route && `token.hasEverPaid === false` && `!isInternalUser(token)` | `/membership` — **added 2026-08-27** |
| 4 | `/admin**` && (no token, or a token that is not internal) | `/` |

`protectedRoutes` is `["/rewards", "/my-account"]` for both #2 and #3.

**Why #3 exists.** A signed-in account that has never bought anything has nothing on the dashboard
to see, so it lands on the join page — a conversion surface — rather than an empty one. Design
rationale:
[2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md)
§5e.

**Why `hasEverPaid`, not `subscription.isActive`.**
[`hasEverPaid`](../../src/utils/auth/has-ever-paid.ts) answers "has this account **ever** completed
a purchase", not "is it paying today". `subscription.isActive` is false for cancelled, paused
(retention freeze) and past-due members, so gating on it would bounce **4,613 paying customers**
(38.5% of all payers) off their own dashboard — including past-due members who still hold live draw
entries and can win. `stripeCustomerId` is wrong in the other direction: registration creates the
Stripe customer *before* any payment, so it is true for ~44k never-paid registrants. The predicate
unions the synchronously-written purchase signals (`stripeSubscriptionId`, `oneTimePackages`,
`subscription.startDate`) alongside webhook-written `processedPayments` so a just-paid buyer is not
bounced during the webhook race. Test: `npm run test:has-ever-paid`.

**Why `undefined` is allowed through.** The condition is `token.hasEverPaid === false`, deliberately
**not** `!token.hasEverPaid`. A token minted before this shipped carries no stamp; treating absent as
"not a customer" would bounce existing signed-in members mid-session, which is worse than letting one
request past — the jwt callback re-stamps on the next request, so the gate closes one navigation
later. Same shape as the `tokenVersion` guard in [auth.ts](../../src/lib/auth.ts), which only fires
once the token already carries the field.

**The token stamp is free.** The jwt callback sets `token.hasEverPaid` on both branches that already
load the user document — the first-token branch and the per-request refresh (`User.findById(token.sub)`,
which runs on every request anyway to keep the session fresh and enforce `deleted` / `tokenVersion`).
No extra query, and because the refresh re-stamps each request, a first purchase unlocks
`/my-account` on the next navigation with no re-login. The field is declared on `JWT` in
[src/types/global.d.ts](../../src/types/global.d.ts).

**Scope.** Page routes only — middleware never runs for `/api/**` (R4), so an endpoint that must be
customers-only checks the predicate itself (`POST /api/auth/send-mobile-login-code` does).
`/membership` is public and is not in `protectedRoutes`, so the redirect cannot loop; staff never
reach the check (#1 diverts them first, and `isInternalUser` is a second belt).

## Edge runtime constraint — `ta_anon_id` minted in middleware (2026-07-28)

`src/middleware.ts` runs in the Edge runtime, which does not support Node's
`crypto` module or `next/headers`. `AnonymousIdService`
([src/services/ab-testing/AnonymousIdService.ts](../../src/services/ab-testing/AnonymousIdService.ts))
imports both, so it **cannot** be imported into middleware — doing so breaks
the build. Middleware instead mints the `ta_anon_id` cookie itself, on the
"all other routes" path right after `const response = NextResponse.next();`,
using a tiny standalone edge-safe module,
[`src/lib/ab-testing/anon-id-cookie.ts`](../../src/lib/ab-testing/anon-id-cookie.ts),
which uses only Web Crypto (`crypto.randomUUID()`, available as an edge
global — no import needed). This duplicates (does not re-export) the cookie
name, 90-day TTL and validation rule from `AnonymousIdService`; see
[docs/ab-testing/architecture.md](../ab-testing/architecture.md) for why the
mint had to move to middleware (concurrent `/assign` calls on the same page
would otherwise split into two anonymous ids for one visitor). Setting a
cookie on the middleware response does **not** change a page's
static/dynamic rendering class — confirmed via `npm run build`: the
`/promotions/[slug]` route stayed in the static route-table group after this
change, so the marketing-class invariant above (route classes: nonce vs
marketing) is unaffected.

## Rate limiting

[src/lib/rate-limiting/](../../src/lib/rate-limiting/) — primitives for per-IP / per-user / global rate limits. Used by:
- Public endpoints (contact, public APIs)
- Admin bulk tools (charge-past-due — 1/admin/5min, 1/global/24h)

The two limiter factories live in [src/utils/security/rateLimiter.ts](../../src/utils/security/rateLimiter.ts) — sync per-instance `createRateLimiter`, and async Mongo-backed `createDistributedRateLimiter` over the [`RateLimit`](../../src/models/RateLimit.ts) collection (one TTL-expiring document per `${bucketKey}:${identifier}`). See gotchas.md "Two rate limiters" for which endpoints use which.

### `refund(identifier)` on the distributed limiter (2026-08-26)

`check()` **consumes a token on the call itself — there is no peek**. A caller that passes the
check and then fails downstream has permanently eaten one of that identifier's allowance while
the guarded action never happened. Tolerable on a 5-per-minute login limit; not tolerable on a
3-per-day one — the SMS OTP send budget
([`claimOtpSendAllowance`](../../src/utils/auth/mobile-otp.ts)) would lose a third of a member's
daily allowance every time the gateway hiccuped. `refund()` hands the token back.

The write is a single guarded `updateOne`; both filter clauses are load-bearing:

| Guard | Prevents |
|---|---|
| `count: { $gt: 0 }` | a double refund driving the counter negative, which would **mint** allowance above `maxRequests` for the rest of the window |
| `resetAt: { $gt: new Date() }` | a late refund resurrecting an already-expired window (the TTL sweep may not have removed the document yet) |

It is **best-effort and silent**: any error is logged and swallowed, never thrown — the caller is
already handling a failure, and a second error thrown on top of the first is strictly worse than
losing one token. Hence `Promise<void>`: there is nothing to branch on.

Composition order (claim daily → claim cooldown → refund daily if cooldown rejects → refund both
if the action fails) is patterns.md P6. Design rationale:
[2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).

## next.config.ts — image + experimental settings

[`next.config.ts`](../../next.config.ts) configures, in addition to security headers:
- `images.minimumCacheTTL: 2_592_000` (30 days) so Image Optimization Cache writes don't churn at the 60s default.
- `images.deviceSizes` pruned to `[640, 750, 828, 1080, 1280, 1920, 2048]` (drops 1200, 3840 from the 8-size default — defaults inflate transformation count and origin transfer).
- `images.imageSizes` pruned to `[16, 32, 64, 128, 256, 384]`.
- `experimental.optimizePackageImports: ["lucide-react", "date-fns", "date-fns-tz"]` — barrel-tree-shake heavy libraries to shrink client bundles.
- `experimental.staleTimes: { dynamic: 30, static: 180 }` — restores client-side router cache window (Next 15 reset the dynamic default to 0s, hurting back/forward nav feel).

The deprecated `domains` field is removed; `remotePatterns` covers all hosts including `localhost` for dev.

### `remotePatterns` is an SSRF boundary, not a convenience list (updated 2026-07-31)

The image optimiser fetches whatever URL it is handed and returns the bytes, so an unbounded
allowlist turns `/_next/image?url=…` into a **server-side request forgery primitive** —
anything reachable from the Vercel function, including internal endpoints, proxied through our
own origin. `remotePatterns` is what stops that. Treat adding a host as a security change:
only add one that is public, static media, and genuinely needed.

The list is built in [`next.config.ts`](../../next.config.ts) from `DEFAULT_IMAGE_HOSTS` plus
the comma-separated `NEXT_PUBLIC_IMAGE_HOSTS`:

| Host | Why |
|---|---|
| `toolsaustralia.com.au`, `assets.toolsaustralia.com.au` | our own media |
| `res.cloudinary.com` | uploads / transformations |
| `s3-ap-southeast-2.amazonaws.com` | **added 2026-07-31** — partner-portal offer artwork on `/my-account/rewards/catalogue` |

**On that last one.** It is a bucket-per-path host, so the pattern admits *any* bucket in that
S3 region, not just the vendor's — broader than ideal, and the reason to keep it to media
paths we actually construct ourselves. We build those URLs in exactly one adapter
([`portal-offer-url.ts`](../../src/utils/partner-discounts/portal-offer-url.ts)) from a
committed id list, never from user input, so nothing member-supplied reaches the optimiser.
If Next ever supports a `pathname` constraint that fits, narrow it.

Note the CSP itself did **not** change: `img-src` already allows `https:` broadly, so the
optimiser allowlist — not CSP — is the control doing the work here.

**Cost, not just safety.** 949 of 1,833 partner offers have artwork, and the file extension
varies per offer — the bucket answers **403** for the wrong one. Guessing either the path or
the extension fires doomed optimiser requests: every miss is a server fetch that ends in an
error. The catalogue therefore builds image URLs only from a committed `id → extension` probe;
see [partner/gotchas.md](../partner/gotchas.md), which also records how probing the wrong
folder once produced a confidently wrong "3% have artwork".

## Route classes: nonce vs marketing (2026-07-19)

The site serves two CSP classes, decided per-pathname in `src/middleware.ts` (`isStaticMarketingRoute`):

| Class | Routes | Rendering | CSP script-src | x-nonce |
|---|---|---|---|---|
| **Marketing** | `/`, `/promotions/**`, `/winners`, `/draw-results`, `/terms`, `/competition-term-majordraw` | Static/ISR (`revalidate` 60–300) | no-nonce variant (`'unsafe-inline'` — the same fallback `next.config.ts` always shipped) | absent |
| **Nonce** | everything else | Dynamic — every page declares `export const dynamic = "force-dynamic"` (or is naturally dynamic) | `'nonce-…'` + Next hashes + the four app snippet hashes (below), no `unsafe-inline` | set per request |

**Why they can't mix:** Next stamps the request's nonce into EVERY inline script it emits (verified in production: 56/56 inline scripts nonced, including all `__next_f` RSC-payload scripts). Cached/ISR HTML therefore carries a *baked* nonce that can never match a fresh per-request CSP header — every script on the page would be blocked. So cached HTML must be served under the no-nonce policy, and nonce-policy routes must render per-request. **The invariant: a route is either nonce-class + dynamic or marketing-class + static.**

**Trade-off accepted (DJ, 2026-07-19):** marketing routes run `'unsafe-inline'` script-src. These pages are anonymous (no session-scoped markup — auth state is client-fetched), all other directives (frame-ancestors, object-src 'none', base-uri, host allowlists) still apply, and this matches the pre-existing static-fallback policy in `next.config.ts`. Pure hash-based CSP was investigated and rejected: Next's RSC inline scripts change per request/revalidation and cannot be hashed.

**Enforcement:** the `next build` route table is the check — only the marketing routes may appear as `○/●` (static/SSG); every other page route must be `ƒ`. The doc-sync for this model lives here; the middleware carries the same invariant in its header comment.

**Related change:** the root layout's blanket `force-dynamic` (added 2026-01-21) and the `(site)` layout's `useSearchParams` workaround were removed — they were silently killing the ISR that `/promotions/[slug]` (`revalidate = 60`, `generateStaticParams`, `dynamicParams = false`) had declared since it shipped, which made every ad click pay a serverless render + Mongo queries. The `(site)` layout's Suspense boundaries are the documented fix for `useSearchParams`.

## Inline-script hashes (2026-07-19)

The root layout is **nonce-free** (`getNonce()` = a `headers()` read = every auto-static route goes dynamic, killing marketing-route ISR). The app's own inline scripts instead execute via **sha256 hash allowlisting** in the NONCE variant of `buildContentSecurityPolicy` ([csp.ts](../../src/utils/security/csp.ts)); on marketing routes the fallback variant's `'unsafe-inline'` covers them. Exactly four FIXED (zero-interpolation) snippet constants exist, in [`src/utils/security/inline-snippets.ts`](../../src/utils/security/inline-snippets.ts):

| Constant | Rendered by | Purpose |
|---|---|---|
| `THEME_BOOTSTRAP_SNIPPET` | `src/app/layout.tsx` `<head>` | pre-hydration dark-mode apply (no light flash) |
| `DEVICE_TIER_SNIPPET` | `src/app/layout.tsx` `<head>` | pre-paint `data-tier` on `<html>` for CSS tokens |
| `GTM_INIT_SNIPPET` | `src/components/GoogleTagManager.tsx` | dataLayer + `gtm.start` seed (container id loads as a separate src-script) |
| `KLAVIYO_QUEUE_SNIPPET` | `src/components/KlaviyoScriptLoader.tsx` | Klaviyo queue/Proxy stub (suite loads as a lazyOnload src-script) |

Rules: a hash covers **exact bytes** — consumers must render the constant verbatim; editing a constant requires recomputing its hash in `csp.ts` (the mapping comment sits next to the tokens). The hashes live ONLY in the nonce variant — adding them to the fallback variant would make browsers ignore its `'unsafe-inline'` (CSP2) and break every other inline script there. Anything needing interpolation (pixel ids, route state) must be imperative provider code or a src-script — see [tracking/gotchas.md](../tracking/gotchas.md) "Pixel bootstraps are imperative provider code". Drift guard: `npm run test:csp-inline-hashes` ([inline-script-hashes.test.ts](../../src/utils/security/__tests__/inline-script-hashes.test.ts)) recomputes each hash against the built CSP in both variants. JSON-LD `<script type="application/ld+json">` blocks need neither nonce nor hash — CSP script-src doesn't gate non-executable data blocks.

## `frame-src` carries the partner portal — a deliberate, narrow relaxation (2026-08-03)

`buildCsp` appends `NEXT_PUBLIC_PARTNER_PORTAL_URL`'s **origin** to `frame-src`, and nowhere
else. This is a real loosening of a boundary this repo otherwise holds tightly, so the reasoning
belongs here rather than only in the partner docs.

**Why.** Opening a partner offer requires a live session on the vendor's portal, and their
hand-off cannot carry a destination (`/verifytoken/{token}` drops every return target — six
forms measured). Loading that hand-off URL in a hidden iframe establishes the session in place,
so a single tap lands the member on the offer instead of bouncing them to a login page. See
`docs/partner/rules.md` R12.

**Scope of the grant.**

| directive | portal added? |
|---|---|
| `frame-src` | **yes** — one named origin |
| `frame-ancestors` | no — they still cannot frame *us* |
| `script-src` | no |
| `connect-src` | no |

So the vendor can be embedded by us; they gain no ability to run script in our origin, read our
DOM (the frame is cross-origin), or be granted any fetch capability.

**Three properties worth preserving if you touch this:**

1. **It comes from env, not a literal.** A vendor's hostname belongs in config plus one adapter
   (CLAUDE.md), so swapping providers does not mean editing the CSP.
2. **https only.** The builder drops a non-`https:` origin. A CSP entry is a trust grant, and an
   `http` one would be tamperable in transit.
3. **Unset ⇒ directive unchanged.** No env, no entry, and the iframe path simply never runs —
   the visible hand-off still works. The feature degrades; the policy never silently widens.

**Do not add a wildcard here.** The same reasoning as the `connect-src` cloud-host decision
above: one named host is auditable, `https://*.somevendor.com` is not.

_(`script-src` does carry `https://*.contentsquare.net` since 2026-08-07. Not a counter-example:
that wildcard widens a vendor domain already granted script execution, rather than granting a new
capability to a host we don't otherwise trust. See gotchas.md.)_

## Build output directory (2026-08-21)

`distDir` is `process.env.NEXT_DIST_DIR || ".next"`. The e2e harness sets it to
`.next-e2e` so its `NEXT_PUBLIC_*` values — which Next inlines into client chunks at
compile time — never land in the cache `npm run dev` serves from. See
`docs/e2e/gotchas.md` for the CORS failure this fixes.
