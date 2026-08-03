# Promo — Backend

## Services

| Service dir | Role |
|---|---|
| [src/services/promo/](../../src/services/promo/) | Promo evaluation: resolve which promo applies, compute multipliers/bonuses, validate codes. Also hosts `PromoQueryService.ts` — read-side projections shared between the admin GET routes (`/api/admin/promo/{active,history,alternating-multiplier,bonus-entry/list,bonus-entry/active,link/list,scheduled/list}`) and the Norm read endpoints under `/api/internal/norm/v1/promo/**`. By construction admin + Norm numbers match. |
| [src/services/promo-analytics/](../../src/services/promo-analytics/) | Aggregate `PromoAnalyticsVisit` rows for admin dashboards. Also exports `resolvePromoAnalyticsRange({ dateRange, startDate, endDate, now? })` — the AEST-anchored `today \| yesterday \| custom` date resolver shared between the admin and internal Norm routes so date boundaries stay in lockstep. The parameter is `dateRange`, deliberately identical to the query-string key every caller parses (see [the date-filter section below](#the-date-filter-was-inert--daterange-vs-range-2026-07-31)); it also returns `visitsRetainedFrom` + `clampedToRetention`. |

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

> **Superseded 2026-07-31 in two places** — see [the per-page build split](#builds-was-exposure-not-engagement--buildvisitors--builds--buildchangerate-2026-07-31)
> (`builds` now means *engagement*, with exposure carried separately as `buildVisitors`) and
> [cross-visits removal](#crossvisits--visitsfrom-removed-2026-07-31). The rest of this section
> still holds.

`PromoAnalyticsRepository.getAggregatedByPage` now also returns, per page, `builds` (unique
visitors who assembled a prize on that page) and `topBuiltPrize` (the combination built by the
most visitors there, or `null`). Rendered as a new **Builds** column in
[`PromoAnalyticsManagement`](../../src/components/admin/PromoAnalyticsManagement.tsx), inserted
immediately after the then-existing **Cross-visits** column. Full
aggregation shape and dedupe proof: [docs/mongodb/backend.md](../mongodb/backend.md#promoanalyticsrepositorygetaggregatedbypage--build-exposure--engagement-aggregation).

**Cross-visits (`referrerSlug`) was deliberately kept alongside at the time**, on the strength of a
live-DB re-check that found 174/712 visit rows (~24%) still carrying `referrerSlug` inside the
90-day TTL. That premise expired: the last row carrying `referrerSlug` is dated **2026-07-22**, so
by 2026-07-31 the column was a structural zero for every reachable range and both the field and the
column were removed — see [below](#crossvisits--visitsfrom-removed-2026-07-31).

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
  `PromoAnalyticsService.getAggregatedByBuiltPrize` (mirrors how `getAggregatedByChannel`, then
  named `getAggregatedByUTMSource`, is exposed) and wired into `GET /api/admin/promo-analytics`'s
  response as `data.byBuiltPrize`,
  alongside `data.byChannel` (then named `byUTMSource`). Answers "which brands get BUILT more often than they
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

## Page Analytics repair — 2026-07-31

Seven independent defects in the admin **Page Analytics** (`promo-analytics`) surface, fixed in one
change. They are grouped below because several of them only made sense together (the channel key
and the drill-down predicate, for instance, HAVE to move as one).

### The date filter was inert — `dateRange` vs `range` (2026-07-31)

`resolvePromoAnalyticsRange` took a parameter named `range`, while all six callers (three admin
routes + three Norm routes) passed a `dateRange`-keyed object. `input.range` was therefore always
`undefined`, the `?? "today"` default won, and **every** requested range — yesterday, custom, the
Norm mirror's included — silently returned AEST *today*.

`tsc` could not catch it: the field was optional and the argument was a variable, so
excess-property checking never applied. Two changes make a recurrence a compile error:

1. The parameter is now named **`dateRange`**, identical to the query-string key and to the
   client's `DateRange` union.
2. Every call site maps **field by field** (`{ dateRange: parsed.data.dateRange, startDate, endDate }`)
   instead of forwarding `parsed.data` wholesale. Passing the Zod output straight through is what
   let the names drift unnoticed.

`yesterday` was separately DST-unsafe — it used `subDays()` on a UTC instant, a fixed 24 h, but two
adjacent AEST midnights are 23 h or 25 h apart across a Sydney transition. It now shifts the
**calendar date** (`shiftYmd`) and converts to UTC once, via `createAESTDateAsUTC`. Custom ranges
also reject a non-`YYYY-MM-DD` string and an inverted `startDate > endDate` rather than coercing.

Regression suite: `npm run test:promo-analytics-range` (14 assertions, no DB/env — the resolver
takes an injectable `now` for tests only).

### Ranges are clamped to the visit-retention floor (2026-07-31)

`PromoAnalyticsVisit` rows are TTL-deleted after **90 days**; `User` and `PaymentEvent` are not. An
older range therefore divided COMPLETE signups and revenue by TRUNCATED visits — "All Time" (launch
2025-11-27) would render visit→signup rates in the hundreds of percent, and a page retired before
the floor would read `visits 0 / signups 400 / revenue $12,000`.

The retention constant is now **exported from the model** (`PROMO_VISIT_RETENTION_DAYS` in
[`src/models/PromoAnalyticsVisit.ts`](../../src/models/PromoAnalyticsVisit.ts)) so the read side can
see it, and `resolvePromoAnalyticsRange` clamps the **whole** window to it — not just the visits
query, because one window for every number is what keeps every ratio computed over one population.
The resolved range carries two extra fields, surfaced on the API and rendered as an amber banner in
the admin tab:

| Field | Meaning |
|---|---|
| `visitsRetainedFrom` | Earliest instant visit rows still exist for, as UTC |
| `clampedToRetention` | `true` when the requested start predated the floor and was moved up |

A window lying **entirely** before the floor collapses to an explicitly empty window at the floor
rather than inverting (`start > end`), which Mongo answers with zero rows and no complaint — so a
caller can tell "no retained data" from "genuinely zero".

**Accepted trade-off:** this tab's all-time revenue no longer includes pre-retention purchases. It
is a funnel, not a revenue ledger; the admin Overview tab remains the full-history revenue source.

### `builds` was exposure, not engagement — `buildVisitors` / `builds` / `buildChangeRate` (2026-07-31)

`updateVisitBuild`'s `interacted` argument was optional with an "absent means engaged" default, and
the tracking route rebuilt its payload field by field and **silently dropped it**. So the default
fired on 100% of writes: `buildInteracted` is `true` on every row that has ever existed, and the
read gate `{ buildInteracted: { $ne: false } }` matched everyone. The **Builds** column counted
every visitor who *loaded* the builder, while being labelled, documented and tooltipped as
engagement.

Scale of the mislabel, measured on production: **1,754 of 1,941 build rows carry zero reel
switches.** Treat every pre-2026-07-31 "Builds" figure as *exposure*.

`interacted` is now **required** end to end (`PrizeBuildCapture` → `PromoAnalyticsService.recordPrizeBuild`
→ `PromoAnalyticsRepository.updateVisitBuild`), so a caller that forgets it fails to compile. The
default is resolved exactly **once**, at the route boundary, from the wire schema's optional field —
previously three separate layers each re-applied their own `!== false` fallback, which is why the
dropped field produced no error anywhere. `PromoPageMetrics` splits the old single number in two:

| Field | Meaning |
|---|---|
| `buildVisitors` | Unique visitors who ended on SOME combination on this page (**exposure**) |
| `builds` | Of those, the ones who actually CHANGED it (**engagement**) |
| `buildChangeRate` | `builds / buildVisitors` as a percent; both operands are page-level uniques, so it can never exceed 100% |

**There is deliberately no backfill.** Engagement is not retro-derivable: the cash toggle is not a
reel card, so a cash-only visitor sits at `0/0` and genuinely engaged, and a `?toolbox=` / `?toolset=`
URL arrival re-hydrates a previously-switched build at `0/0` too. The repository's
`BUILD_INTERACTED_FLAG` expression treats a **missing** flag as a best-effort read of the reel
counters rather than assuming engagement — all such rows age out with the 90-day TTL anyway.

### Channels replace raw `utm_source` (2026-07-31)

`utm_source` is no longer the grouping key anywhere on this tab. Everything buckets by the
pre-existing canonical **`ConvertingPlatform`**
([`src/services/attribution/normalizePlatform.ts`](../../src/services/attribution/normalizePlatform.ts)),
with display metadata in the new
[`src/config/attribution-channels.ts`](../../src/config/attribution-channels.ts).

**Why it had to change.** The three legs of the funnel matched three different ways: visits used a
case-INsensitive `$regex` / `$toLower` grouping, while signups and conversions used exact equality
against a lowercased value. Production stores raw-cased sources, so `Klaviyo` (6,437 visits / 868
signups) and `TIKTOK` (1,399 / 194) each rendered as real traffic with **0 signups, 0 conversions,
$0 revenue**. Verified against production after the fix: **Klaviyo Email 500 signups / 240
conversions, Klaviyo SMS 358 / 236, TikTok 194 / 31.**

`normalizePlatform.ts` gained five exports that make one rule serve all three collections:

| Export | Role |
|---|---|
| `SOURCE_ALIASES` (now exported) | Raw `utm_source` → channel |
| `MEDIUM_SPLIT_SOURCES` | Declarative table for sources whose channel depends on `utm_medium` (today: `klaviyo` → `klaviyo_email` / `klaviyo_sms`). Replaces an inline `if (src === "klaviyo")` branch, which was un-enumerable |
| `channelSourceValues(channel)` | The exact lowercase sources resolving to a channel |
| `ALL_KNOWN_SOURCES` | Every modelled source; its complement defines `other` |
| `channelKeyExpr(sourcePath, mediumPath)` | MongoDB `$switch` twin of `normalizeUtmToPlatform`, **generated** from the same two tables |
| `channelMatch(sourcePath, mediumPath, channel)` | `$match` fragment that IS the grouping key, so a parent row and its drill-down cannot disagree |

Consequences worth knowing:

- `facebook.com` / `ig` / `fb` / `instagram.com` fold into one **Facebook / Instagram** row. That is
  deliberate: `MetaAdInsightsDaily` reports ONE spend figure across both placements, so splitting
  the revenue while spend stays merged would make ROAS uncomputable for either half. The channel
  drill-down's `rawSources` array shows exactly what folded in.
- The API renamed `byUTMSource` → **`byChannel`**; rows carry `channel` (the key) + `channelLabel`
  (the display string). The channel drill-down's query param went `utmSource` → **`channel`**, typed
  as a **closed `z.enum(CHANNEL_KEYS)`**. That removed BOTH
  `new RegExp("^" + visitorSuppliedUtmSource + "$", "i")` construction sites, and the public visit
  beacon now bounds its UTM inputs (≤200 chars, no control characters).
- Channel labels are **config, not derived**. Three copies of
  `src.charAt(0).toUpperCase() + src.slice(1)` inside the repository rendered `Tiktok`, `Ig`,
  `Chatgpt.com` and `Facebook.com-WebsiteKeyInfo` on production values. `ChannelDisplay` also
  carries a `kind` (`paid` / `owned` / `unattributed` / `unknown`) so the UI styles a chip without
  pattern-matching the label text, and an `order` so paid channels sort first.

Adding a platform is: one `ConvertingPlatform` member, its `utm_source` forms in `SOURCE_ALIASES`,
one row in `CHANNEL_DISPLAY`. Everything else is generated; a missing row is a compile error
(`Record<ConvertingPlatform, …>`) and is asserted by `npm run test:normalize-platform`.

### Signups are dated by attribution touch, not `User.createdAt` (2026-07-31)

Registration writes `signupAttribution` onto **pre-existing** plain accounts without touching
`createdAt`, so `createdAt` is the age of the ACCOUNT, not the date of the signup event this
dashboard counts. A visitor who made an account in June, arrived via `/promotions/dewalt` in July
and re-registered was counted against June — a day that page had no traffic at all — while July
showed the conversion with no matching signup.

`PromoAnalyticsRepository.signupTouchWindowMatch(start, end)` prefers
`signupAttribution.visitedAt` and falls back to `createdAt` only when it is absent. Same precedence
as `resolveSignupTouchAtMs` ([`src/utils/payment/payment-processing.ts`](../../src/utils/payment/payment-processing.ts)),
which fixed exactly this cohort for purchases in the 2026-07-19 audit — but expressed as an
indexable `$or` rather than `$expr`. See the
[`$and` hazard](../mongodb/gotchas.md#signuptouchwindowmatch-returns-a-top-level-or--combine-with-and-not-a-spread)
before combining it with another predicate.

**All six signup legs** on this tab now date on `signupTouchWindowMatch`, including
`getAggregatedByBuiltPrize` — none is left on raw `createdAt`.

### Per-page prize-build breakdown (2026-07-31)

New `PromoAnalyticsRepository.getPageBuildBreakdown(pageType, slug, start, end)`, composed into
`getPageDetailByUTMCampaign` (rather than by the service) so the summary and the breakdown are
guaranteed to come from one date window and one page filter. It returns `PageBuildBreakdown`
([`src/types/promo-analytics.ts`](../../src/types/promo-analytics.ts)): the page's
`defaultBuiltPrizeSlug`, its `buildVisitors` / `builds` / `buildChangeRate`, and `byBuild` — one
`PrizeBuildMetrics` row per combination with `builders`, `interactedBuilders`, signups, conversions,
revenue and three rates, plus `isPageDefault`.

The page's own default is **always included, even at zero** — "nobody ended on the combination this
page leads with" is the single most useful thing the table can say, and an absent row would read as
"no data". `getPageDefaultPrizeSlug` moved out of the admin component into
[`src/config/promo-landing-slugs.ts`](../../src/config/promo-landing-slugs.ts) so the server can use
the same value the client showed.

> ⚠️ **`buildVisitors` / `builds` are NOT the column sums of `byBuild`.** They are page-level
> uniques; `byBuild` counts per combination. A visitor who lands twice and settles on a different
> combination each time is **1** above and **2** below, so `Σ builders ≥ buildVisitors` always.
> Never render these as a table footer total — mixing those two units is what shipped the literal
> 250% column documented at
> [docs/admin/frontend.md](../admin/frontend.md#switched-away---the-denominator-must-come-from-the-distribution-2026-07-28-f-013).

### `crossVisits` / `visitsFrom` removed (2026-07-31)

`referrerSlug` measured arrivals from the "Explore other toolsets" carousel, which the in-place
two-reel configurator replaced on **2026-07-22** (commit `87f18d78`). The last row carrying
`referrerSlug` is dated 2026-07-22, so within the 90-day TTL the metric had become a structural
zero rather than a decaying one. Removed rather than left rendering `0`:

- `PromoAnalyticsVisit.referrerSlug` + its `{ referrerSlug, slug, timestamp }` index declaration.
- The `crossVisits` field on `PromoPageMetrics` and its whole aggregation block.
- `visitsFrom` / `VisitsFromMetric` on `PageDetailResult`, and the modal panel that rendered it
  (replaced by the prize-build breakdown above).
- The `referrerSlug` field on the visit beacon's Zod body, `PromoVisitCapture` and
  `PromoAnalyticsService.recordVisit`, plus the `tools-aus:from-promo-slug` sessionStorage read in
  [`usePromoPageTracking`](../../src/hooks/usePromoPageTracking.ts).

**Dropping the schema declaration does NOT drop the Mongo index** — see
[docs/mongodb/gotchas.md](../mongodb/gotchas.md#renaming-an-index-is-a-two-step-change-and-only-one-half-is-automatic).
[`scripts/migrations/2026-07-31-promo-analytics-cleanup.ts`](../../scripts/migrations/2026-07-31-promo-analytics-cleanup.ts)
does that (`npm run migrate:promo-analytics-cleanup[:dry]` — **dry-run is the default**, `--apply`
executes). It drops `referrerSlug_1_slug_1_timestamp_-1` from `promoanalyticsvisits`, treating
`IndexNotFound` (code 27) as a no-op, and additionally `$pull`s the inert `promoAnalytics.view`
string from every `Role` (see the permissions section below). It never deletes documents or fields,
and both actions are reversible.

### Visits now read first-touch attribution (2026-07-31)

The visit beacon previously read UTM only from the **landing URL**, while signups and conversions
both read the durable 90-day first-touch `_ta_attr` cookie. That put the visits column and the
signups column of the Channel table on two different bases: a visitor who arrived on a UTM-tagged
page, browsed to an untagged promo page and registered there gave the paid channel a signup with no
visit (a misleading 0% visit→signup) and Direct a visit with no signup.

`/api/tracking/promo-page-visit` now calls `readAttributionCookieFromRequest`
([`src/utils/tracking/attribution-cookie.ts`](../../src/utils/tracking/attribution-cookie.ts))
**server-side, synchronously**, before scheduling `after()` — for two reasons: `request` must not be
touched inside `after()`, and a client-side read would race the write (the hook that WRITES the
cookie mounts above the one that fires this beacon, and React runs child effects first). Precedence
is `first-touch cookie → explicit body value → URL params`.

Every visit row records where its UTM came from in a new **`utmBasis: "first_touch" | "landing_url"`**
column, so a post-deploy attribution shift is attributable to the precedence change rather than to a
real traffic change:

```js
db.promoanalyticsvisits.aggregate([{ $sortByCount: "$utmBasis" }])
```

### Permissions moved to `pageAnalytics.view` (2026-07-31)

All three admin routes (`/api/admin/promo-analytics{,/channel-detail,/page-detail}`) and all three
Norm registry entries moved from `promos.view` → **`pageAnalytics.view`**, matching the tab's own
gate in `adminTabs.ts` and the `repeat-purchases` precedent. `promoAnalytics.view` is checked by
**zero** routes and is now documented as legacy/inert — see
[docs/auth/permissions-catalog.md](../auth/permissions-catalog.md#promoanalyticsview-is-legacy--inert-2026-07-31).
The cleanup migration `$pull`s the string from every stored `Role`; its **catalog entry stays** for
now, deliberately — `Role` validates every permission against the catalog on save, so deleting the
entry while roles still hold the string would make editing those roles fail. Run the migration
first, delete the catalog entry in a follow-up.

The divergence was **latent, not breaking**: production has only Admin, Manager and Customer Support
roles (there is no "Ads Manager" role in production despite the seed template), and both Admin and
Manager held `promos.view`.

### Norm lockstep (2026-07-31)

[`src/lib/internal-norm/schemas/promo-analytics.ts`](../../src/lib/internal-norm/schemas/promo-analytics.ts)
was rewritten in the same change. The required `crossVisits` field would have been a **runtime 500**
inside `withNorm`'s `responseSchema` validation the moment the repository stopped returning it —
invisible to `tsc`. Added: `byChannel` (+ `ChannelKeySchema`), `buildVisitors`, `buildChangeRate`,
`interactedBuilders`, `buildBreakdown`, `rawSources`, and the two new `dateRange` fields.

`scripts/internal-norm-smoke.ts` now **exits non-zero on a non-2xx** — it previously printed a 500
and exited 0, so `npm run norm:smoke` could never fail, which defeated the one failure mode the
script exists to catch. New composite script `npm run norm:smoke:promo-analytics` hits all three
endpoints. Full field docs: [docs/internal-norm/norm-context.md](../internal-norm/norm-context.md#get-v1promo-analytics).

## Cross-domain payment integration

`src/utils/payment/upsell-promo-multiplier.ts` resolves the promo factor used by **both** the hero image selector (`Nx-*.webp` variant) **and** the entry calculator (as `activePromoMultiplier` in the formula above). Single source of truth, dual consumer.

## Cron / jobs

- ScheduledPromo activation/expiration is time-driven. _TODO: locate the scheduler — likely cron or webhook-driven._
- AlternatingPromoMultiplier rotates on schedule. _TODO: locate rotation trigger._

## Repositories

[src/repositories/PromoAnalyticsRepository.ts](../../src/repositories/PromoAnalyticsRepository.ts) — abstracts promo-analytics queries.
