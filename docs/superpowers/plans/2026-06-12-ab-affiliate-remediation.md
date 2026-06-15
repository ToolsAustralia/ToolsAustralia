# Remediation Plan — A/B Measurement Redesign + Affiliate Attribution Correctness

**Date:** 2026-06-12 · **Branch:** feature/ui-audit · **Status:** awaiting review (no code written yet)

**Goal (one line):** Replace the A/B testing measurement layer's "reconstruct results from ephemeral events" model with a durable, user-level, conversion-window measurement model + peeking-safe Bayesian stats, and make affiliate commissions reverse and attribute correctly across every purchase type — fixing root causes, not symptoms.

---

## Guiding principles (why this is not a bandaid)

1. **Durable source-of-truth, recomputable caches.** `VariantAssignment` (exposure) and `PaymentEvent` (revenue) are durable and never TTL'd; the exact metrics (conversion, revenue) are recomputed from them for any date range. `ExperimentEvent` (page_view/click) stays ephemeral but feeds only diagnostic engagement volume, rolled into a durable, self-healing cache.
2. **The analysis unit is the USER, measured within a conversion window after first exposure** — not the event. (GrowthBook/Eppo/Statsig standard.)
3. **Attribution follows the EXPOSURE** (the variant the user was assigned to), not whatever variant got stamped on a later payment.
4. **Statistics are user-level and peeking-safe** (Bayesian chance-to-win), with the designated `isControl` as baseline and all variants handled.
5. **Affiliate commissions link to a stable payment identifier** and reverse by the identifier set the refund event carries — uniformly across all commission types.

---

## Decisions — RESOLVED 2026-06-12

| # | Decision | Resolution |
|---|---|---|
| Engine | Statistics engine | **Bayesian chance-to-win** (swappable module) |
| D1 | Conversion-window length | **14 days** post-exposure |
| D2 | Commission base GST treatment | **Keep GST-inclusive** (30% of price charged; no payout change) |
| D3 | Affiliate commission on **shop** orders | **Deferred** — shop is a separate feature not yet fully live. Do NOT build affiliate-shop now; **leave a `TODO`/note** in the affiliate docs + commission-processing so the question is re-prompted once shop ships. (Affiliate Phase 6 A4 = note-only, no shop commission code.) |
| D4 | Historical reconciliation | **Read-only audit first, then reviewed dry-run-default backfill** (pay the ~5 missed, claw back the 1 over-paid) |
| D5 | Long experiments vs `VariantAssignment` 180-day TTL | **Extend the assignment TTL** so long experiments keep a complete denominator |

---

## WORKSTREAM 1 — A/B testing measurement redesign

### Phase 1 — Durable, correct metric core (eliminates C1, H1, H2, H3, M2, M3, M5; C2 denominator)

**New:** `src/services/ab-testing/ExperimentMetricsService.ts` — the single source of per-variant metrics.
- `getExposedUsers(experimentId, variantId, range?)` → distinct identities from **`VariantAssignment`** (durable). Preview and admin are *inherently excluded* because the assign route never creates a `VariantAssignment` for admins or preview loads (verified) — this kills M1 for the metrics that matter, for free.
- `getConversionAndRevenue(experimentId, variantId, window)` → for each assignment, join the buyer's identity (`userId`, post-merge) to **net `BenefitsGranted` PaymentEvents** within `[assignedAt, assignedAt + window]`:
  - **Conversion (binary):** user has ≥1 qualifying first-purchase in window → converted. Denominator = exposed users. (Fixes C2 denominator, M5 — unique users come from the assignment table, not events.)
  - **First-purchase revenue (the experiment metric):** sum net `data.price` where `billingReason ∈ {subscription_create, one-time, upsell, mini-draw, manual}` (NOT `subscription_cycle`), **per-user**, then **percentile-capped** (winsorized). (Fixes H1.)
  - **Recurring revenue (separate line):** `subscription_cycle` within a longer/none window, reported separately, never folded into the conversion metric. (Implements your renewal-separation requirement.)
  - **Attribution by exposure variant**, not the PaymentEvent's stamped `variantId`. (Fixes H2.)
- **New:** `src/utils/payment/payment-event-net-queries.ts` → add `aggregateNetRevenueForExperiment(...)` that nets **partial refunds proportionally** (`RefundPartial` + `RefundProcessed`). Do **not** mutate the existing all-or-nothing function (admin "total spent" depends on it) — add a new one. (Fixes M2.)

