# Infrastructure — Testing

> `test:climb-series` (`tsx src/utils/membership/__tests__/climb-series.test.ts`) covers the `/membership` climb-chart accumulation math (`buildClimbSeries`).

## Pure unit tests are `tsx` scripts wired as `test:<scope>`

There is no jest/vitest — each test is a standalone `tsx` script under `src/**/__tests__/*.test.ts` that throws on failure, registered as a `test:<scope>` entry in `package.json` (without the entry it's undiscoverable). Keep tests pure (no live DB/Stripe/network) by injecting side effects: e.g. `npm run test:promo-visit` exercises `recordPromoVisit` with stubbed `hasRecentVisit`/`recordVisit` deps. See `.claude/skills/writing-tsx-test`.

## Health check

```bash
curl http://localhost:3000/api/health
```

Should return 200 with simple JSON status.

## Cron simulation

```bash
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/major-draw-transition
```

## Migration dry-run

```bash
npm run migrate:<name>:dry
```

### Targeting production from ops scripts (`--prod`)

The A/B / affiliate ops scripts (`migrate-dedupe-variant-assignments`,
`reconcile-affiliate-commissions`, `seed-static-vs-video-hero-experiment`) share
[`scripts/connect-ops-db.ts`](../../scripts/connect-ops-db.ts). By default they
connect to your local/dev `MONGODB_URI`. Pass **`--prod`** (or use the `:prod`
npm variants) to connect to **`PROD_MONGODB_URI`** instead — the helper forces the
`Production` database (the prod Atlas string has no `/db` path, so a bare connect
would silently hit an empty `test` DB) and rewrites `MONGODB_URI` up-front so
services that call `connectDB()` internally (e.g. `recordAffiliateCommission`) use
prod uniformly. Every run prints `PROD|local · db="…" @ host`; a prod run adds a
"Targeting PRODUCTION" warning. **Always dry-run against prod first.**

### A/B sticky-assignment dedupe (run before deploying the unique index)

`scripts/migrate-dedupe-variant-assignments.ts` collapses duplicate
`VariantAssignment` rows (same identity per experiment → keep earliest, delete
rest) so the new `uniq_experiment_user` / `uniq_experiment_anon` unique indexes
can build, then builds them. **Dry-run by default**; flags split-brain groups
(same identity bucketed into >1 variant). Must run **before** deploying the
`VariantAssignment` model change, or the prod index build silently fails.

```bash
npm run migrate:dedupe-variant-assignments:dry        # dev: report only, no writes
npm run migrate:dedupe-variant-assignments            # dev: delete dups + build unique indexes
npm run migrate:dedupe-variant-assignments:prod:dry   # PROD: report only
npm run migrate:dedupe-variant-assignments:prod       # PROD: delete dups + build indexes
```

### A/B seed: static-image-vs-video hero experiment

`scripts/seed-static-vs-video-hero-experiment.ts` creates a **draft** experiment
+ two 50/50 variants (`Video` control / `Static image` treatment via
`hero.disableVideo`) across the 16 brand landing slugs. Idempotent; activate in
admin → A/B Testing.

```bash
npm run seed:static-vs-video-hero:dry        # dev: preview, no writes
npm run seed:static-vs-video-hero            # dev: create the draft experiment
npm run seed:static-vs-video-hero:prod:dry   # PROD: preview
npm run seed:static-vs-video-hero:prod       # PROD: create the draft experiment
```

### A/B seed: promo package-design experiment

`scripts/seed-promo-packages-design-experiment.ts` creates and **immediately activates** the promo package-design A/B experiment across every prize slug (both dynamic `[slug]` prize pages and toolset/brand pages). This is an **authorized deviation** from the standard seed pattern — other seeds create a `draft`; this one goes straight to `active` because the experiment is designed to run immediately.

```bash
npm run seed:promo-packages-design:dry   # preview — prints the plan; creates nothing
npm run seed:promo-packages-design       # activate the experiment (dev/local)
# :prod variants not applicable — seed targets the connected DB (use --prod flag via connect-ops-db.ts pattern if needed)
```

**Idempotent and dry-run-default-safe.** The `:dry` variant is the safe preview step; run it first.

**Overlap guard:** the seed refuses to activate if another active experiment already targets any of the slug targets. Override with `-- --force-overlap`. See [docs/ab-testing/promo-packages-design-runbook.md](../ab-testing/promo-packages-design-runbook.md) for full details.

**Cleanup / re-seed:** `scripts/cleanup-promo-packages-design-experiment.ts` deletes the experiment and ALL its collected data (Variant, VariantAssignment, ExperimentEvent, ExperimentDailyMetrics, ExperimentHistory, then the Experiment doc) so it can be re-seeded fresh — used when a run collected data against a buggy build. It **leaves `PaymentEvent` stamps untouched** (financial records; the re-seed creates a new experiment `_id`, so stale stamps can't pollute the new metrics). **Dry-run by default** (destructive → opt-in), prints the resolved `_id` for a prod-vs-dev safety check, and refuses if 0 or >1 experiments match the name.

```bash
npm run cleanup:promo-packages-design         # DRY RUN — counts + resolved _id, no writes
npm run cleanup:promo-packages-design:apply   # execute the deletes
# then: npm run seed:promo-packages-design     # re-seed a fresh experiment
```

### Affiliate commission reconciliation (safety net)

The shared core [`reconcileAffiliateCommissions()`](../../src/utils/affiliate/reconcile-commissions.ts)
is the durable backstop for the fire-and-forget commission dispatch: it reconciles
**every** commission type (one-time / upsell / mini-draw / membership-first /
membership-recurring) from the durable `PaymentEvent` ledger, reports gaps + over-paid
commissions on refunded payments, and (with `apply`) backfills the missing rows
idempotently via `recordAffiliateCommission` (correct per-affiliate rate, `$inc` only
on a real insert). It runs two ways from the **same core**:

- **Daily cron** [`/api/cron/reconcile-affiliate-commissions`](../../src/app/api/cron/reconcile-affiliate-commissions/route.ts)
  (auth-gated, **35-day trailing window**, auto-backfill) — self-healing, no manual
  step. Over-paid rows are flagged via `console.error` for manual review (clawback is
  a separate deferred workstream — see `docs/affiliate/gotchas.md`).
- **CLI** `scripts/reconcile-affiliate-commissions.ts` — read-only by default, writes a
  CSV audit to `temp/readonly/`; `--since-days=N` bounds the scan (default = full sweep).
  **Review the CSV before applying.**

```bash
npm run reconcile:affiliate-commissions:dry        # dev: audit + CSV, no writes (exit 2 if gaps)
npm run reconcile:affiliate-commissions            # dev: create the missing commissions
npm run reconcile:affiliate-commissions:prod:dry   # PROD: audit + CSV, no writes
npm run reconcile:affiliate-commissions:prod       # PROD: create the missing commissions
# add e.g. -- --since-days=35 to bound the scan to a trailing window
```

### Affiliate commission dedup-index migration (sparse → partial)

`scripts/migrate-affiliate-commission-pi-index.ts` drops the **legacy `sparse`
unique** dedup indexes on `affiliatecommissions` and lets `syncIndexes()` rebuild
them as **partial** unique indexes from the schema. Required because a *compound*
`sparse` index still indexes a row when **any** key is present (and `affiliateId`
always is), so rows missing the optional id were indexed with that id as `null` and
collided — capping a referred user at **one** such commission. Two indexes were
affected: the PI key (`stripePaymentIntentId`, fixed 2026-01) and the invoice key
(`stripeInvoiceId`, fixed 2026-06 — this had been silently blocking the reconcile
backfill from creating a user's 2nd+ one-time/upsell/mini-draw commission with
`dup key { stripeInvoiceId: null }`). See [docs/affiliate/models.md](../affiliate/models.md).
Run this **before** the reconcile backfill on a DB that still has the legacy index.

```bash
npm run migrate:affiliate-commission-pi-index:dry        # dev: report, no drops
npm run migrate:affiliate-commission-pi-index            # dev: drop legacy + rebuild partial
npm run migrate:affiliate-commission-pi-index:dry -- --prod   # PROD: report
npm run migrate:affiliate-commission-pi-index -- --prod       # PROD: drop legacy + rebuild partial
```

## npm test scripts

New test scripts added to `package.json` follow the `test:<scope>` convention and can be run independently:

```bash
npm run test:past-due-history       # pure aggregation helpers (no env vars needed)
npm run test:past-due-idempotency-keys  # Stripe idempotency-key builders: bulk key differs across runs (the 2026-06-29 replay guard); one-off key dedupes concurrent submits within a 30s bucket
npm run test:merge-ad-channels      # pure ad-channel merge — preserves prior spend on a failed/expired-token fetch (no DB)
npm run test:cancellation-upsell    # smoke-renders CancellationUpsellModal in 12 prop combos
npm run test:refer-friend           # smoke-renders ReferFriendModal in 3 open + 1 closed combos
npm run test:upgrade-confirm        # smoke-renders UpgradeConfirmModal (3 tiers + full props + closed)
npm run test:downgrade-confirm      # smoke-renders DowngradeConfirmModal
npm run test:renewal-failed         # smoke-renders RenewalFailedModal (open + closed)
npm run test:ui-primitives          # Button, Badge, Card primitives
npm run test:upsell-shell           # UpsellHero, InfoGrid, UrgencyBanner, TrustBar primitives
npm run test:cancellation-flow-hook # pure step-machine reducer (offerPhaseFor/nextOfferState) — locks the cursor-driven OFFER phase incl. the 3-rung `other` waterfall
npm run test:capi-userdata          # Meta CAPI mirror: stripEmpty drops blank PII; guest userData reaches FB CAPI SHA-256-hashed into em/ph/fn/ln
npm run test:find-recoverable-subscription # guard re-validates each listed sub's real .status (Stripe list({status:"trialing"}) leaks incomplete subs)
npm run test:cancel-incomplete-subscription # helper only cancels real `incomplete` subs, voids only `open` invoices, best-effort on errors, idempotent
npm run test:http-rejection-severity # pure classifier: 5xx→high, coded 4xx→medium, skip <400/401/403/404/429/codeless-4xx
npm run test:klaviyo-canonical       # fences canonical property names for new Klaviyo events (added 2026-05-28). Fails when new event drifts to legacy aliases (package_tier/amount/purchase_date/etc.). See docs/tracking/KLAVIYO_INTEGRATION.md "Canonical property names".
npm run test:anchor-billing          # date math for both join-anchor and past-due reanchor: clamp 25/26/27→24, short-month last-day clamping, DST boundaries, year rollover, same-day roll, future-floor, invalid input.
npm run test:reanchor-gate           # trigger predicate for past-due reanchor: signal isolation (past_due DB status / pause_collection present / attempt_count>1), all exclusion arms (cancel_at_period_end, autoRenew=false, pauseReason=retention, already-reanchored).
npm run test:trial-invoice           # isZeroAmountTrialUpdateInvoice guard: skips Stripe's $0 'Trial period' subscription_update invoice (stops double-granting entries); real cycle/create/upgrade(>0)/100%-off-cycle still grant.
npm run test:zero-trial-guard        # webhook-LEVEL regression: handleInvoicePaymentSucceeded HONORS the guard. Mocks stripe.invoices.retrieve, spies on User.findOne (the guard returns before the user lookup). Asserts the $0 subscription_update invoice short-circuits (User.findOne NOT reached, no BenefitsGranted row) while a real subscription_cycle renewal AND a paid (>0) subscription_update upgrade both proceed. Catches a regression where the guard is removed/widened/bypassed — which the predicate unit test alone cannot. Needs MONGODB_URI (the handler connectDB()s before the user lookup).
npm run test:mer                     # pure computeDrawMerRow: blended New Revenue = Σ newRevenue across ALL platforms incl. direct; blended Ad Spend = Σ ad-channel spend; MER = revenue/spend (null when no spend); Meta→amount+MER, TikTok→awaiting+null MER (the spend gap), Klaviyo/Direct→owned; NaN/missing coerce to 0. No env needed. See docs/admin/mer-table.md.
npm run test:platform-revenue-breakdown # covers the per-platform acquisition-revenue-by-category breakdown service (src/services/admin/__tests__/platformRevenueBreakdown.test.ts) backing /api/admin/dashboard/revenue-details/by-platform (the per-platform drill-down hover/expand).
npm run test:landing-draw-day-urgency # pure unit test for the landing draw-day urgency resolver (src/utils/promo/__tests__/landing-draw-day-urgency.test.ts). No DB/env needed.
npm run test:reconcile-attribution   # pure reconciler (src/services/attribution/__tests__/reconcilePersistedAttribution.test.ts): when the cookie-only edge decision is `direct`/absent, recovers an OWNED-channel (klaviyo_email/sms) platform from the persisted signup UTM so Klaviyo conversions aren't buried in `direct`; paid sources are never resurrected. Locks the live path to the same logic as scripts/backfill-klaviyo-attribution-cycle.ts. No DB/env needed.
```

## QA seed: past-due member for reanchor recovery testing

`scripts/seed-past-due-member.ts` creates (or reuses) a MongoDB user and a set of Stripe test-mode
objects in a ready-to-recover `past_due` state so a human can log in and exercise every recovery
channel of the Past-Due Reanchor feature (admin charge-past-due, force-charge, user renew-subscription
retry, and user pay-failed-invoice) without waiting 30+ days for a real renewal to fail.

The script uses a Stripe Test Clock so the entire dunning cycle (~30 days) completes in seconds.
It refuses any key not starting with `sk_test_`, tags every Stripe object with
`metadata: { seed_past_due_reanchor: "1" }` for safe cleanup, and never touches production.

```bash
# Always dry-run first — validate env + print the plan, create nothing
npm run seed:past-due-member:dry -- --email=qa-reanchor@example.com

# Live seed (creates Stripe test objects + MongoDB user, advances clock, leaves member in past_due)
npm run seed:past-due-member -- --email=qa-reanchor@example.com

# Optional overrides
npm run seed:past-due-member -- --email=qa-reanchor@example.com --password=MyPass1! --package=foreman-subscription

# Cleanup (deletes test clock + customer + user if firstName=QA, lastName=Reanchor)
npm run seed:past-due-member -- --cleanup --email=qa-reanchor@example.com
```

Prerequisite: run the Stripe webhook listener so `invoice.payment_succeeded` reaches the app:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

After seeding, log in with the printed credentials and test each recovery channel. After each
channel test, verify that `User.subscription.endDate` moved to the new anchor day,
`lastReanchoredInvoiceId` is set, a `MembershipStatusHistory` row with
`source: "webhook_past_due_reanchor"` exists, the Stripe sub status is `trialing`, and the
Klaviyo `next_renewal_date` property was updated.

## Stripe test-mode probe: past-due reanchor

`scripts/stripe-probe-reanchor.ts` confirms — against the **live Stripe API in test mode** — the behaviours the past-due reanchor feature assumes before the behaviour flip merges to main (design spec §9 / `docs/PAST_DUE_REANCHOR.md`). It refuses any key not starting with `sk_test_`, creates throwaway test objects, and deletes them afterwards. Reuses the real `getReanchorTrialEndTimestamp` helper so the date math is validated end-to-end against Stripe.

```bash
npm run stripe:probe-reanchor:dry          # validate the test key + print the plan; create nothing
npm run stripe:probe-reanchor              # Part A: trial_end behaviour on an active, just-paid sub
npx tsx scripts/stripe-probe-reanchor.ts --full   # Part A + Part B (real past_due→recovery via a Test Clock)
npx tsx scripts/stripe-probe-reanchor.ts --full --keep  # leave test objects for dashboard inspection
```

Asserts: A1 no new charge after the `trial_end` update, A2 `status==='trialing'` & `items[0].current_period_end===trial_end`, A3 the paid invoice stays paid, A4 (`--full`) the recovery invoice carries `billing_reason==='subscription_cycle'` & `attempt_count>1`, A5 (`--full`) the clear-pause-then-set-`trial_end` ordering succeeds. Exits non-zero if any assertion fails.

## Cleanup / backfill scripts

```bash
npm run cleanup:abandoned-incomplete:dry   # scan + plan only (no writes); add -- --older-than-hours=0 to include very recent subs
npm run cleanup:abandoned-incomplete       # LIVE: cancel abandoned incomplete subs, void open invoices, repair/clear stripeSubscriptionId pointers

npm run backfill:klaviyo-membership-properties:dry  # compute + sample 10 users; no Klaviyo writes
npm run backfill:klaviyo-membership-properties      # LIVE: re-upsert every active user to backfill 5 new canonical profile properties (membership_status, entries_purchased, giveaways_entered, membership_active_duration_months, next_renewal_date) — see docs/tracking/KLAVIYO_INTEGRATION.md "Profile properties added 2026-05-28"
```

Default window is subs older than 24 hours (normal `incomplete` subs self-expire after ~23h anyway; the real targets are trial+incomplete subs). Use `--older-than-hours=0` to sweep very recent ones. Always dry-run first.

The Klaviyo membership-properties backfill is idempotent (upserts by email) — safe to re-run. At the default 100ms throttle the runtime is roughly `active_user_count / 10` seconds. Run after Phase 2 deploys so the ads team's new segments work from day 1; existing users would otherwise only get the properties on their next webhook event (cancellation, renewal, purchase, etc.).

- `npm run test:variant-config-membership-theme` — standalone `tsx` unit test
  for `VariantConfig.membershipTheme.forceLight` default/merge/validation
  (A/B membership dark-mode test).
- `npm run test:experiment-metrics` — pure unit test for the A/B measurement
  core (`src/utils/ab-testing/experiment-metrics-core.ts`): user-level conversion
  + revenue, 14-day conversion window, renewal-as-separate-line, partial/full
  refund netting, per-user winsorization, and attribution by the user's *assigned*
  variant (not the payment's stamped one). No DB/env needed. See
  `docs/ab-testing/backend.md` "Measurement core v2".
- `npm run test:bayesian` — pure unit test for the Bayesian chance-to-win engine
  (`src/utils/ab-testing/bayesian-test.ts`): Beta-Binomial posteriors, deterministic
  numerical `P(variant>control)`, `isControl` baseline, 3+ variant handling,
  min-sample noise gate, and ship/keep recommendations. No DB/env needed. See
  `docs/ab-testing/backend.md` "Statistics engine v2".
- `npm run test:affiliate-reversal` — pure unit test for `buildCommissionReversalIds`
  (`src/utils/affiliate/reverse-commission.ts`): proves a refund's (paymentIntentId,
  invoiceId) matches every commission storage form — raw `pi_…` (one-time/upsell/
  mini-draw), normalized `invoice_in_…` (membership-first), and `stripeInvoiceId`
  (membership-recurring). Guards the fix for the refunded-renewal commission leak.
  No DB/env needed. See `docs/affiliate/gotchas.md`.

## Dashboard stats snapshot scripts

| npm script | purpose |
|---|---|
| `npm run backfill:dashboard-stats-snapshots:dry` | Dry-run backfill — prints dates that would be written |
| `npm run backfill:dashboard-stats-snapshots -- --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD` | Live backfill for a specific range |
| `npm run verify:dashboard-stats-drift -- --samples=30` | Samples N snapshot dates, re-aggregates live, exits non-zero on drift |

Both scripts load `.env.local` and require `MONGODB_URI`.

## Diagnostic find scripts

| npm script | file | covers |
|---|---|---|
| `npm run find:stuck-paused-users` | `scripts/find-stuck-paused-users.ts` | queries MongoDB for `past_due` users whose Stripe sub has no chargeable invoice; outputs CSV to stdout, progress to stderr; supports `--limit=N` and `--include-orphans` |
| `npm run find:duplicate-subscriptions` | `scripts/find-duplicate-stripe-subscriptions.ts` | finds users with multiple active Stripe subscriptions |
| `npm run find:radar-lists` | `scripts/find-radar-value-lists.ts` | lists Stripe Radar value lists |
| `npm run find:duplicate-trial-entry-grants` | `scripts/find-duplicate-trial-entry-grants.ts` | **READ-ONLY.** Lists membership entry-grants double-granted by Stripe's $0 "Trial period" `subscription_update` invoice (see `docs/PAST_DUE_REANCHOR.md` gotcha). A "confirmed duplicate" has a sibling real grant (`subscription_cycle`/`subscription_create`) within ±1 day; standalone update-grants are listed separately and NOT counted. |
| `npm run reverse:duplicate-trial-entry-grants:dry` (drop `:dry` + add `--apply` for live) | `scripts/reverse-duplicate-trial-entry-grants.ts` | **DRY-RUN by default.** Reverses the confirmed `$0`-trial duplicates the find script lists. Flags: `--all` / `--userId=` / `--email=`, `--since=YYYY-MM-DD` (default 2026-01-01), `--include-points` (off by default). Per clean dup: scoped `removeMajorDrawEntries(userId, N, 'membership', drawId)` (drawId from the ledger), `$inc accumulatedEntries −data.entries`, SETs `lastMonthAccumulatedEntries` to the **real sibling renewal's `data.entries`** (only when it's the latest cycle — corrects the compounding baseline; decrement-by-delta is wrong in the concurrent case), writes a `BenefitsReversed` marker **first** as an atomic idempotency claim (unique `{paymentIntentId,eventType}` index), then `$pull`s the invoice from `processedPayments` and DELETEs the spurious `BenefitsGranted` event (clears the bogus "Subscribed to X" activity row). **Anomalous** dups (`data.entries` exceeds scoped `drawGrants` — e.g. empty ledger) and **standalone** update-grants are FLAGGED, never auto-reversed. Never touches Stripe / `subscription.isActive`/`autoRenew`/`endDate` / `Winner` / `TicketEntry`. |
| `npx tsx scripts/fix-major-draw-renewal-entries.ts` (`--apply` for live) | `scripts/fix-major-draw-renewal-entries.ts` | **DRY-RUN by default.** Backfills membership renewals that failed to credit the active `MajorDraw` (the swallowed-`addToMajorDraw` bug). Authoritative basis: live draw membership vs the member's latest in-window membership `BenefitsGranted` `data.entries` (NOT `lastMonthAccumulatedEntries`, which drifts ahead). Confirmed victim = latest renewal has empty `drawGrants` + active sub + renewal not refunded + draw < grant. Credits `grant − current`, back-fills the empty `drawGrants`, idempotent (re-reads before writing). Writes a plan CSV to `temp/readonly/`. |
| `npm run verify:major-draw-entries` (`:dry` for console-only) | `scripts/verify-major-draw-entries.ts` | read-only entry & multiplier audit for the active `MajorDraw`. For every participant: replays the `PaymentEvent` ledger (`drawGrants`) against live `entriesBySource` (catches missing/double/dropped entries), checks `sum(entriesBySource) == totalEntries`, and reconstructs the **applied vs scheduled-grid multiplier per purchase date** — replaying one-time rules (own one-time grid → else derived 10→5/5→3; Additional one-time bought by a member → membership grid). Resolves the grid *as of the purchase moment* (incl. soft-deleted phases) so retroactively-painted days aren't false-flagged. Writes two CSVs to `temp/readonly/`. Flags: `MULTIPLIER_MISMATCH` (grid existed, wrong mult), `NO_GRID_AT_PURCHASE` (bought before the day's grid was painted), `LEDGER_VS_LIVE`, `INTERNAL_INCONSISTENT`. Options: `--drawId`, `--userId`, `--email`, `--limit`, `--dump-grid`, `--dry-run`, `--verbose`. |

Run against production only from a secure machine with `.env.local` set up. The `find:stuck-paused-users` script is a pre-requisite for the Force Charge rollout checklist.

## What's NOT well tested

- Cron endpoint auth thoroughness
- Cloudinary signing edge cases
- Env validation across all consumers
