# Affiliate — Gotchas

## Recurring-commission "skip" logs are info, not error

`processMembershipRecurringCommission` (`src/utils/affiliate/commission-processing.ts`) logs its skip paths. The **expected** skips — `zero_amount`, `no_affiliate` (most members aren't referred — high volume), `not_membership_tied` — use `console.log` (info), because in prod only `console.error` survives and these would otherwise flood the production error log with normal business-as-usual. The two genuine anomalies — `no_user` (invoice references a missing user) and `record_failed` (`recordAffiliateCommission` returned falsy) — stay `console.error`. Don't "promote" the expected skips back to error.

## First-touch attribution is sticky

Once a user is attributed to an affiliate at signup, they stay attributed. A later visit through a different affiliate's link doesn't override. Some affiliates may not understand this — document for partner support.

## Recurring chains span months

Recurring commissions write a new row per renewal — over a year, a single subscriber can have 12+ rows. Aggregation queries should be index-friendly:

```ts
AffiliateCommission.find({ affiliateId, status: "settled", createdAt: { $gte: cycleStart, $lt: cycleEnd } })
```

## Refund propagation to payouts

If a refund happens AFTER the commission has been included in a payout, the reversal can't simply remove it from the payout (already paid). The pattern is:
1. Mark commission as reversed.
2. Open a "clawback" entry on the next payout.
3. Net out across cycles.

> _TODO: verify this is implemented in `payout-processing.ts` or if reversals just leave a discrepancy._

## Backfill scripts

Historic commissions can be backfilled. _TODO: enumerate the actual scripts (`scripts/backfill-affiliate-*.ts`)._