**Repository:** `src/repositories/ab-testing/VariantAssignmentRepository.ts` → add distinct-exposed-users + assignment-join helpers.
**Layering:** all logic in the service/repo/util; routes stay thin.
**Tests:** `test:experiment-metrics` (new tsx) — window boundaries, renewal exclusion, partial-refund netting, per-user capping, attribution-by-exposure with a payment stamped to the wrong variant.

### Phase 2 — Correct, peeking-safe statistics (eliminates C2 stats + wrong-control + 3+ variants)

**New:** `src/utils/ab-testing/bayesian-test.ts` — Beta-Binomial conversion model: posterior `Beta(α₀+converters, β₀+(exposed−converters))` per variant; `P(variant > control)` (Monte-Carlo or closed form) + credible interval on lift. Revenue lift via bootstrap over per-user capped revenue. Baseline = the variant with `isControl=true`. For 3+ variants: each treatment vs control, each reported, with a documented decision threshold. Built behind a small interface so a future `sequential-test.ts` can swap in.
**Modify:** `src/services/ab-testing/ExperimentAnalyticsService.ts` — replace the event-count chi-square calls with the user-level Bayesian module; `getStatisticalSignificance`/`determineWinner` consume `(converters, exposed)` from Phase 1. Deprecate/retire `src/utils/ab-testing/statistical-tests.ts` (keep temporarily for any other caller; grep first).
**Tests:** `test:bayesian-test` — known-input chance-to-win, control selection by `isControl`, 3-variant handling, min-sample gate (no call below N conversions/arm).

### Phase 3 — Durable, self-healing engagement rollup + boundary-safe reads (eliminates H4, residual C1)

**Modify:** `src/app/api/cron/ab-testing-aggregate-metrics/route.ts`:
- **Auth gate** (verify Vercel cron header / `CRON_SECRET`) — currently open.
- **Self-healing catch-up:** aggregate every day in the last ~7 days that lacks (or has a stale) `ExperimentDailyMetrics` row, not just "yesterday." Idempotent `$set` upsert already supports re-runs.
- Keep TTL deletion but only for `page_view`/`click` events and only for days already rolled up; widen safety margin (TTL 35d > rollup window).
**Modify:** `src/repositories/ab-testing/ExperimentEventRepository.ts` — engagement reads (page_view/click volume) consult `ExperimentDailyMetrics` for **all** ranges incl. all-time (today it ignores daily metrics when no range is set → C1). Unique visitors no longer come from events at all (they come from `VariantAssignment` in Phase 1), so the `$max` path is deleted (H3 gone).
**Tests:** `test:experiment-rollup` — missed-day self-heal, all-time read = sum(daily)+recent, no boundary double-count.

### Phase 4 — Integrity, wiring, dashboard + Norm lockstep

- **Sticky integrity:** add unique indexes to `src/models/ab-testing/VariantAssignment.ts` on `(experimentId, userId)` and `(experimentId, anonymousId)` (partial). **Migration first:** `scripts/migrate-dedupe-variant-assignments.ts` (dry-run default) to collapse any pre-existing split-brain rows before the unique index builds, else index creation fails.
- **Merge integrity (M5):** verify `src/app/api/ab-testing/merge-user/route.ts` collapses anon+user assignments to one row per human per experiment (with the new unique index).
- **Dashboard:** `src/components/admin/ab-testing/ExperimentResultsDashboard.tsx` + `ExperimentDetailModal.tsx` — show user-level conversion, **separate first-purchase vs recurring revenue lines**, Bayesian "chance to win" + credible interval, and a min-sample/"keep running" state.
- **Admin + Norm lockstep (CLAUDE rule 10):** `src/app/api/admin/ab-testing/experiments/[id]/analytics/route.ts` and `.../winner/route.ts` response shapes change → mirror into `src/app/api/internal/norm/v1/ab-testing/experiments/[id]/{analytics,winner}/route.ts`, update `src/lib/internal-norm/schemas/*`, `classification.ts`, run `npm run build:norm-manifest`, update `docs/internal-norm/norm-context.md`, verify `npm run norm:smoke`.
**Tests:** `test:variant-assignment-uniqueness`; manual `norm:smoke`.

---

## WORKSTREAM 2 — Affiliate attribution correctness

### Phase 5 — Universal, stable-key refund reversal (A1, A2, A5)

