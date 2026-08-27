# Security & CSP — Gotchas

## `serverExternalPackages` must externalize `@opentelemetry/api` — Turbopack bundling it broke the `/500` prerender (2026-07-21)

`next.config.ts`'s `serverExternalPackages` now lists `"@opentelemetry/api"` alongside `"mongoose"`. Root cause: the `ai` package (`^6.0.209`) depends on the real `@opentelemetry/api`, and Next's own tracer (`next/dist/server/lib/trace/tracer.js`) prefers a user-installed `@opentelemetry/api` over its bundled compiled shim (`next/dist/compiled/@opentelemetry/api`) when one is resolvable. Under Turbopack, leaving it non-external let it get bundled into server chunks, which altered the module graph enough that Next's auto-generated `/500` fallback page resolved a mismatched `HtmlContext` and failed `next build` outright with `Error: <Html> should not be imported outside of pages/_document` — even though `grep -rl "next/document" src/` finds nothing (the import is transitive, not application code). This has nothing to do with CSP/headers directly, but `next.config.ts` lives in this domain's manifest paths — noted here so a future `serverExternalPackages` edit doesn't drop this entry. Not a CSP/middleware behavior change; `buildSecurityHeaders()`/nonce injection are unaffected.

## `next.config.ts` `devIndicators` is dev-only — NOT a security/CSP setting (2026-06-26)

`next.config.ts` now sets `devIndicators: { position: "top-left" }`. This only moves Next's dev build/route indicator (the "N" pill) off the bottom floating widgets (Cobber support bubble, promotions theme toggle + account FAB). It is **development-only** (never rendered in production) and has **zero effect on CSP, security headers, or middleware**. Next supports only the 4 corners here (no mid-height); `false` hides it. Mentioned because `next.config.ts` lives in this domain — don't mistake it for a header change.

## `requireSameOrigin` is the CSRF guard for cookie-authed mutations (2026-06-19)

[utils/security/requireSameOrigin.ts](../../src/utils/security/requireSameOrigin.ts) — call `requireSameOrigin(request)` at the top of any state-changing route that authenticates from a cookie (cart/orders/mini-draws, affiliate `bank-details`/`update-account`). It returns a 403 `NextResponse` when the request's `Origin` is cross-site, else `null`.

- It treats a request as same-origin when `Origin === request.nextUrl.origin`, so it works on production, Vercel **preview deploys**, and localhost without an env-specific list (the static `allowedOrigins` is just an extra escape hatch). A naive static-allowlist-only check would 403 legitimate requests on preview URLs.
- Requests with **no** `Origin` header are allowed: same-origin GETs and server-to-server callers omit it, and the `sameSite=lax` session cookie already blocks the cross-site POST case. This is the same pattern the `/api/auth/login` origin check uses.

## Middleware never runs for `/api/**` — `/api/admin` is gated in handlers (2026-06-19)

The matcher's negative lookahead excludes `api`, so middleware does not run for any API route. The dead `"/api/admin"` entries were removed from the `adminRoutes` arrays in [middleware.ts](../../src/middleware.ts) (it implied coverage that never existed), and the duplicated `isInternalUser` predicate was hoisted to one module-level helper so the entry gate (`authorized`) and the redirect (`middleware`) can't drift. `/api/admin/**` authorization lives entirely in the per-handler `requireAdminUser`/`requirePermission` checks.

## Two rate limiters: in-memory (default) vs Mongo-backed (auth) (2026-06-19)

[utils/security/rateLimiter.ts](../../src/utils/security/rateLimiter.ts) exports two:

