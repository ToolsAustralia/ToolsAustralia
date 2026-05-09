# Affiliate — Patterns

## Site-wide interaction smoothness — Phase 5B (2026-05-10)

`affiliate/login/page.tsx` shipped its background, logo, and card-overlay `<Image fill>` elements without `sizes` hints. Phase 5B added accurate hints (`(max-width: 640px) 40px, 50px` for the small profile mark; `(max-width: 1024px) 100vw, calc(100vw - 591px)` for the right-column background; `(max-width: 640px) 150px, (max-width: 1024px) 200px, 276px` for the card overlay). Markup only.

## P1. Reverser pattern for commission refunds

`reverse-commission.ts` plugs into the `src/utils/payment/reversers/` pipeline. Same pattern as redeemables, draws, promo bonuses.

## P2. Per-cycle commission writes for recurring

Each renewal cycle is its own commission write (separate row per cycle). Don't try to update a single "running total" — append-only is auditable and refund-safe.

## P3. Backfill scripts for historical data

When introducing a new commission rule retroactively, backfill via a script under `scripts/backfill-*.ts`. Don't try to do it in-app on next-payment.

## P4. Separate auth surface

Affiliate portal has its own auth context. Two distinct user systems sharing a Mongo instance — don't try to reconcile until there's a strong reason.
