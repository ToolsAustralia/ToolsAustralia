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

## Refund reversal must match ALL commission storage forms (fixed 2026-06)

`reverseAffiliateCommissions` (`src/utils/affiliate/reverse-commission.ts`)
previously matched **only** `stripePaymentIntentId`. But commission rows store
their payment link three different ways:
- one-time / upsell / mini-draw → `stripePaymentIntentId = pi_…` (raw)
- `membership-first` → `stripePaymentIntentId = invoice_in_…` (normalized)
- `membership-recurring` → `stripeInvoiceId = in_…` (no PI at all)

So a refunded **renewal never reversed** (confirmed live in prod: a paid
recurring commission sat on a refunded invoice). The reversal now takes the
refund's `(paymentIntentId, invoiceId)` and matches across **both**
`stripePaymentIntentId` and `stripeInvoiceId` using the shared id-variant
helpers — see the pure, unit-tested `buildCommissionReversalIds()`
(`npm run test:affiliate-reversal`). The refund caller
(`processRefundReversal` in `src/utils/payment/refund-processing.ts`) now passes
`invoiceId` so subscription refunds reach the first + recurring rows.

**Partial-refund proportional clawback is NOT yet implemented** — partial
refunds (`RefundPartial`) short-circuit before the reversal and never touch
commissions. That needs a policy decision (reduce `commissionAmount`
proportionally vs cancel above a threshold) before building.

## Refund propagation to payouts

If a refund happens AFTER the commission has been included in a payout, the
reversal can't simply remove it from the payout (already paid). Already-`paid`
rows are **left intact and logged via `console.error`** (survives the prod
console-strip) so ops can do a manual clawback — the reversal does not silently
swallow them. A future enhancement is the automatic next-payout clawback:
1. Mark commission as reversed.
2. Open a "clawback" entry on the next payout.
3. Net out across cycles.

> _TODO: verify automatic clawback in `payout-processing.ts`; today it's a logged manual step._

## Backfill scripts

Historic commissions can be backfilled. _TODO: enumerate the actual scripts (`scripts/backfill-affiliate-*.ts`)._

## Deferred / future work (decided 2026-06-12)

- **Shop orders earn NO commission — by deferral, re-prompt when shop ships.**
  `src/app/api/orders/route.ts` has no affiliate hook (no `shop-order` commission
  type exists). Shop is a separate feature not yet fully live, so this is
  intentionally NOT built. When the shop feature goes live, revisit: should
  referred users' shop purchases pay the affiliate? If yes, add a `shop-order`
  commission type + a `processShopOrderCommission` call from the order flow.
- **Commission base is GST-inclusive list price for first payments, `amount_paid`
  for renewals.** Prod shows commission math is currently exact (no first-invoice
  discounts in use), so this is a latent inconsistency, not a live bug: a coupon
  on a first invoice would over-credit the affiliate vs cash collected. If
  first-invoice discounts are ever introduced, switch the first-payment base to
  the amount actually charged (and keep GST-inclusive per the 2026-06 decision).
  The reconciliation tooling can detect a base/charge mismatch if it appears.
- **Partial-refund proportional clawback** is not implemented (see the refund
  section above) — needs a policy decision before building.
