# Repeat-Purchase Analytics — per-one-time-package breakdown (rates-led)

- **Date:** 2026-07-10
- **Status:** Approved (design) — proceeding to plan + implementation
- **Primary domain:** `admin` (`docs/admin/`) — with `internal-norm` lockstep
- **Author:** DJ + Claude

## 1. Problem & self-assessment

The admin **Repeat Purchase Analytics** tab (`src/components/admin/RepeatPurchaseAnalytics.tsx`)
shows aggregate reconversion behaviour for one-time buyers — repeat rate, days-to-return
buckets, matured return windows, repeat revenue, became-members — but it **cannot tell you
which entry pack drives that behaviour.** Request: track which one-time package "has more
conversions."

**Is this actually useful, or vanity data that rots later?** (Explicitly assessed because the
ask was "ensure we are not adding data that later on will be irrelevant.")

- **Decision it drives (durable):** which entry pack to feature to new buyers, and which pack
  is a *dead-end funnel* (many buyers, near-zero return). That's a structural property of the
  funnel, not a transient number — it stays relevant as long as one-time packs are sold.
- **No data-rot risk:** the breakdown is **100 % derived on read** from `PaymentEvent` inside
  the existing shaper. Nothing is stored — no new collection, field, migration, or backfill.
  If a column proves useless it's deleted in minutes. So the cost here is *screen space*, not
  a long-term maintenance liability. This is the key reason the feature is safe to add.
- **The real risk is small samples, not staleness.** At prod scale (~2.4k one-time buyers /
  ~3k one-time events) repeat buyers are a minority, and split across ~4–5 packs the cheaper
  packs (Apprentice/Tradie) have trustworthy denominators while Foreman/Power/VIP may be
  single-digit — where one returner swings a "rate" 15+ points. **Mitigation:** always show
  the buyer-count denominator next to every rate and visually de-emphasise low-n rows so a
  thin row is never misread as signal.
- **Rates over gross revenue.** Repeat rate + became-member rate *per starting pack* are the
  decision metrics; gross-$-per-package is sales-mix context (weaker on this tab, which is
  about reconversion, not merchandising). So the UI leads with **rates**; revenue and counts
  are **secondary**.

Verdict: **worth building in the sharpened, rates-led, low-n-guarded form** — not as a
gross-revenue leaderboard.

## 2. Scope

**In:**
- A new read-only **"By one-time package"** card on the existing tab.
- Computed **inside the existing summary** (`getRepeatPurchaseSummary` → the pure shaper
  `summarizeRepeatPurchases`). **No new endpoint, no new DB read, no new hook.**
- **Norm mirror** kept in lockstep (aggregate-only, PII-safe).
- Unit-test coverage of the rollup + a sum invariant.

**Out (explicitly, to stay lean):**
- **Click-to-filter the Users table by package.** Nice drill-down, but it would thread a new
  `package` filter through the users route + export route + service + hook — real extra scope
  for a nice-to-have. Deferred; revisit if asked.
- Gross-$ as a headline. It stays in the data model + Norm for completeness ("show both"
  attribution) but is a **muted secondary column**, not the story.

## 3. Data model

Add to `src/types/admin/repeatPurchase.ts`:

```ts
export interface RepeatPackageBreakdown {
  packageId: string;
  packageName: string;
  // ── "Started with this pack" (anchor-grouped: buyers whose FIRST one-time pack was this) ──
  startedBuyers: number;        // denominator for the rates
  startedReturned: number;      // of those, how many bought again (≥2 purchases)
  startedRepeatRate: number;    // startedReturned / startedBuyers, 0–1 (0 when no buyers)
  startedBecameMembers: number; // of those, how many later started a membership
  startedMemberRate: number;    // startedBecameMembers / startedBuyers, 0–1
  startedRevenue: number;       // ALL one-time $ from those buyers (first + repeat) — "downstream"
  // ── "All purchases" (per-purchase gross: this pack, every time it was bought) ──
  purchases: number;            // count of purchase events of this pack in the cohort
  grossRevenue: number;         // AUD sum of those purchases
}
```

and `packages: RepeatPackageBreakdown[]` on `RepeatPurchaseSummary`.

