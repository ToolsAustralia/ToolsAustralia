# MongoDB — Backend

## Connection

[src/lib/mongodb.ts](../../src/lib/mongodb.ts) — singleton connection. All `import mongoose from "mongoose"` paths must be preceded by importing this module to ensure connection is established.

## Repositories

[src/repositories/](../../src/repositories/) abstracts non-trivial query patterns. When a query involves multi-collection joins or repeated complex aggregations, extract to a repository.

### `PromoAnalyticsRepository.updateVisitBuild` — never-insert update

Attaches the "build your prize" configurator's result (`builtPrizeSlug`, `toolboxSwitches`,
`toolsetSwitches`) to a visitor's most recent `PromoAnalyticsVisit` row, matched on
`{ anonymousId, slug, pageType }` and sorted `{ timestamp: -1 }`.

- **`upsert: false`, and it returns `false` when nothing matched.** This must never create a
  document. The visit row is created exactly once, on landing, by the separate
  `/api/tracking/promo-page-visit` beacon; if this method could insert, an engaged visitor would
  be counted twice and corrupt the visit-count denominator the whole feature is built not to
  disturb.
- **`$set` with absolute totals, never `$inc`.** The client sends cumulative switch counts and
  can redeliver (a debounce landing plus a `pagehide` flush) — `$set` makes redelivery
  idempotent; `$inc` would double-count.

`PromoAnalyticsVisit` gained three optional fields for this (`builtPrizeSlug`,
`toolboxSwitches`, `toolsetSwitches`) plus an index on `{ builtPrizeSlug: 1, timestamp: -1 }`.
All three are optional, so existing documents stay valid — no migration or backfill required.

### `PromoAnalyticsRepository.getAggregatedByPage` — build exposure + engagement aggregation

_Introduced 2026-07-28 as a single `builds` number; split into two numbers 2026-07-31._

Two per-page aggregation blocks over `PromoAnalyticsVisit` compute the build funnel, from **one
ungated `$match`** so the two figures can never be computed over different populations:

```
$match: { timestamp: { $gte, $lte }, builtPrizeSlug: { $exists: true, $ne: "" } }
```

Since F-018 the beacon records `builtPrizeSlug` for **every** visitor (what was on screen, touched
or not), so the field's presence means *exposure*, not engagement. Engagement is summed via the
`BUILD_INTERACTED_FLAG` expression instead of being filtered in the `$match` — which is what lets a
single scan produce both numbers.

| Block | Groups by | Produces |
|---|---|---|
| per (page, combination) | `{ pageType, slug, builtPrizeSlug }` | `builders`, `interactedBuilders` → `buildDistribution` + `topBuiltPrize` |
| per page | `{ pageType, slug }` | `buildVisitors` (exposure), `builds` (engagement) |

