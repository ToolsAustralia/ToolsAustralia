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

### `PromoAnalyticsRepository.getAggregatedByPage` — `builds` / `topBuiltPrize` aggregation (2026-07-28)

A third per-page aggregation block (`1c`, alongside the existing `1` visits and `1b` cross-visits
blocks) computes built-prize engagement from the same `PromoAnalyticsVisit` collection:

- **`$match`** on the same `timestamp` date-range window plus `builtPrizeSlug: { $exists: true, $ne: "" }`
  — visitors who never touched the "build your prize" reels have no `builtPrizeSlug`, so they are
  excluded from the numerator by construction, not by a post-filter. Backed by the
  `{ builtPrizeSlug: 1, timestamp: -1 }` index already added for `updateVisitBuild`.
- **`$group`** by `{ pageType, slug, builtPrizeSlug }` with `visitorIds: { $addToSet: VISITOR_ID_EXPR }`
  — the SAME dedupe expression the `visits` and `crossVisits` blocks use (userId if set, else
  anonymousId, else a synthetic per-row id), so `builds` is directly comparable to `visits` as a
  ratio (both are unique-visitor counts, never raw row counts).
- In application code, the per-`{pageType, slug}` visitor-id sets from every `builtPrizeSlug`
  bucket are unioned into `buildVisitorIds` (→ `builds = size of the union`).
- Adds `builds: number` and `topBuiltPrize: string | null` to `PromoPageMetrics`, alongside
  (not replacing) `crossVisits`. Does not touch the `visits` / `crossVisits` / `signups` /
  `conversions` / `revenue` maps or the `totalVisits`/`totalSignups`/`totalConversions`/
  `totalRevenue` accumulators — verified with a before/after `git stash` A/B run against the live
  dev DB (identical totals both sides: `totalVisits: 84, totalSignups: 53, totalConversions: 64,
  totalRevenue: 3249.89`).

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
  `getAggregatedByUTMSource`'s idiom instead: `new Set([...buildersMap.keys(), ...signupMap.keys(),
  ...conversionMap.keys()])`, one row per key in the union, missing values default to `0` (never
  `undefined`, never `NaN`/`Infinity` — every rate guards its denominator).
- **Sort: `builders` descending, `builtPrizeSlug` ascending as a tie-break** — same deterministic
  pattern used for `buildDistribution` above.
- Returns `{ byBuiltPrize: BuiltPrizeMetrics[] }`, mirroring the `{ byUTMSource: [...] }` wrapper
  shape `getAggregatedByUTMSource` already returns. Zero-data range → `{ byBuiltPrize: [] }`,
  never `null` or a thrown error (verified against the real dev DB with a 2099 date range).

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

**Planner ignores the `{builtPrizeSlug:1, timestamp:-1}` index — `.hint()` added (F-003, 2026-07-28).**
A live `.explain("queryPlanner")` against the dev DB showed the planner picking the TTL index
(`{timestamp:1}`) for both build aggregations above, then FETCHing every document in the 90-day
window and filtering `builtPrizeSlug` in-stage — at current volume (~730 rows, ~0.4% carrying a
build) the cost estimate favours the TTL index over the purpose-built one. Forcing the intended
index with `.hint()` proved it well-formed and usable; the planner simply doesn't choose it
unprompted, and at 100× volume the unhinted plan would FETCH the whole window on every dashboard
load. Both `buildAgg` calls (`getAggregatedByPage`'s `1c` block and `getAggregatedByBuiltPrize`'s
builders block) now pass `{ hint: { builtPrizeSlug: 1, timestamp: -1 } }` as the aggregate options
argument — not the `.hint(...)` chained-method form, because the existing test stub
(`PromoAnalyticsRepository-aggregation.test.ts`) mocks `Model.aggregate` to return a bare
`{ exec }` object with no `.hint` method; passing the hint as `Model.aggregate(pipeline, options)`
is functionally identical (`Aggregate.prototype.hint` just sets `this.options.hint` under the
hood) and doesn't require the stub to grow a `.hint()` no-op. No other `.aggregate()` call in this
file was touched — the rest (visits, cross-visits, signups, conversions) have no selective
predicate to hint, so they legitimately scan the window.

**Mirrored to Norm (2026-07-28, follow-up task).** `byBuiltPrize` and `buildDistribution` are now
both declared on `NormPromoAnalyticsSummarySchema`, and `/v1/promo-analytics` was wired to supply
`byBuiltPrize` — verified live with `npm run norm:smoke`. Full details:
[docs/internal-norm/norm-context.md](../internal-norm/norm-context.md#get-v1promo-analytics).

**Cross-visits was NOT replaced.** An earlier draft of this feature assumed the `crossVisits`
aggregation (keyed on `referrerSlug`) was dead because nothing has written a new `referrerSlug`
since 2026-07-24. Live-DB re-verification found 174 of 712 visit rows (~24%) still carry
`referrerSlug`, so the column still renders real historical numbers for June/July date ranges —
removing it would have deleted a live view. `PromoAnalyticsVisit`'s 90-day TTL index means those
rows age out on their own; the column will read all-zero once the last one expires (~late October
2026), at which point dropping it is a one-line change. See
[docs/admin/frontend.md](../admin/frontend.md#promo-analytics-table--builds-column-added-cross-visits-deliberately-kept-2026-07-28).

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
