# Affiliate — Patterns

## P1. Reverser pattern for commission refunds

`reverse-commission.ts` plugs into the `src/utils/payment/reversers/` pipeline. Same pattern as redeemables, draws, promo bonuses.

## P2. Per-cycle commission writes for recurring

Each renewal cycle is its own commission write (separate row per cycle). Don't try to update a single "running total" — append-only is auditable and refund-safe.

## P3. Backfill scripts for historical data

When introducing a new commission rule retroactively, backfill via a script under `scripts/backfill-*.ts`. Don't try to do it in-app on next-payment.

## P4. Separate auth surface

Affiliate portal has its own auth context. Two distinct user systems sharing a Mongo instance — don't try to reconcile until there's a strong reason.