- `createRateLimiter` — **per-instance, in-memory** (`globalThis`). Fine for soft limits; used by Norm, error-reports, Stripe create endpoints, promo. **Not** serverless-safe: an attacker spreading requests across Vercel lambda instances dodges it.
- `createDistributedRateLimiter` — **shared, Mongo-backed** (the `RateLimit` model, TTL-expiring windows). Used by the brute-force-sensitive auth endpoints (`nextauth-credentials`, `auth-register`, `auth-verify-login-code`, `auth-auto-login`). Its `check` is **async** (the others are sync) and it **fails open** — a DB hiccup allows the request rather than locking everyone out. Don't convert the 10+ existing sync callers wholesale; add `await` only where you switch a given endpoint to the distributed variant.

Only the distributed one has **`refund(identifier)`** (added 2026-08-26) — `check()` consumes a token on call, so a caller whose guarded action then fails needs a way to give it back. See architecture.md "`refund(identifier)` on the distributed limiter" and patterns.md P6.

## Stripe webhook COEP

If you accidentally apply COEP to `/api/stripe/webhook`, server-to-server POSTs from Stripe break. CSP for that route is intentionally relaxed.

## Third-party SDK CSP failures

Adding a tracking provider but forgetting CSP → silent failure. Pixel doesn't load, no errors visible (browser blocks before fetch). Always verify in DevTools network tab.

## Inline script without nonce

Server component renders `<script>` inline → CSP blocks → broken UX. Use the nonce pattern.

## Middleware path-matching surprise

Middleware excludes `/api/**` via the matcher config. If you move a page to be served from `/api/some-public-page/`, it loses middleware-applied CSP. Don't.

## Rate limit bypass

Dev mode often bypasses rate limits for testing. Check the env-flag to ensure it's only off in dev. Production shipping a "dev rate limit bypass" = security incident.

## Non-canonical host must redirect, never serve (`connect-src 'self'` cross-origin block)

