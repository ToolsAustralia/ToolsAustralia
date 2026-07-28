# Promo — Backend

## Services

| Service dir | Role |
|---|---|
| [src/services/promo/](../../src/services/promo/) | Promo evaluation: resolve which promo applies, compute multipliers/bonuses, validate codes. Also hosts `PromoQueryService.ts` — read-side projections shared between the admin GET routes (`/api/admin/promo/{active,history,alternating-multiplier,bonus-entry/list,bonus-entry/active,link/list,scheduled/list}`) and the Norm read endpoints under `/api/internal/norm/v1/promo/**`. By construction admin + Norm numbers match. |
| [src/services/promo-analytics/](../../src/services/promo-analytics/) | Aggregate `PromoAnalyticsVisit` rows for admin dashboards. Also exports `resolvePromoAnalyticsRange({ range, startDate, endDate })` — the AEST-anchored `today \| yesterday \| custom` date resolver shared between the admin and internal Norm routes so date boundaries stay in lockstep. |

## Utilities

| Util dir | Role |
|---|---|
| [src/utils/promo/](../../src/utils/promo/) | Promo math + eligibility (pure helpers). |
| [src/utils/promo-analytics/](../../src/utils/promo-analytics/) | Helpers for analytics writes / reads. |
| [src/utils/promo-banner/](../../src/utils/promo-banner/) | Banner display logic (which banner to show, when to suppress). |

## PromoMultiplier value range (expanded 2026-05-14)

`PromoMultiplier` (defined in [src/types/promo-multiplier.ts](../../src/types/promo-multiplier.ts)) accepts 17 values, exported as the `PROMO_MULTIPLIERS` constant:

```
2, 3, 5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100
```

- **`12` and `15`** are retained for backward compatibility with historical promos that used them; new promos should prefer the values in the table above.
- The Zod schema and Mongoose enum in the promo models auto-pick up new values via `PROMO_MULTIPLIERS` — no manual enum duplication needed.
- The **same `PROMO_MULTIPLIERS` list** is reused as the options for admin-configurable upsell category multipliers (`UpsellMultiplierConfig`). The two systems share values but operate independently.

## Promo multipliers STACK with upsell multipliers

The promo multiplier (set per promo campaign, applies to package purchase entry counts) and the upsell category multiplier (set in `UpsellMultiplierConfig`, applies to upsell entry counts) **stack** in the upsell formula:

```
upsellEntries = activePromoMultiplier × upsellCategoryMultiplier × baseEntries
```

- Promo multiplier: applied at package purchase as `baseEntries × promoMultiplier`. Resolved by `getEffectivePromoType` / `PromoMultiplierResolverService` (Scheduled > Toggle > Alternating > 1×).
- Upsell multiplier: stacks on top of the promo for the upsell grant. Defaults: `membership=10`, `oneTime=2`, `additional=2`. Mini upsells use a fixed `1×`.

**Example.** A subscriber buying a Tradie subscription during a `5×` membership promo gets `15 × 5 = 75` entries on the subscription. If they accept the Apprentice Pack upsell (admin Membership upsell multiplier = `10×`), they get an *additional* `5 × 10 × 3 = 150` free entries from the upsell.

> Prior to 2026-05-15 this was a "no stacking" system (upsell ignored promo). The change was made on user request so promo seasons amplify upsell value automatically. Watch for stale docs / code that still claim "do not stack" — those are bugs.

## Prize-build core — `recordPrizeBuild` (2026-07-27)

