# Affiliate — Models

| Model | Path | Purpose |
|---|---|---|
| `Affiliate` | [src/models/Affiliate.ts](../../src/models/Affiliate.ts) | The affiliate partner record (auth, payout details, commission rate). |
| `AffiliateCommission` | [src/models/AffiliateCommission.ts](../../src/models/AffiliateCommission.ts) | Per-payment commission row. |
| `AffiliatePayout` | [src/models/AffiliatePayout.ts](../../src/models/AffiliatePayout.ts) | Aggregated payout (set of commissions paid out together). |

> _TODO: pull exact schemas from source files._

## `AffiliateCommission` dedup keys — must be PARTIAL, not sparse

Duplicate commissions are prevented by **two compound unique indexes**, keyed by
whichever payment id the commission type carries:

- `uniq_affiliate_referred_pi_commission_partial` — `(affiliateId, referredUserId,
  stripePaymentIntentId, commissionType)` — for rows keyed by a **payment intent**
  (one-time / upsell / mini-draw / `membership-first`).
- `uniq_affiliate_referred_invoice_commission_partial` — `(affiliateId,
  referredUserId, stripeInvoiceId, commissionType)` — for `membership-recurring`
  rows, which carry an **invoice id** and no PI.

Both use a `partialFilterExpression` (`{ <id>: { $exists: true, $type: "string" } }`),
**not** `sparse`. **Why this matters (real bug, fixed twice):** a *compound* `sparse`
index still indexes a document when **any** indexed key is present — and `affiliateId`
is always present — so a row missing the optional id was indexed with that id as
`null`. Every PI-keyed commission then collided on `(affiliate, user, null,
commissionType)` for the invoice index (and vice-versa), capping a referred user at a
**single** such commission with `E11000 dup key { stripeInvoiceId: null }`. The PI
index was fixed to partial in 2026-01; the invoice index in 2026-06 (it had been
silently blocking the reconcile backfill from creating a user's 2nd+ one-time
commission). A partial index covers **only** rows that actually carry a string id, so
each commission type dedupes on its own id.

To migrate an existing DB off the legacy sparse indexes, run
`migrate:affiliate-commission-pi-index` (see
[docs/infrastructure/testing.md](../infrastructure/testing.md)) — it drops both legacy
named indexes and `syncIndexes()` rebuilds the partials.

Email validation (2026-07-22): the model's email field uses the shared permissive pattern `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` (plus-addressing and modern TLDs accepted; aligned across User/Affiliate/ContactSubmission/PartnerApplication in the same change).
