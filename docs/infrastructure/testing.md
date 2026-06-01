# Infrastructure — Testing

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

## npm test scripts

New test scripts added to `package.json` follow the `test:<scope>` convention and can be run independently:

```bash
npm run test:past-due-history       # pure aggregation helpers (no env vars needed)
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
| `npx tsx scripts/fix-major-draw-renewal-entries.ts` (`--apply` for live) | `scripts/fix-major-draw-renewal-entries.ts` | **DRY-RUN by default.** Backfills membership renewals that failed to credit the active `MajorDraw` (the swallowed-`addToMajorDraw` bug). Authoritative basis: live draw membership vs the member's latest in-window membership `BenefitsGranted` `data.entries` (NOT `lastMonthAccumulatedEntries`, which drifts ahead). Confirmed victim = latest renewal has empty `drawGrants` + active sub + renewal not refunded + draw < grant. Credits `grant − current`, back-fills the empty `drawGrants`, idempotent (re-reads before writing). Writes a plan CSV to `temp/readonly/`. |
| `npm run verify:major-draw-entries` (`:dry` for console-only) | `scripts/verify-major-draw-entries.ts` | read-only entry & multiplier audit for the active `MajorDraw`. For every participant: replays the `PaymentEvent` ledger (`drawGrants`) against live `entriesBySource` (catches missing/double/dropped entries), checks `sum(entriesBySource) == totalEntries`, and reconstructs the **applied vs scheduled-grid multiplier per purchase date** — replaying one-time rules (own one-time grid → else derived 10→5/5→3; member-only one-time bought by a member → membership grid). Resolves the grid *as of the purchase moment* (incl. soft-deleted phases) so retroactively-painted days aren't false-flagged. Writes two CSVs to `temp/readonly/`. Flags: `MULTIPLIER_MISMATCH` (grid existed, wrong mult), `NO_GRID_AT_PURCHASE` (bought before the day's grid was painted), `LEDGER_VS_LIVE`, `INTERNAL_INCONSISTENT`. Options: `--drawId`, `--userId`, `--email`, `--limit`, `--dump-grid`, `--dry-run`, `--verbose`. |

Run against production only from a secure machine with `.env.local` set up. The `find:stuck-paused-users` script is a pre-requisite for the Force Charge rollout checklist.

## What's NOT well tested

- Cron endpoint auth thoroughness
- Cloudinary signing edge cases
- Env validation across all consumers