Both use the **two-stage distinct-count** shape (see
[patterns.md P8](patterns.md#p8-count-distinct-values-with-two-group-stages-not-addtoset--size)) with
`interacted: { $max: BUILD_INTERACTED_FLAG }` on the inner stage — `$max` makes engagement **sticky
per visitor**, so someone who engaged on one landing and bounced on another is one engaged builder
for that combination, not half of one.

**INVARIANT: the per-page numbers are NOT the sums of the per-combination ones, and must never be
derived from them.** A visitor who lands twice and settles on a different combination each time is
1 in the per-page block and 2 in the per-combination block, so `Σ builders ≥ buildVisitors` always.
Mixing those units — summing a distribution for a numerator while dividing by a page-level count —
is what shipped a literal 250% column on this dashboard.

`buildChangeRate = builds / buildVisitors * 100`. Both operands come from the same pipeline and the
same dedupe, so it cannot exceed 100%.

The pipelines pass **no `hint`** — see the F-020/F-021 entry in
[gotchas.md](gotchas.md#do-not-hint-a-non-partial-index-for-an-exists-filter-2026-07-29-panel-f-020f-021).
The index is PARTIAL (`builtPrizeSlug_ts_partial`) and the planner picks it unprompted: 8 keys / 8
docs examined.

**`crossVisits` and its aggregation block were removed 2026-07-31** — see
[below](#crossvisits-removed-2026-07-31).

#### `buildDistribution` + deterministic `topBuiltPrize` (2026-07-28 gap closure)

The `1c` block's per-`builtPrizeSlug` bucket counts were computed and then **discarded** — only
the single largest bucket survived, as `topBuiltPrize`. A review of the read-side found this threw
away the exact data needed to answer "what % of Makita landers switch away from the page's default
build?" (needs the full per-page *distribution*, not just its mode). Fix: every bucket is now kept
in `buildDistributionMap: Map<pageKey, Array<{ builtPrizeSlug, visitors }>>` and exposed as
`buildDistribution: Array<{ builtPrizeSlug: string; visitors: number }>` on `PromoPageMetrics`
(most-built first, `[]` when nobody built anything on that page).

- **Sort is deterministic: `visitors` descending, `builtPrizeSlug` ascending as a tie-break.** The
  prior code derived `topBuiltPrize` with a bare `count1 > count2` comparison while iterating
  `buildAgg` results in whatever order MongoDB's `$group` happened to return them — on an exact
  tie between two combinations, the winner depended on aggregation-internal doc order, not on any
  meaningful signal. `topBuiltPrize` is now simply `buildDistribution[0]?.builtPrizeSlug ?? null`
  — a single source of truth, so it can no longer disagree with the distribution's own head.
  Verified with a mocked-aggregate probe forcing an exact 4-vs-4 tie between two combinations on
  one page: old logic's outcome depended on mock ordering, new logic always resolves to the
  alphabetically-first slug regardless of input order.
- Does not change `builds` (still the union-of-all-buckets size) or any other existing field.
  Empirically verified byte-identical against live dev DB before/after (see below).

### `PromoAnalyticsRepository.getAggregatedByBuiltPrize` — cross-page built-prize aggregation (2026-07-28)

New method, added alongside (not replacing) `getAggregatedByPage`. Where `getAggregatedByPage`
groups by *landing page*, this groups by the *combination actually built*, across every landing
page — the two other read-side gaps from the same review: "which brands get BUILT more often than
they get LANDED on?" and "do Kincrome-box builders convert better than Milwaukee-box builders?"
(both need volume/signups/conversions/revenue keyed on `builtPrizeSlug`, not on the page slug).

Modeled directly on `getAggregatedByPage`'s idioms, reused exactly:

- **Builders** — `PromoAnalyticsVisit.aggregate`, same `$match` (`timestamp` range +
  `builtPrizeSlug: { $exists: true, $ne: "" }`), `$group` by `builtPrizeSlug` ALONE (not
  `{ pageType, slug, builtPrizeSlug }` — a visitor who built the same combination on two different
  landing pages, or re-visited, counts once), `$addToSet: VISITOR_ID_EXPR`, `$project` to
  `{ builders: { $size: "$visitorIds" } }`. Same dedupe expression as `visits`/`builds`, so
  `builders` is a true unique-visitor count.
- **Signups** — `User.aggregate`, `$match` on `signupAttribution.builtPrizeSlug` exists/non-empty +
  `createdAt` range (the field + its supporting index, `{ "signupAttribution.builtPrizeSlug": 1,
  createdAt: 1 }`, already existed — written by `/api/auth/register`, unread until now), `$group`
  by that field, `$sum: 1`.
- **Conversions + revenue** — `PaymentEvent.aggregate`, same `eventType: "BenefitsGranted"` +
  `timestamp` range + subscription-renewal `$nor` exclusion + `excludeRefundedBenefitsGrantedStages()`
  as `getAggregatedByPage`'s conversion block, but matched on `data.builtPrizeSlug` (exists/non-empty)
  instead of `data.promotionSlug`. `revenue: { $sum: { $ifNull: ["$data.price", 0] } }` — same
  field, same units (AUD dollars, not cents; `data.price` is `packageData.price` as written by
  `payment-processing.ts`, never a cents-multiplied value anywhere in this pipeline).
  `data.builtPrizeSlug` is written by `payment-processing.ts` from
  `user.signupAttribution.builtPrizeSlug` ONLY when `signupAttribution.promotionSlug` is also set —
  so every row this aggregation reads is a strict subset of what the existing `promotionSlug`
  conversion query already reads; no new field-existence edge case.
- **Merge — union of keys, not a fixed page list.** Unlike `getAggregatedByPage` (which iterates a
  fixed `getAllPromoSlugs()` catalog because every landing page slug is known ahead of time),
  `builtPrizeSlug` values are toolbox×toolset *combinations* with no equivalent fixed enumeration
  in this repository, and a combination can have signups/conversions in the window with zero
  builder rows in that same window (built earlier, signed up later). So the merge follows
  `getAggregatedByChannel`'s idiom instead: `new Set([...buildersMap.keys(), ...signupMap.keys(),
  ...conversionMap.keys()])`, one row per key in the union, missing values default to `0` (never
  `undefined`, never `NaN`/`Infinity` — every rate guards its denominator).
- **Sort: `builders` descending, `builtPrizeSlug` ascending as a tie-break** — same deterministic
  pattern used for `buildDistribution` above.
- Returns `{ byBuiltPrize: BuiltPrizeMetrics[] }`, mirroring the `{ byChannel: [...] }` wrapper
  shape `getAggregatedByChannel` returns (it was `{ byUTMSource: [...] }` until 2026-07-31).
  Zero-data range → `{ byBuiltPrize: [] }`,
  never `null` or a thrown error (verified against the real dev DB with a 2099 date range).

> **Consistency note (2026-07-31):** this method’s signup leg dates on
> `signupTouchWindowMatch` like every other signup query in this repository — it prefers
> `signupAttribution.visitedAt`, because `createdAt` is the age of the ACCOUNT, not the date of
> the signup event.

**No new index added.** `PromoAnalyticsVisit` and `User` already carry the indexes this query
needs (`{ builtPrizeSlug: 1, timestamp: -1 }` and `{ "signupAttribution.builtPrizeSlug": 1,
createdAt: 1 }` respectively — both added in the 2026-07-27 prize-build feature, unread by any
query until this one). `PaymentEvent` has **no** index touching `data.*` at all (`data` is
`Schema.Types.Mixed`) — the `data.builtPrizeSlug` match here has the identical performance profile
as the already-shipped `data.promotionSlug` match in `getAggregatedByPage`'s conversion block
(both rely on the top-level `timestamp` index to narrow the range, then filter `data.*` and
`eventType` in memory). This is a **pre-existing** characteristic, not a new gap introduced here —
flagged for awareness, not fixed, since `src/models/**` is out of scope for this change; if
`PaymentEvent` volume ever makes that scan slow, `{ "data.promotionSlug": 1, timestamp: -1 }` and
`{ "data.builtPrizeSlug": 1, timestamp: -1 }` would both need adding together.

**`.hint()` was added (F-003, 2026-07-28) and then REMOVED (F-020, 2026-07-29).** A live
`.explain("queryPlanner")` showed the planner picking the TTL index (`{timestamp:1}`) for both
build aggregations and FETCHing the whole 90-day window, so both calls were given
`{ hint: { builtPrizeSlug: 1, timestamp: -1 } }`. Measurement then showed the hint changed
**nothing** — 764 keys / 764 docs examined either way, because the index was non-sparse and
`$exists: true` therefore spanned its entire key range. It only added a failure mode: MongoDB
rejects a hint naming an absent index, 500-ing the whole admin promo route. Both hints are gone and
the indexes are now PARTIAL, which the planner picks unprompted (8 keys / 8 docs). Full measurement
table: [gotchas.md](gotchas.md#do-not-hint-a-non-partial-index-for-an-exists-filter-2026-07-29-panel-f-020f-021).

**Mirrored to Norm (2026-07-28, follow-up task).** `byBuiltPrize` and `buildDistribution` are now
both declared on `NormPromoAnalyticsSummarySchema`, and `/v1/promo-analytics` was wired to supply
`byBuiltPrize` — verified live with `npm run norm:smoke`. Full details:
[docs/internal-norm/norm-context.md](../internal-norm/norm-context.md#get-v1promo-analytics).

#### `crossVisits` removed (2026-07-31)

The `crossVisits` aggregation (keyed on `PromoAnalyticsVisit.referrerSlug`) is gone, along with the
field and its index declaration. The 2026-07-28 decision to keep it rested on a live-DB count of
174/712 rows still carrying `referrerSlug`; the **last** such row is dated **2026-07-22**, the day
the "Explore other toolsets" carousel that wrote it was replaced by the in-place two-reel
configurator (commit `87f18d78`). Inside the 90-day TTL that makes the metric a structural zero,
not a decaying one.

`PageDetailResult.visitsFrom` and its own `referrerSlug` aggregation went with it, replaced by the
per-page prize-build breakdown (`getPageBuildBreakdown`). **Dropping the schema declaration does
not drop the Mongo index** — see
[gotchas.md](gotchas.md#renaming-an-index-is-a-two-step-change-and-only-one-half-is-automatic).
`referrerSlug_1_slug_1_timestamp_-1` is dropped by
[`scripts/migrations/2026-07-31-promo-analytics-cleanup.ts`](../../scripts/migrations/2026-07-31-promo-analytics-cleanup.ts)
(`npm run migrate:promo-analytics-cleanup[:dry]` — dry-run by default; it reports the doc count and
how many still carry the field before dropping, and treats `IndexNotFound` (27) as a no-op).

### `signupTouchWindowMatch` — dating a signup by its attribution touch (2026-07-31)

`PromoAnalyticsRepository.signupTouchWindowMatch(start, end)` is the `$match` fragment every signup
aggregation on the promo-analytics tab now uses instead of a bare `createdAt` range:

```ts
{ $or: [
  { "signupAttribution.visitedAt": { $gte: start, $lte: end } },
  { "signupAttribution.visitedAt": { $exists: false }, createdAt: { $gte: start, $lte: end } },
]}
```

Registration writes `signupAttribution` onto **pre-existing** plain accounts without touching
`createdAt`, so `createdAt` is the age of the ACCOUNT, not the date of the signup event the
dashboard counts. Same precedence as `resolveSignupTouchAtMs`
([`src/utils/payment/payment-processing.ts`](../../src/utils/payment/payment-processing.ts)), which
fixed the identical cohort for purchases in the 2026-07-19 audit — but deliberately expressed as an
**indexable `$or`** rather than `$expr`/`$ifNull`, because `$expr` cannot use an index and would
turn every signup aggregation on this tab into a full `users` collection scan.

> ⚠️ **It returns a TOP-LEVEL `$or`.** Never spread it into the same object as another `$or` — the
> second key silently overwrites the first and the date window disappears. Combine with
> `$and: [signupTouchWindowMatch(...), channelMatch(...)]`. See
> [gotchas.md](gotchas.md#signuptouchwindowmatch-returns-a-top-level-or--combine-with-and-not-a-spread).

### Channel bucketing is a generated `$expr` — `channelKeyExpr` / `channelMatch` (2026-07-31)

`PromoAnalyticsRepository` no longer groups by a raw `utm_source`. It imports two generators from
[`src/services/attribution/normalizePlatform.ts`](../../src/services/attribution/normalizePlatform.ts)
and applies them to three different collections:

| Generator | Applied to | Purpose |
|---|---|---|
| `channelKeyExpr(sourcePath, mediumPath)` | `PromoAnalyticsVisit.utmSource`, `User.signupAttribution.utmSource`, `PaymentEvent.data.utmSource` | `$switch` twin of the JS `normalizeUtmToPlatform`, used as the `$group` `_id` |
| `channelMatch(sourcePath, mediumPath, channel)` | the same three | `{ $expr: { $eq: [channelKeyExpr(...), channel] } }` — the drill-down predicate |

**That identity IS the fix.** The three legs previously matched three different ways — `$toLower`
grouping for the parent visits table, exact equality against a lowercased value for signups and
conversions, and a case-insensitive `$regex` for the drill-down's visits — so a channel stored
raw-cased matched on one leg and nothing on the others. Production carries `Klaviyo` (6,437 visits
/ 868 signups) and `TIKTOK` (1,399 / 194); both rendered as real traffic with zero signups, zero
conversions and $0 revenue.

`channelMatch` is deliberately `$expr` over the **same** expression used to build the grouping key,
not a hand-written `{ utmSource: { $in: [...] } }`. Two reasons:

1. **Correctness.** An `$in` against the lowercase alias keys matches none of the raw-cased values
   production actually stores.
2. **Non-divergence.** A predicate that is merely *equivalent* to the grouping key can drift from
   it. This one IS the grouping key, so a parent row and its drill-down cannot disagree — by
   construction, not by test.

**Trade-off, accepted and load-bearing: `$expr` is not index-usable.** Every caller therefore pairs
it with a date-range `$match` **first**, which is index-served, and the visit collection is bounded
by the 90-day TTL — so the expression only ever evaluates over one window's rows. This is not a
regression: the code it replaces used `new RegExp("^" + src + "$", "i")`, which no index can serve
either. There is deliberately **no fuzzy host-stripping fallback** — a fuzzy rule is expressible in
`$switch` but not in an index-usable `$match`, so the two could disagree, which is the exact bug
shape being fixed. One config line per dirty form instead.

### `$facet` — one scan, several dedupes (2026-07-31)

`getPageDetailByUTMCampaign` and `getChannelDetail` each run **one** `PromoAnalyticsVisit`
aggregation whose `$facet` emits every dedupe the response needs, instead of one full scan per
breakdown:

| Method | Facets |
|---|---|
| `getPageDetailByUTMCampaign` | `pageTotal` (page-wide), `byCampaign` (per channel/medium/campaign) |
| `getChannelDetail` | `total` (channel-wide), `byPage`, `byCampaign`, `rawSources` (top 20 raw `utm_source` values) |

The motivating bug: `summary.visits` used to be the **sum of the per-page / per-campaign uniques**.
A visitor who arrived once from an ad and again directly was counted twice, so the modal's Visits
card read **171** against a parent row of **170** and visibly jumped upward on load (the modal
prefers the server value over the row value it was seeded with). `summary.visits` now comes from
the dedicated whole-scope facet and is **never** the sum of the breakdown rows.

Signups, conversions and revenue **do** sum correctly across the breakdown rows — each account and
each payment belongs to exactly one campaign. Only visits need the separate dedupe, because one
visitor can appear under several.

`rawSources` is per-source uniques and MAY sum above the channel total; it exists to audit what
folded into a channel (`ig` + `facebook.com` → Facebook / Instagram), never as an addend.

### `PromoAnalyticsRepository` aggregation tests — F-002 closure (2026-07-28)

The "verified with a mocked-aggregate probe" claims in the two sections above (`buildDistribution`
tie-break, `getAggregatedByBuiltPrize` sort/merge) originally referred to throwaway scripts written
during implementation and then deleted — leaving zero regression coverage for maths that feeds the
admin dashboard *and* the Norm external API (panel review finding F-002). That gap is now closed by
`src/repositories/__tests__/PromoAnalyticsRepository-aggregation.test.ts` (`npm run
test:promo-analytics-aggregation`), which stubs `PromoAnalyticsVisit.aggregate` /
`User.aggregate` / `PaymentEvent.aggregate` by call order (mirroring the pattern in
`src/utils/promo-analytics/__tests__/record-prize-build.test.ts`) and calls the **real**
`getAggregatedByPage` / `getAggregatedByBuiltPrize` methods against canned, known inputs — asserting
hard-coded expected outputs, not just that the code runs:

- Two `builtPrizeSlug` rows on the same page both survive `buildDistribution`'s merge, each keeping
  its own visitor count (guards against an overwrite bug collapsing one combination into another).
- An equal-visitors tie sorts `builtPrizeSlug` ascending, and `topBuiltPrize` is always
  `buildDistribution[0]` (the single-source-of-truth relationship the code comment claims).
- A page with no build rows reports `builds: 0`, `buildDistribution: []`, `topBuiltPrize: null`.
- A slug present in the signup aggregation but absent from the build aggregation reports
  `builders: 0` and every builder-denominated rate as `0` — never `NaN`/`Infinity` (the exact
  regression the finding names: a `builders > 0` guard weakened to `>= 0`).
- Exact arithmetic: `builders: 10, signups: 4, conversions: 2` → `40 / 50 / 20`, hard-coded.
- Final `byBuiltPrize` sort: builders descending, `builtPrizeSlug` ascending as tie-break.

Mutation-tested against the real repository file (each change applied, confirmed to fail the
suite, then reverted — verified byte-identical via `git diff --stat`): flipping the tie-break
comparator direction, weakening `builders > 0` to `>= 0`, and breaking the distribution merge into
an overwrite were each caught.

## Jobs / locks

`ChargeJobLock` (in [subscription models](../subscription/models.md#chargejoblock)) is a distributed lock pattern using a Mongo doc with TTL.

[src/lib/jobs/](../../src/lib/jobs/) — additional job-runner code.

## Migrations

[scripts/migrations/](../../scripts/migrations/) — date-prefixed migration scripts. Run via `npm run migrate:*` per `package.json`.

## Operational scripts

Per CLAUDE.md, naming conventions:
- `scripts/migrate-*.ts` → `migrate:*` npm script
- `scripts/backfill-*.ts` → `backfill:*`
- `scripts/sync-*.ts` → `sync:*`
- `scripts/stripe-*.ts` → `stripe:*`
- `scripts/find-*.ts` → `find:*`

Most accept `--dry-run`; prefer the `:dry` variant first.

## Database utilities

[src/utils/database/](../../src/utils/database/) — pure helpers.
