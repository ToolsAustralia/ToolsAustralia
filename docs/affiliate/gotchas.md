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

## Commission reliability — reconciliation safety net (2026-06-15)

The webhook commission dispatch is **fire-and-forget** (a commission error must
never fail a payment/benefit-grant — `payment-processing.ts` wraps it in a
non-blocking `try/catch`). So a transient failure can silently drop a commission.
This is fixed the way the repo fixes the same class of problem elsewhere
(`reconcile-major-draw-entries`, `reconcile-blocked-transactions`): **at-least-once
inline + idempotent + a reconciliation backstop**.

- **Core:** [`reconcileAffiliateCommissions()`](../../src/utils/affiliate/reconcile-commissions.ts)
  re-derives the commission ledger from the durable `PaymentEvent` source of truth
  over an optional trailing window and idempotently backfills any **owed** missing
  commission (via `recordAffiliateCommission`). Window-bounded → O(recent), not
  O(all-time) (a full sweep scans ~25k payments; the cron's 35-day window is tiny).
- **Cron:** [`/api/cron/reconcile-affiliate-commissions`](../../src/app/api/cron/reconcile-affiliate-commissions/route.ts)
  (daily, auth-gated, 35-day window, `apply: true`) — self-healing, no manual step.
- **CLI:** `npm run reconcile:affiliate-commissions[:prod][:dry]` (+ `--since-days=N`)
  uses the same core; writes a CSV audit.
- **Over-paid** commissions (active on a refunded payment) are **DETECTED and
  flagged** (cron `console.error`s them) but **never auto-clawed-back** — see below.

## Refund clawback after payout — RESEARCHED DESIGN, DEFERRED (pending client refund-policy)

When a referred user's purchase is refunded **after** the commission was already
paid out, the standard fix (Rewardful, track360, Post Affiliate Pro, tinyaffiliate)
is a **three-layer** model. We've researched it and scoped the build; it is
**deferred until the client confirms the refund/hold window**:

1. **Hold / maturation period (the real fix, highest leverage).** Don't pay a
   commission until the refund window has passed (industry default **30 days**,
   matched to the refund policy) — eliminates ~60–80% of clawbacks because the
   refund cancels a still-`pending` row. **Today `processAffiliatePayout` pays ALL
   `pending` immediately (no hold)** — this is why over-payments happen. Build:
   filter payout-eligible commissions to `earnedAt <= now − holdDays`.
2. **Pre-payout refund:** full → cancel (already done); **partial → proportional
   recalc** (not yet built — `RefundPartial` currently ignored).
3. **Post-payout refund:** record a **negative clawback adjustment that nets
   against future payouts** (carry-forward negative balance; never bill the
   affiliate; absorb if never recouped). Decided representation: a dedicated
   **`AffiliateAdjustment`** ledger (signed entries) that `processAffiliatePayout`
   nets in (payout `totalAmount` stays `min:0`; the negative carries on the
   balance). Plus reversal **reason codes** for audit.

Until this lands, over-paid rows are **logged for manual clawback** (the reversal
fix already prevents *unpaid* refunded renewals from staying payable). Open
decision blocking the build: **hold-period length** (client's refund policy).

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
