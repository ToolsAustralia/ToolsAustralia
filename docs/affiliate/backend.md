# Affiliate — Backend

## Lib

| File | Purpose |
|---|---|
| [src/lib/affiliate.ts](../../src/lib/affiliate.ts) | Core helpers (resolve affiliate, attribution write, etc.) |
| [src/lib/affiliate-auth.ts](../../src/lib/affiliate-auth.ts) | Affiliate-portal session management |

## Utilities

See [architecture.md](./architecture.md) for the [src/utils/affiliate/](../../src/utils/affiliate/) inventory.

## Refund integration

`reverse-commission.ts` is invoked by the [payment](../payment/) reverser orchestration when a payment that contributed to a commission gets refunded.

## Recurring commissions

`affiliate-recurring-invoice.ts` processes each renewal invoice for affiliated subscribers. Trigger: webhook `invoice.payment_succeeded` for `subscription_cycle`. Writes a new `AffiliateCommission` row per cycle.

## Payouts

`payout-processing.ts` aggregates eligible commissions (status: paid, no reversal pending) into an `AffiliatePayout` row. Run as a periodic admin job. _TODO: confirm cadence._