**Computed in the pure shaper `summarizeRepeatPurchases`**, over the already-built `cohort`
(so it inherits the cohort definition — one-time buyers not active-member at first purchase —
and the anchor-date cohort filter, which re-runs the shaper over the kept users).

- **Grouping key** = `packageId || packageName || "unknown"` (both are optional on
  `PaymentEvent`); **display name** = `packageName || packageId || "Unknown"`.
- **Anchor group:** for each `acc` in `cohort`, key on `acc.purchases[0]` → `startedBuyers++`,
  `startedRevenue += acc.totalSpent`, `startedReturned += acc.purchases.length >= 2 ? 1 : 0`,
  `startedBecameMembers += becameMember ? 1 : 0` (reuse the flag already computed per buyer).
- **Per-purchase group:** for every purchase across the cohort, key on that purchase's own
  `packageId` → `purchases++`, `grossRevenue += price`.
- **Sort** rows by `startedBuyers` desc (most trustworthy + highest-impact packs first).
- Round money to cents, rates left as 0–1 (UI formats to %).

**Invariant (unit-tested):**
`Σ startedRevenue === Σ grossRevenue === total cohort one-time revenue` — every purchase is
counted exactly once each way. (Also: `Σ purchases === summary.totalPurchases`,
`Σ startedBuyers === summary.oneTimeBuyers`, `Σ startedReturned === summary.repeatBuyers`.)

## 4. Norm lockstep (internal-norm)

The summary is mirrored verbatim by `/v1/analytics/repeat-purchases`
(`NormRepeatPurchaseSummarySchema`). `ctx.ok` uses `safeParse` on a non-`.strict()` object, so
an un-mirrored extra key is *stripped* (no runtime 500) — but the lockstep rule still applies:

- Add `packages` to `NormRepeatPurchaseSummarySchema`
  (`src/lib/internal-norm/schemas/repeat-purchases.ts`). Aggregate-only, PII-safe: package
  name + counts + AUD + rates — no user identifiers.
- Update the **Returns** block in `docs/internal-norm/norm-context.md`.
- `npm run build:norm-manifest`, then verify with `npm run norm:smoke`.

## 5. UI

New `Card` titled **"By one-time package"**, placed **after** the two side-by-side cards and
**before** the Users table in `RepeatPurchaseAnalytics.tsx`. Reads `summary.packages` from the
query the component already loads — no new fetch.

Custom table (same raw-table pattern as the "How many came back within…" card, wrapped in
`overflow-x-auto`) with a **grouped header**:

| Package | **Started with this pack** → Buyers · Repeat rate · Became member · Downstream $ | **All purchases** → Purchases · Gross $ |
|---|---|---|

- **Rates are the bold headline** (repeat rate, member rate); each rate shows its
  count/denominator (e.g. `32 % (18 of 56)`). Revenue + purchase counts are **muted**.
- **Low-n guard:** rows with `startedBuyers < LOW_N` (constant, **15**) render muted with a
  small "small sample" affordance, so thin packs aren't misread. `LOW_N` is a UI constant
  (not stored/config — YAGNI).
- Empty state: "No one-time package activity in this range yet."
- No gambling/probability framing in any copy (legal rule #11); "conversion" here = repeat
  purchase / membership signup, both framed plainly.

## 6. Testing

Extend `src/services/admin/__tests__/repeatPurchaseAnalytics.test.ts` (run via
`npm run test:repeat-purchase`) with a multi-package cohort asserting, per package:
`startedBuyers`, `startedReturned`, `startedRepeatRate`, `startedBecameMembers`,
`startedMemberRate`, `startedRevenue`, `purchases`, `grossRevenue`; the **sum invariants** from
§3; and the `startedBuyers`-desc sort order. Include a buyer who *starts* with pack A then buys
pack B, to lock the two attribution directions apart.

## 7. Docs & rollout

- **Domain docs:** `docs/admin/` (backend/frontend/api, whichever the touched files map to) +
  `docs/internal-norm/norm-context.md`.
- **No BUSINESS.md / CUSTOMER.md change:** this is internal admin analytics; it flips no
  business fact (pricing/tiers/draw/billing) and no customer fact (data model/lifecycle/journey).
- **No commit** is made without explicit authorization (hard rule #1). This spec is written
  but left uncommitted until DJ says so.
