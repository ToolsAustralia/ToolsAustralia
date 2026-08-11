# Partner-discount page analytics

Answers three questions about the two partner-discount catalogue surfaces:

1. **Does the public `/discount` page convert non-members?**
2. **Is the access seam working** — do visitors reach the locked band and act on it?
3. **Do members actually use `/my-account/rewards/catalogue`?**

Read in the admin **Page Analytics** tab (below the promo tables) and mirrored to Norm at
`GET /v1/partner-discount-analytics`.

> **Data starts on this feature's deploy.** `/discount` shipped 2026-08-05 and the member
> catalogue 2026-08-03, both with no instrumentation. There is no history to backfill.

## Why a new model rather than extending `PromoAnalyticsVisit`

Same shape, different funnel. A promo visit is keyed by a landing-page slug and its
engagement columns describe the prize builder; a discount visit is keyed by surface and its
columns describe an access ladder. Folding them together would put two populations in one
table and corrupt the promo dashboard's numbers, which are already load-bearing.

## Pieces

| Piece | Location |
|---|---|
| Model | `src/models/PartnerDiscountVisit.ts` |
| Functional core | `src/utils/partner-discounts/record-discount-visit.ts` |
| Visit beacon | `POST /api/tracking/discount-page-visit` |
| Engagement beacon | `POST /api/tracking/discount-page-engagement` |
| Client hook | `src/hooks/usePartnerDiscountTracking.ts` |
| Service | `src/services/partner-discount-analytics/PartnerDiscountAnalyticsService.ts` |
| Repository | `src/repositories/PartnerDiscountAnalyticsRepository.ts` |
| Admin read | `GET /api/admin/partner-discount-analytics` (`pageAnalytics.view`) |
| Admin UI | `src/components/admin/promo-analytics/DiscountAnalyticsSection.tsx` |
| Norm | `GET /api/internal/norm/v1/partner-discount-analytics` |
| Test | `npm run test:discount-visit` |

## The row

One document per surface-visit in `partnerdiscountvisits`, 90-day TTL
(`PARTNER_DISCOUNT_VISIT_RETENTION_DAYS`, matching `PartnerDiscountSsoIssuance`).

`surface` is `"discount"` or `"catalogue"` — the route names, not "public"/"member". Signed-in
visitors do reach `/discount`, so a public/member split would have been wrong as well as new.

Identity: `anonymousId`, `userId?`, `signedIn`, `accessPct?`. Attribution: `referrer`,
`utmSource/Medium/Campaign`, `utmBasis`. Engagement: `interacted`, `offersOpened`,
`lockedOffersOpened`, `seamRendered`, `seamReached`, `unlockClicks`, `portalHandoff`,
`zeroResultSearch`.

**PII boundary:** opaque `userId` ref and the `anonymousId` cookie value only. Never email,
name, or the offer names the visitor looked at. Mirrors `PartnerDiscountSsoIssuance`.

## Four things that are easy to get wrong

### 1. `seamRendered` is the denominator, not `visits`

`buildBands` only draws the wall marker under the **access-level sort**, and never for a
viewer who can reach everything. The member catalogue never bands at all. Dividing
`seamReached` by `visits` would count people who had no seam to reach as people who failed to
reach it. The panel shows both numbers (`12 / 40 (30%)`) so the base is never hidden, and
renders `—` when no seam was rendered at all.

### 2. `accessPct` absent is not zero

The visit beacon fires the instant the page mounts, so a two-second bounce is still counted —
that population is most of what question 2 is about. A member's tier resolves asynchronously
and often has not arrived yet, so the field is **optional**: absent means "unknown", not
"no access". The engagement flush carries the resolved value and corrects the row.

### 3. Counters are cumulative and written with `$set`, never `$inc`

The client holds absolute page-session totals and the repository `$set`s them. That is what
makes the three flush triggers safe — two or three flushes for one visit converge on the same
row state instead of multiplying it, with no client-side bookkeeping and no corruption on a
retried request. Same rule, same reason, as `PromoAnalyticsRepository.updateVisitBuild`.

### 4. Totals are deduped across surfaces, not summed from the rows

Someone who used both the public page and the member catalogue is **one** visitor in the
summary cards and **one row in each** surface line. The per-surface rows may therefore sum
higher than the totals. Never present them as addends — mixing those units is what once
shipped a literal 250% column on the promo dashboard.

## Flush triggers — all three are load-bearing

| Trigger | Covers |
|---|---|
| `pagehide` | Closing the tab, hard navigation off the site |
| `visibilitychange` → hidden | Mobile Safari, which frequently never fires `pagehide` on app-backgrounding |
| **unmount** | **The common case.** Both surfaces are SPA routes — clicking the header nav away from `/discount` fires no page lifecycle event at all |

A `pagehide`-only implementation silently loses most in-site departures. That is the mistake
to avoid if this is ever rewritten.

## Seam measurement

An `IntersectionObserver` on the `WallMarker` element in `DiscountOfferList`, firing once and
then disconnecting. **Never a scroll listener** — that file's own doc-comment records at
length what happens when work is coupled to scroll position on a 1,833-row list. This matches
the sentinel/`data-stuck` idiom the page already uses for its sticky bar.

## The funnel join

`PartnerDiscountVisit.anonymousId` → `User.signupAttribution.anonymousId` →
`PaymentEvent.BenefitsGranted` (renewals and refunded rows excluded).

`signupAttribution.anonymousId` already existed and is written on every register path, so the
funnel needs **no new attribution field on `User`** — only a plain index on that path
(`UserSchema.index({ "signupAttribution.anonymousId": 1 })`).

Signups are dated by the **attribution touch**, not `createdAt` — registration writes
`signupAttribution` onto pre-existing plain accounts without touching `createdAt`. The shared
`signupTouchWindowMatch` helper from `PromoAnalyticsRepository` expresses that as an indexable
`$or`, so both dashboards agree on when a signup happened.

## Retention clamp

Visits TTL at 90 days; `User` and `PaymentEvent` do not. An unclamped older range divides
complete signups by truncated visits and renders conversion rates in the hundreds of percent.
`resolvePartnerDiscountAnalyticsRange` clamps the **whole** window and surfaces
`clampedToRetention` so the panel can say why a range returned less than asked for.

## Scaling boundary (stated, not hidden)

The signup and conversion legs pass a list of ids through `$in`, bounded by distinct discount
visitors inside the window, and the window is itself clamped to the 90-day TTL — thousands at
current traffic. Every `$match` is a plain equality or `$in` on an indexed field. If discount
traffic grows by an order of magnitude, the migration is a correlated `$lookup` against
`signupAttribution.anonymousId`, measured before it is trusted.

## What this cannot tell you

- **Redemption.** MyRewards sends no activity data back. The portal hand-off is the last
  observable step; `PartnerDiscountSsoIssuance` records that it happened and nothing after.
- **Cross-device.** `anonymousId` is a cookie, so browse-on-mobile → sign-up-on-desktop breaks
  the join. The promo funnel has the same limitation.