**The app is single-canonical-host: `toolsaustralia.com.au` (apex).** Everything is wired to the apex — `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, Google OAuth callback URIs, the Let's Encrypt cert SANs, and the canonical/OG metadata (`getBaseUrl()`, `app/layout.tsx metadataBase`).

**Footgun:** the client fetch layer prepends `NEXT_PUBLIC_API_URL` to every call — `apiRequest()` in `src/lib/queries.ts` does `fetch(\`${API_BASE_URL}${endpoint}\`)` where `API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ""`, and `NEXT_PUBLIC_API_URL` is the **absolute apex** (`https://toolsaustralia.com.au/`). So if any *other* hostname (e.g. `www.toolsaustralia.com.au`) is set to **serve** the app, the page shell renders but every data fetch is **cross-origin to the apex** — and `connect-src 'self'` in `csp.ts` (where `'self'` = the host the page loaded on, i.e. `www.`) **refuses it**. Symptom: page loads, then console floods with `Refused to connect ... violates the document's Content Security Policy` for `https://toolsaustralia.com.au/api/*` and the UI shows "Network error – please check your connection". This is **not** a DNS or cert problem — `www.` resolves, has a valid cert, and reaches Vercel fine.

**Rule:** in Vercel → Project → Settings → Domains, every alternate hostname (`www.`, etc.) must be **"Redirect to Another Domain" → `toolsaustralia.com.au`, 308 Permanent** — *not* "Connect to an environment". The redirect happens at the edge before any page renders, so the visitor always lands on the canonical apex and `'self'` matches. _(Applied 2026-06-02: `www.toolsaustralia.com.au` switched from serve → 308 permanent redirect to apex.)_

**Do NOT** "fix" this by widening `connect-src` to list the apex — that just papers over a non-canonical origin and leaves you with split NextAuth sessions (cookies are host-only here; `src/lib/auth.ts` sets no cookie domain) and SEO duplicate-content. If you ever genuinely need to serve the app on multiple origins, the correct (heavier) path is: set `NEXT_PUBLIC_API_URL=""` so fetches are relative/same-origin, **and** add a shared cookie domain `.toolsaustralia.com.au` in `src/lib/auth.ts`, **and** accept the SEO duplicate-content. Not recommended.

## Migrated from `docs/security-regression-checklist.md`

> _TODO: read root file and merge._

## Root-layout `force-dynamic` silently killed all ISR for 6 months (2026-01 → 2026-07)

A blanket `export const dynamic = "force-dynamic"` in `src/app/layout.tsx` (added in a broad payment-flow commit, 4a414d53) overrode every page's own `revalidate` — including the promotions ad-landing pages that explicitly declared ISR — because the most-dynamic segment config in a layout chain wins. Every ad click paid a serverless render + 3–5 Mongo queries + `no-store` HTML. Lesson: never put rendering-mode config in a shared layout; per-page only. Found by the 2026-07-17 perf audit; removed 2026-07-19.

## `getNonce()`/`headers()` in shared server components makes pages dynamic

Any `headers()`/`cookies()` read in a layout or shared server component drags the whole subtree dynamic — a try/catch around it does not undo the dynamic marking. `getNonce()` is a `headers()` read. Marketing-class pages and their server components must not call it (they don't need it: their CSP variant allows un-nonced inline scripts).

## Route-segment config is IGNORED in `"use client"` pages (found 2026-07-19)

`export const dynamic = "force-dynamic"` (and `revalidate`) in a client-component page file is silently inert — Next only honors segment config from server modules. Under the old blanket layout force-dynamic this was invisible (the layout did the work); once the layout stopped forcing, "protected" client pages started prerendering and failing. The sanctioned fix is the 3-line server shim: rename the client page to `page-client.tsx` and create a server `page.tsx` that exports the segment config + `export { default } from "./page-client"`. Never trust a segment export you can see in a file that starts with "use client".

## `useSearchParams` requires a Suspense boundary on any prerendered page — components self-wrap

Every client component that calls `useSearchParams()` and is reachable from a marketing-class (prerendered) page must wrap itself: default-export a thin `<Suspense fallback={null}>` shell around the real `XInner` component in the same file. Layout-level Suspense does NOT cover page children. Trade-off: on static pages these sections render nothing in the prerendered HTML and hydrate in client-side — keep such components below the fold or visually self-contained (the hero must never call useSearchParams).

## Console-cleanup decisions (2026-07-20, staging sweep after perf-tier1)

The staging console showed 5 error classes; disposition of each:
- **Klaviyo `static-app.klaviyo.com` translations fetch** — legit Klaviyo onsite host that was never allowlisted; ADDED to connect-src.
- **Vercel Toolbar (`vercel.live` + pusher websockets)** — injected only on preview/staging deployments; allowlisted CONDITIONALLY (`VERCEL_ENV !== "production"`), so the production policy is byte-identical.
- **`static.hotjar.com/c/hotjar-*.js`** — the dead legacy Hotjar tag inside GTM container GTM-TBCCQQVZ; NOW ALSO neutralized in code via gtm.blocklist:['html'] in GTM_INIT_SNIPPET (2026-07-20, see docs/tracking/gotchas.md); deleting the tag in the GTM UI remains the clean end-state, NOT allowlisting — loading a second session recorder was explicitly rejected in the 2026-07 audit.
- **`*.on.aws` / `*.run.app` `events?cee=no` beacons** — emitted by the Hotjar-by-Contentsquare module embedded in the CS bundle. Neither Contentsquare's CSP docs (`*.contentsquare.net/.com` — already allowlisted) nor Hotjar's (`*.hotjar.com/.io` — already allowlisted) document these endpoints. DELIBERATELY NOT allowlisted: wildcarding generic cloud hosts in connect-src opens a data-exfiltration channel. Resolution path: ask Contentsquare support to serve collection from their documented domains, or disable the Hotjar module in the CS admin.
  - **Still firing, confirmed on production 2026-08-07.** A live page load showed the two blocked endpoints are `https://sl-11a463aaedf44600a99367660fd6fa70.ecs.us-east-1.on.aws/events?cee=no` and `https://bded8a3c6ae-1-1053047382554.us-central1.run.app/events?cee=no`, on every page load (4 console errors). **The decision stands** — still not allowlisted, and the resolution path above is unchanged. Two things make it more urgent: Voice of Customer is about to be enabled and it is **UNVERIFIED** whether survey responses travel over this blocked channel (test a survey submission end-to-end before relying on surveys), and the account is now on a paid plan with vendor support available, so the "ask Contentsquare to serve from documented domains" route is actionable.
- **Acumin font 404** — placeholder @font-face url() for a file never shipped; url() source removed (local()-only) in globals.css.

## `analytics-ipv6.tiktokw.us` added to connect-src (2026-07-22, first e2e staging run)

The e2e suite's first EXTERNAL-mode run against staging (where the TikTok pixel is actually
live — local e2e blanks its env vars) surfaced that TikTok's SDK now sends its IPv6
enrichment beacon (`/ipv6/enrich_ipv6`) to `analytics-ipv6.tiktokw.us` (TikTok's US-entity
domain), while connect-src only listed the older `analytics-ipv6.tiktok.com` — so the beacon
was silently blocked on every deployed environment. ADDED (DJ-approved): a single named
vendor host, not a generic-cloud wildcard, so the `*.on.aws`/`*.run.app` exfiltration
objection above doesn't apply. The main event beacons to `analytics.tiktok.com` were never
affected.

## `script-src` widened to `*.contentsquare.net` — the CS tag injects a second script (2026-08-07)

`script-src` previously listed only the single tag host `https://t.contentsquare.net`. It now
lists `https://*.contentsquare.net`, in **both** branches of `buildContentSecurityPolicy`
([csp.ts](../../src/utils/security/csp.ts)) — the nonce variant and the `'unsafe-inline'`
fallback, which are otherwise identical for the Contentsquare/Hotjar hosts.

**Why.** Contentsquare's Voice of Customer works by having the main tag **inject a second
script**, `hotjar-{SITE_ID}.js`, served from a sibling `contentsquare.net` host — so pinning
`t.` alone silently blocks every survey. Contentsquare's published policy
(docs.contentsquare.com/en/web/content-security-policy/) asks for `script-src
*.contentsquare.net`, `img-src *.contentsquare.net`, `connect-src *.contentsquare.net
*.contentsquare.com`, plus `style-src 'unsafe-inline'` for Voice of Customer. `connect-src`,
`img-src` and `style-src` already satisfied that; `script-src` was the only gap.

**Why this grants nothing new.** The wildcard stays inside a vendor domain we **already** allow
to execute arbitrary JS in our origin, so it confers no capability `t.contentsquare.net` did not
already have. It is explicitly **not** a precedent for wildcarding generic cloud hosts — the
`*.on.aws` / `*.run.app` refusal above still stands.

**No other file needed changing.** `next.config.ts` and `src/middleware.ts` both call
`buildContentSecurityPolicy()`; there is no second policy literal in the repo. `npm run
test:csp-inline-hashes` was run after the change and passed.

## Staff were blocked from the public draw pages (2026-08-20)

**Symptom:** a team member (`userType: "staff"`) opening `/mini-draws` — or clicking through from admin — was redirected to `/admin`. Invisible to the owner, because the rule only ever applied to `"staff"`, never `"admin"`.

**Cause:** `/mini-draws` and `/major-draw` were on the middleware's staff block-list. Those are **public** pages: a logged-out stranger can read them, so the only people who could not were the ones who manage draws. The admin UI links to `/mini-draws/<id>` from three places — `MiniDrawCard`'s "Open the public mini-draw page", `ActivityLogManagement`, and the Overview `ActivityCard` — and every one bounced. `/draw-results` and `/winners`, the same category, were never blocked, so the list also disagreed with itself.

**Fix:** both came off the list, and the rule moved out of `middleware.ts` into `src/utils/security/staffRouteAccess.ts` as a pure predicate so it can be unit-tested (`npm run test:staff-route-access`). Access control shouldn't be verified by reading an inline array.

**The rule the list encodes:** block a route when visiting it would **create or expose customer state** — an account surface, a purchase flow, or a post-purchase confirmation. *Not* "is it outside `/admin`". `/mini-draw-success` therefore stays blocked while `/mini-draws` does not: viewing a draw is read-only, buying into one is not.

---

## Removing a route from the staff block-list removes what the block *incidentally* prevented (2026-08-20)

**Symptom:** none visible. The fix directly above — taking `/mini-draws` off `STAFF_BLOCKED_PREFIXES` so team members could open the draw page the admin UI links to — also opened a **working purchase path** for internal accounts.

**Cause:** `/mini-draws/<id>` renders `MiniDrawPackages` plus a sticky buy bar, and `POST /api/mini-draw/purchase` only ever checked `getServerSession` — its own comment read *"AUTHENTICATION-ONLY: Mini draws are now available to all authenticated users"*. The middleware block had been the *de facto* purchase guard without anyone deciding it should be. Terms §5.5 makes Tools Australia employees ineligible to **win**, so a staff member could be charged for entries that can never pay out.

**Fix:** the guard moved to where it belongs — `isEmployeeAccount(user.userType)` in [`src/utils/giveaway-eligibility.ts`](../../src/utils/giveaway-eligibility.ts), checked at the top of the purchase route and returning 403. It reads the **freshly-loaded User doc, not `session.user.userType`**: the session is a JWT that still says `"customer"` until it refreshes, so a claim-based check would let a newly-promoted staff account through. The buy widget is hidden in the UI too (`MiniDrawInteractions`, and `MiniDrawsContent`'s quick-enter sheet) — but that is cosmetic, the endpoint is reachable directly.

`isEmployeeAccount` lives beside the SA/ACT and under-18 rules deliberately: they are the same concept (who may not enter), and splitting them across modules is how one gets forgotten at a new entry point. It is **not** folded into `isGiveawayIneligible`, which answers a *profile* question (state + birthdate) for form validation — an internal account is a different axis, checked at the purchase boundary.

**The general rule:** an access list is a *visibility* control, not an authorization one. Before removing a prefix, ask what the block was silently doing besides hiding the page — then put that guard at the endpoint where it belongs.

**Covered by:** `npm run test:staff-route-access` (pins `isEmployeeAccount` for `staff`/`admin`/`customer`/absent).

---

## A fail-OPEN limiter is not a spend cap (2026-08-26)

`createDistributedRateLimiter` **fails open** by design: if Mongo is unreachable, `check()` logs
and returns `success: true` rather than blocking
([rateLimiter.ts](../../src/utils/security/rateLimiter.ts), the `catch` at the end of `check`).
That is the right call when the limiter guards *security* — a store hiccup must never lock every
member out of login. It reads very differently once the same primitive sits in front of something
that **costs money**: the SMS gateway spends prepaid credits per message, so during a store
outage the 3-sends-per-day cap silently becomes no cap at all.

The rule: **a fail-open limiter is a courtesy, not a ceiling.** Anything it fronts that spends
must also have a hard limit that does not depend on the limiter being reachable — the prepaid
balance itself, a provider-side cap, and an eligibility gate at the caller (who may request a
code at all). Never present a fail-open limiter as the spend control in a design doc; say what
the real ceiling is. Same reasoning inverted for the refund path: `refund()` is best-effort and
swallows its errors, so worst case a caller loses one token — the failure mode points at
*less* allowance, never more, which is the safe direction for a fail-open design.

Dev bypass, for the same limiter: OTP send limits are off in development unless
`SMS_OTP_RATE_LIMIT_IN_DEV=true` forces them on (so the limiter is testable locally at all);
production always enforces and no env var can disable it —
[`isOtpRateLimitBypassed`](../../src/utils/auth/mobile-otp.ts). Contrast the generic warning in
"Rate limit bypass" above.