[src/utils/promo-analytics/record-prize-build.ts](../../src/utils/promo-analytics/record-prize-build.ts)
is the functional core behind the "build your prize" beacon (`POST
/api/tracking/promo-prize-build`, see [docs/tracking/api.md](../tracking/api.md)). Its side effect
(`updateVisitBuild`) is injected, so it's unit-testable with no DB — same dep-injection pattern as
`record-promo-visit.ts` (see [gotchas.md](gotchas.md#promo-visit-recording-is-a-dep-injected-functional-core)).

- **Validates BOTH slugs.** The landing `slug` and the `builtPrizeSlug` each pass
  `isValidPromoSlug` independently; a bogus value on either side is rejected before any write.
- **`pageType` is derived from the landing `slug`, never accepted as input.**
  `PrizeBuildCapture` deliberately has no `pageType` field — deriving it via
  `getPageTypeFromSlug(slug)` means the two can never disagree. This matters because
  `PromoAnalyticsRepository.updateVisitBuild` matches the visit row on
  `{ anonymousId, slug, pageType }`; a caller-supplied `pageType` that drifted from the slug would
  silently miss the row instead of erroring.
- **Switch counts are clamped, not trusted as-is.** `clamp()` maps non-finite/negative values to
  `0` and ceilings at `1000` (`MAX_SWITCHES`) before the value ever reaches the database.
- **No `anonymousId` is a no-op, not an error** (`reason: "no_anonymous_id"`) — there is no visit
  row to attach a build to without one.

The write itself (`PromoAnalyticsRepository.updateVisitBuild`) never creates a row — see
[docs/mongodb/backend.md](../mongodb/backend.md#promoanalyticsrepositoryupdatevisitbuild--never-insert-update)
for why: an insert here would corrupt the promo visit count, the one metric this feature must
leave untouched.

## Prize-build admin surfacing — `builds` / `topBuiltPrize` (2026-07-28)

`PromoAnalyticsRepository.getAggregatedByPage` now also returns, per page, `builds` (unique
visitors who assembled a prize on that page) and `topBuiltPrize` (the combination built by the
most visitors there, or `null`). Rendered as a new **Builds** column in
[`PromoAnalyticsManagement`](../../src/components/admin/PromoAnalyticsManagement.tsx), inserted
immediately after the existing **Cross-visits** column (kept, not replaced — see below). Full
aggregation shape and dedupe proof: [docs/mongodb/backend.md](../mongodb/backend.md#promoanalyticsrepositorygetaggregatedbypage--builds--topbuiltprize-aggregation-2026-07-28).

**Cross-visits (`referrerSlug`) is deliberately kept alongside, not replaced.** It was assumed
structurally dead (nothing has written a new `referrerSlug` since 2026-07-24 — the "Explore other
toolsets" carousel that wrote it was removed when the prize builder's toolset reel took over that
job, see `src/docs/PROMOTION_ANALYTICS.md`). Live-DB re-check found 174/712 visit rows (~24%)
still carry `referrerSlug`, spanning June–July, inside the 90-day TTL — so the column still shows
real numbers for those date ranges today. It will read zero once the TTL clears the last row
(~late October 2026); only then is dropping it a safe one-line change.

**Mirrored to Norm.** `NormPromoAnalyticsSummarySchema`
([src/lib/internal-norm/schemas/promo-analytics.ts](../../src/lib/internal-norm/schemas/promo-analytics.ts))
now declares both fields — `builds` as a plain non-negative int, `topBuiltPrize` declared
`.nullable()`, not `.optional()`, since the repository always sets the key, sometimes to `null`;
a bare `z.string()` there would 500 at runtime on every zero-build page, a mismatch `tsc` cannot
catch. Only the summary route (`/v1/promo-analytics`) carries these fields — `page-detail` and
`channel-detail` project a different row shape and were correctly left alone. Verified live with
`npm run norm:smoke` (both a real slug and `null` came back correctly in the same response). Full
field docs and changelog: [docs/internal-norm/norm-context.md](../internal-norm/norm-context.md).

## Read-side gap closure — `buildDistribution` + `getAggregatedByBuiltPrize` (2026-07-28)

The `builds` / `topBuiltPrize` scalars above only surface a page's single most-built combination.
A follow-up review found that left 4 of 5 promised analysis questions unanswerable, and that
`PaymentEvent.data.builtPrizeSlug` — written on every conversion whose signup had a build — was
never read anywhere. Two additions close it, both pure read-side (no migration, no new write, no
schema change):

- **`buildDistribution: Array<{ builtPrizeSlug: string; visitors: number }>`** — added to
  `PromoPageMetrics` alongside `builds`/`topBuiltPrize` (kept unchanged). The FULL per-page
  distribution, most-built first, `[]` when nobody built anything. Answers "what % of Makita
  landers switch away from the page's default build?" — divide any non-default entry's `visitors`
  by the page's `visits`. `topBuiltPrize` is now derived from this same sorted list
  (`buildDistribution[0]?.builtPrizeSlug`), fixing a non-deterministic tie-break the prior
  implementation had on an exact visitor-count tie between two combinations.
- **`PromoAnalyticsRepository.getAggregatedByBuiltPrize(startDate, endDate)`** — new
  cross-page aggregation, grouped by the BUILT combination instead of the landing page. Exposed on
  `PromoAnalyticsService.getAggregatedByBuiltPrize` (mirrors how `getAggregatedByUTMSource` is
  exposed) and wired into `GET /api/admin/promo-analytics`'s response as `data.byBuiltPrize`,
  alongside the existing `data.byUTMSource`. Answers "which brands get BUILT more often than they
  get LANDED on?" (compare `builders` here against `visits` in `byPage`) and "do Kincrome-box
  builders convert better than Milwaukee-box builders?" (`signups`/`conversions`/`revenue`/rates
  are all keyed on `builtPrizeSlug`). Full aggregation-stage reasoning:
  [docs/mongodb/backend.md](../mongodb/backend.md#promoanalyticsrepositorygetaggregatedbybuiltprize--cross-page-built-prize-aggregation-2026-07-28).

**Mirrored to Norm (2026-07-28, follow-up task).** `NormPromoAnalyticsSummarySchema` now declares
both `buildDistribution` (on `PromoPageMetricsSchema`) and `byBuiltPrize` (new
`BuiltPrizeMetricsSchema`), and the Norm route
(`src/app/api/internal/norm/v1/promo-analytics/route.ts`) now calls `getAggregatedByBuiltPrize`
alongside its existing two calls so the field is actually populated, not just declared. Also
surfaced in the admin UI (`PromoAnalyticsManagement.tsx`: a "Switched away %" column + a "By Built
Prize" table). Full details:
[docs/internal-norm/norm-context.md](../internal-norm/norm-context.md#get-v1promo-analytics),
[docs/admin/frontend.md](../admin/frontend.md#promo-analytics--switched-away--column--by-built-prize-table-2026-07-28).

## Cross-domain payment integration

`src/utils/payment/upsell-promo-multiplier.ts` resolves the promo factor used by **both** the hero image selector (`Nx-*.webp` variant) **and** the entry calculator (as `activePromoMultiplier` in the formula above). Single source of truth, dual consumer.

## Cron / jobs

- ScheduledPromo activation/expiration is time-driven. _TODO: locate the scheduler — likely cron or webhook-driven._
- AlternatingPromoMultiplier rotates on schedule. _TODO: locate rotation trigger._

## Repositories

[src/repositories/PromoAnalyticsRepository.ts](../../src/repositories/PromoAnalyticsRepository.ts) — abstracts promo-analytics queries.
