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
```

## Cleanup / backfill scripts

```bash
npm run cleanup:abandoned-incomplete:dry   # scan + plan only (no writes); add -- --older-than-hours=0 to include very recent subs
npm run cleanup:abandoned-incomplete       # LIVE: cancel abandoned incomplete subs, void open invoices, repair/clear stripeSubscriptionId pointers
```

Default window is subs older than 24 hours (normal `incomplete` subs self-expire after ~23h anyway; the real targets are trial+incomplete subs). Use `--older-than-hours=0` to sweep very recent ones. Always dry-run first.

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
| `npm run verify:major-draw-entries` (`:dry` for console-only) | `scripts/verify-major-draw-entries.ts` | read-only entry & multiplier audit for the active `MajorDraw`. For every participant: replays the `PaymentEvent` ledger (`drawGrants`) against live `entriesBySource` (catches missing/double/dropped entries), checks `sum(entriesBySource) == totalEntries`, and reconstructs the **applied vs scheduled-grid multiplier per purchase date** — replaying one-time rules (own one-time grid → else derived 10→5/5→3; member-only one-time bought by a member → membership grid). Resolves the grid *as of the purchase moment* (incl. soft-deleted phases) so retroactively-painted days aren't false-flagged. Writes two CSVs to `temp/readonly/`. Flags: `MULTIPLIER_MISMATCH` (grid existed, wrong mult), `NO_GRID_AT_PURCHASE` (bought before the day's grid was painted), `LEDGER_VS_LIVE`, `INTERNAL_INCONSISTENT`. Options: `--drawId`, `--userId`, `--email`, `--limit`, `--dump-grid`, `--dry-run`, `--verbose`. |

Run against production only from a secure machine with `.env.local` set up. The `find:stuck-paused-users` script is a pre-requisite for the Force Charge rollout checklist.

## What's NOT well tested

- Cron endpoint auth thoroughness
- Cloudinary signing edge cases
- Env validation across all consumers
