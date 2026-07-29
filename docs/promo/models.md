# Promo — Models

7 collections own this domain.

| Model | Path | Purpose |
|---|---|---|
| `Promo` | [src/models/Promo.ts](../../src/models/Promo.ts) | A promo offering (code, multiplier, bonus). |
| `PromoLink` | [src/models/PromoLink.ts](../../src/models/PromoLink.ts) | Trackable share link tied to a promo. |
| `ScheduledPromo` | [src/models/ScheduledPromo.ts](../../src/models/ScheduledPromo.ts) | A promo bound to a date range (auto-activate / auto-expire). |
| `AlternatingPromoMultiplier` | [src/models/AlternatingPromoMultiplier.ts](../../src/models/AlternatingPromoMultiplier.ts) | Multiplier that alternates between values on a schedule. |
| `PromoBannerText` | [src/models/PromoBannerText.ts](../../src/models/PromoBannerText.ts) | Site-wide banner text content. |
| `PromoAnalyticsVisit` | [src/models/PromoAnalyticsVisit.ts](../../src/models/PromoAnalyticsVisit.ts) | Per-visit analytics row. |
| `BonusEntryPromo` | [src/models/BonusEntryPromo.ts](../../src/models/BonusEntryPromo.ts) | Bonus draw-entries promo. |

> _TODO: pull exact schemas (fields, indexes, relationships) for each from source files. Currently inventoried only._

## `PromoAnalyticsVisit` — prize-build fields (2026-07-27)

Three optional fields record the "build your prize" configurator's result on top of the existing
visit row: `builtPrizeSlug` (the assembled prize, e.g. `makita-kincrome`), `toolboxSwitches` /
`toolsetSwitches` (reel-engagement counts). `slug` is unchanged and still means the **landing
page** the visitor arrived on — `builtPrizeSlug` is additive, not a replacement, and the two can
name different brands (e.g. landed on `/promotions/makita`, built the DeWalt combo). All three
are optional, so the change needed **no migration and no backfill**: pre-existing rows stay valid
with the fields simply absent.

Indexed by `{ builtPrizeSlug: 1, timestamp: -1 }` for the Phase 4 prize-popularity breakdown — as a
**partial** index named `builtPrizeSlug_ts_partial` (see below). See
[backend.md](backend.md#prize-build-core--recordprizebuild-2026-07-27) for how the fields get written, and
[docs/mongodb/backend.md](../mongodb/backend.md#promoanalyticsrepositoryupdatevisitbuild--never-insert-update)
for the never-insert update that persists them.

### The build-prize index is PARTIAL (2026-07-29, panel F-021)

```ts
PromoAnalyticsVisitSchema.index(
  { builtPrizeSlug: 1, timestamp: -1 },
  { name: "builtPrizeSlug_ts_partial", partialFilterExpression: { builtPrizeSlug: { $exists: true } } }
);
```

It shipped non-partial and **narrowed nothing**. Both build aggregations in
`PromoAnalyticsRepository` match `builtPrizeSlug: { $exists: true, $ne: "" }`, and a non-sparse
index stores a missing field as `null`, so those bounds come back as the entire key space
(`[MinKey, "") ("", MaxKey]`). Measured on the dev DB — 764 docs, 8 carrying the field — the scan
examined **764 keys / 764 docs either way**, forced or not. F-020 removed the `hint`s that forced
it; this makes the index actually worth having:

| | plain index (forced) | **partial index (planner's own choice)** |
|---|---|---|
| `promoanalyticsvisits`, 764 docs / 8 carrying | 764 keys / 764 docs | **8 keys / 8 docs** |
| `users`, 895 docs / 1 carrying | 128 keys / 127 docs | **1 key / 1 doc** |

`User.signupAttribution.builtPrizeSlug` had the identical defect and got the identical fix
(`signupBuiltPrize_createdAt_partial`) — that side is the `signups` half of the same funnel.

Note the planner now picks both **without a hint**, which is the point: re-adding a `hint` would
reintroduce F-020's failure mode (MongoDB rejects a hint naming an absent index, 500-ing the whole
admin promo route on a fresh deploy or after a restore).

**The new name is load-bearing, not cosmetic.** Mongoose cannot alter an index in place:
re-declaring the same NAME with a changed `partialFilterExpression` is rejected by the server
(measured here as code 86, _"An existing index has the same name as the requested index"_; commonly
cited as `IndexOptionsConflict`/85), and `autoIndex` swallows the error, so it would silently never
build. A differently-named partial index *may* coexist with the old one, so deploy and migration
are safe in either order. The superseded `builtPrizeSlug_1_timestamp_-1` /
`signupAttribution.builtPrizeSlug_1_createdAt_1` are dropped by
`scripts/migrations/2026-07-29-partial-build-prize-indexes.ts`
(`npm run migrate:partial-build-prize-indexes[:dry]`, dry-run by default). Adding a field to this
schema that a query will filter on `$exists` means adding a **partial** index for it, or paying
write amplification for nothing.

## Relationships

```
Promo ─┬─< PromoLink (one-to-many: a promo can have multiple share links)
       ├─< ScheduledPromo (date-range bindings)
       ├─< AlternatingPromoMultiplier (rotation config)
       └─< BonusEntryPromo (specific bonus-entry promos)

PromoLink ──< PromoAnalyticsVisit (each link has visit history)

PromoBannerText (independent — banner text doesn't reference Promo directly per current schema)
```

## Idempotency

`PromoAnalyticsVisit` writes are append-only (one row per visit). No dedup — if you want unique visitors, do it at the aggregation step.

`Promo`-issued benefits (multipliers, bonuses) flow through the [billing-stripe](../billing-stripe/) ledger pattern — `BenefitsGranted.data.grants.promoIds[]` records which promos contributed to a payment's grants.

## `PromoAnalyticsVisit.buildInteracted` (2026-07-29, panel F-018)

`builtPrizeSlug` answers **"what was on screen"**; `buildInteracted` answers **"did they engage"**.
Those two questions used to be conflated in the field's *presence*, which is what broke the funnel:

- The signup path records the page's default build for a visitor who never touched the reels
  (`MembershipModal` falls back to the page prize), so `signups` counted them.
- The visit beacon used to return early for that same visitor, so `builders` did **not** count them.
- `getAggregatedByBuiltPrize` divides one by the other, so `builderToSignupRate` could exceed 100% —
  the same class of visibly-impossible number as the 250% switched-away column (F-013).

The beacon now fires for **every** visitor, so both sides are counted over the same population, and
engagement moved onto its own boolean.

**Rules:**

- **Absent means engaged.** Rows written before this field existed were only ever written for
  engaged visitors, so `{ buildInteracted: { $ne: false } }` (not `: true`) keeps history
  comparable. The route, the recorder and the repository all apply the same default.
- **Never re-derive it from the counters.** `toolboxSwitches`/`toolsetSwitches` count REEL touches
  only; cash is a toggle, so a cash-only visitor is legitimately `0/0` and still engaged (F-010).
- `getAggregatedByPage.builds` gates on this flag (it means "engaged visitors", which is what the
  admin **Builds** column and the "never touched the reels" question need).
  `getAggregatedByBuiltPrize.builders` deliberately does **not** — it must stay on the same
  population as `signups`.