- **Model:** `src/models/AffiliateCommission.ts` — ensure every row carries a normalized `stripePaymentIntentId` **and** `stripeInvoiceId` where available; recurring rows must also store the renewal invoice's PI (`invoice.payment_intent`).
- **Create paths:** `src/utils/affiliate/commission-processing.ts` (recurring) + `src/utils/affiliate/affiliate-attribution.ts` — stamp the invoice's PI on recurring commissions; normalize first-purchase PIs consistently.
- **Reverse:** `src/utils/affiliate/reverse-commission.ts` — match commissions on **any** of `{stripePaymentIntentId variants, stripeInvoiceId variants}` carried by the refund event (fixes recurring-never-reverses A1 + first-purchase normalization mismatch A2). On `RefundPartial`, **proportional clawback** instead of all-or-nothing (A5). On already-`paid` rows, raise an alert/`ErrorReport` instead of silently skipping (A5).
- **Caller:** `src/utils/payment/refund-processing.ts` — pass the full identifier set (PI + invoice + charge) to the reverser.
- **Backfill (read-only first):** `scripts/backfill-recurring-commission-pi.ts` (dry-run default) to stamp PI onto existing recurring rows so they become reversible.
**Tests:** `test:affiliate-reversal` — recurring refund reverses; first-purchase normalized-PI refund reverses; partial refund claws back proportionally; paid-row refund alerts.

### Phase 6 — Commission base consistency + coverage (A3, A4)

- **Base (A3):** `src/utils/payment/payment-processing.ts` commission calls use **amount actually charged net of discount** (not catalog list price); recurring already uses `amount_paid`. Apply the D2 GST decision in one place (`src/lib/affiliate.ts` `calculateCommission`).
- **Shop (A4):** per D3 — either add `shop-order` commission in `src/app/api/orders/route.ts` (delegating to a `processShopOrderCommission` in `commission-processing.ts`) **or** document the exclusion in BUSINESS.md.
**Tests:** `test:affiliate-commission-base` — discounted first invoice, GST handling, shop order (if included).

### Phase 7 — Root-cause + reconciliation (the prod findings)

- **Missed-commission trace:** extend the read-only probe to dump the 4 referred users' payment+commission timelines; identify cause (purchase-before-referral vs a webhook path that skips the processor). Fix the responsible path.
- **Mini-draw:** confirm `processMiniDrawPackageCommission` actually fires end-to-end (0 rows in prod); add a test if a gap is found.
- **Reconciliation:** `scripts/reconcile-affiliate-commissions.ts` (read-only audit → optional, reviewed, dry-run-default backfill) implementing D4 — pay the ~5 missed, claw back the 1 over-paid recurring.

---

## Cross-cutting tasks

- **`.env.example`** — add `PROD_MONGODB_URI` (documented read-only-prod convention) + a one-line note in `docs/infrastructure/`.
- **Docs (Domain Manifest):** `docs/ab-testing/` (architecture, backend, models, rules, gotchas, metrics-calculation), `docs/affiliate/`, `docs/admin/` (dashboard), `docs/internal-norm/norm-context.md`. Refresh the stale "January 2025" A/B docs to the new model.
- **README.md / BUSINESS.md** — touch if D3 (shop coverage) or any affiliate reward-structure fact changes (BUSINESS trigger).
- **package.json** — add each new `test:*` script.

## Manifest check
All new files fall under existing domains — `src/services|utils|repositories/ab-testing/**` → **ab-testing**; `src/utils/affiliate/**`, `src/models/AffiliateCommission.ts` → **affiliate**; `scripts/*` → **infrastructure**; dashboard → **admin**; Norm → **internal-norm**. **No new domain needed.** New test files need matching `test:*` entries (discoverability rule).

## Risks
- **Norm lockstep:** schema↔output mismatch is a runtime 500 invisible to `tsc` — must run `norm:smoke`.
- **Shared revenue query:** isolate experiment revenue in a new function so admin "total spent" is untouched.
- **Unique-index migration:** must dedupe split-brain `VariantAssignment` rows before the index builds.
- **Numbers will change:** historical experiment results shift to the (correct) user-level/windowed values; Bayesian output replaces chi-square — communicate, don't surprise.
- **Money:** the affiliate backfill pays/claws real money — dry-run default, explicit review, audit-logged.
- **GST/base change** reduces future commissions if ex-GST is chosen — finance sign-off (D2).

## Suggested sequencing
Phases 1→2→3→4 (A/B core first — kills all critical/high A/B findings), then 5→6→7 (affiliate). Each phase ships an independently verifiable win with its own tests. No commits without your authorization.
