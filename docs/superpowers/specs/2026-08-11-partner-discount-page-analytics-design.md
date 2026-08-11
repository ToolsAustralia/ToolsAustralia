# Partner-discount page analytics — design

**Date:** 2026-08-11
**Branch:** `feature/discount-page-analytics`
**Status:** approved by DJ, implemented in this branch

## The question

"Are users actually interacting with our discount pages, and does that lead anywhere?"

Resolved during brainstorming to three decisions DJ wants to make:

1. **Does `/discount` convert non-members?** — the public page's whole reason to exist.
2. **Is the access seam working?** — do visitors reach the locked band and act on it, or bounce above it.
3. **Do members actually use the catalogue?** — search/filter/offer opens and how many reach the portal hand-off.

## What already existed (audited 2026-08-11, before any code)

- **No bespoke tracking on either surface.** Grep for `trackEvent|dataLayer|gtm|fbq|klaviyo|_uxa|recordVisit|sendBeacon|/api/tracking` across all 23 files under the discount / rewards / catalogue directories returned zero hits.
- **Route-level pageviews already fire.** `shouldTrackRoute()` excludes only `/admin`, `/my-account/settings`, `/affiliate`, `/test-pixels`, `/dev`. Neither surface is suppressed, so GTM, Klaviyo `Viewed Page` and Vercel `<Analytics>` all see them. That answers "did anyone land here" but nothing about in-page behaviour, and none of it joins to `User` or `PaymentEvent`.
- **No history to mine.** `/discount` shipped 2026-08-05 (`20a60db8`); the member catalogue 2026-08-03. Measurement starts at deploy.
- **One downstream signal, with a hole.** `PartnerDiscountSsoIssuance` records one row per successful SSO hand-off (`userId`, `memberLevelPercent`, `success`, 90-day TTL). It has no `anonymousId`, so signed-out visitors — the entire point of the public page — are invisible in it. MyRewards returns nothing after the hand-off.

Contentsquare was considered and **deliberately excluded**: it is on a free plan and is DJ's active testing sandbox, so nothing in this design reads from or depends on it.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Store | First-party Mongo, one new model | Questions 1 and 3 need joins to `User` and `PaymentEvent` that no client-side analytics tool can do |
| Shape | One row per surface-visit, counters `$set` onto that row | The `PromoAnalyticsVisit` precedent; not an event stream |
| Extend `PromoAnalyticsVisit`? | No | Different funnel, different enum, and mixing would corrupt the promo dashboard's numbers |
| Surfaces | `/discount` and `/my-account/rewards/catalogue` only | The parent rewards hub is not a catalogue; mixing it in would leave seam and search columns structurally blank for a third of rows |
| Visit→signup join | `User.signupAttribution.anonymousId` | Already written on every register path — **no User model change** |
| Retention | 90 days | Matches `PROMO_VISIT_RETENTION_DAYS` and the SSO issuance TTL |
| Read surface | Existing Admin → Page Analytics tab | `pageAnalytics.view` already gates three sibling reads |
| Norm | Mirrored in the same task | Rule 10; the three sibling `pageAnalytics.view` reads are already mirrored |

## Naming

Existing domain vocabulary only: **partner-discount**, **discount**, **offer**, **portal hand-off**. Surfaces are `"discount" | "catalogue"` — the route names the code already uses. Nothing named "perks", "deals" or "vouchers".

## The row

`partnerdiscountvisits`, one document per surface-visit.

Identity and context: `surface`, `anonymousId`, `userId?`, `signedIn`, `accessPct`, `referrer`, `utmSource/Medium/Campaign`, `utmBasis`.

Engagement (written by the second beacon, cumulative): `interacted`, `offersOpened`, `lockedOffersOpened`, `seamRendered`, `seamReached`, `unlockClicks`, `portalHandoff`, `zeroResultSearch`.

PII boundary: opaque `userId` ref and `anonymousId` only. No email, no name, no offer names. Matches `PartnerDiscountSsoIssuance` by design.

### Why two seam booleans

`/discount` only bands by access level when `sort === "access"`, and the member catalogue never bands at all. A single `seamReached` would divide by visits that had no seam to reach. `seamRendered` is the honest denominator; the read computes seam rate over it, never over all visits.

### How the seam is measured

A 1px sentinel rendered immediately before the `WallMarker` in `DiscountOfferList`, watched by an `IntersectionObserver`. One observer, fires once, disconnects. This mirrors the sentinel/`stuck` idiom the page already uses for its sticky bar and deliberately avoids a scroll listener — that file's own comment documents at length why scroll-coupled work on a 1,833-row list is a trap.

## Collection

Two beacons per visit, not per interaction:

- **mount** → `POST /api/tracking/discount-page-visit` inserts the row. 60s dedup per `anonymousId` + `surface`.
- **`visibilitychange→hidden`, `pagehide`, and unmount** → `POST /api/tracking/discount-page-engagement` writes the cumulative totals.

**Cumulative totals with `$set`, never `$inc`.** This is the repository's existing rule for `updateVisitBuild` and the reason is flush safety: the client sends absolute counts, so a repeat flush, a retry, or all three triggers firing is harmless. Deltas plus `$inc` would need bookkeeping and would double-count on retry.

**All three triggers are load-bearing.** Both surfaces are SPA routes, so clicking the header nav away from `/discount` fires no `pagehide` at all — without the unmount flush, most in-site departures would lose their counters. Mobile Safari frequently skips `pagehide` on app-backgrounding, which is what `visibilitychange` covers.

Both routes are thin shells: rate-limit → Zod → capture request values synchronously → `after()`. Copied from `promo-page-visit/route.ts` including its two hardened lessons — the budget is keyed on the **visitor cookie, not the IP** (Australian CGNAT puts huge numbers of users behind one egress IP), and each beacon gets its **own** rate-limit bucket.

Two routes rather than one because the insert and the in-place update have different abuse profiles — abuse of the update leaves no row growth for a row-count check to catch. That is exactly why the promo pair is split.

## Read

Aggregation lives in `src/services/partner-discount-analytics/` + `src/repositories/PartnerDiscountAnalyticsRepository.ts`, mirroring promo-analytics. The partner domain has no services layer today and `src/utils/partner-discounts/**` is pure helpers with no DB access, so a three-collection join does not belong there.

**The retention clamp is mandatory.** Visits TTL at 90 days; `User` and `PaymentEvent` never expire. Unclamped, an old range divides complete signups by truncated visits and renders conversion rates in the hundreds of percent — a bug that shipped on the promo dashboard once already.

Admin: a `DiscountAnalyticsSection` inside the existing Page Analytics tab, with its own metric cards and its own table. Not merged into the promo table — a discount visit and a promo visit are different funnels.

## What this will not answer

- **Redemption.** MyRewards sends nothing back; the hand-off remains the last observable step.
- **History.** Starts at zero on deploy.
- **Cross-device.** `anonymousId` is a cookie, so browse-on-mobile → sign-up-on-desktop breaks the join. The promo funnel already has this limitation and this design does not fix it.

## Rules touched

- Rule 2 / manifest — four domains: `partner`, `tracking`, `admin`, `dashboard-account`.
- Rule 5b — CUSTOMER.md, "what customer data is captured" is an explicit trigger.
- Rule 10 — Norm mirrored in the same task.
- Rule 11 — no new customer-facing strings at all; instrumentation is invisible and the admin copy is staff-only.
