# Cart-Shop-Products — Backend

## Routes

- `/api/cart/` — server-side cart helpers if any (likely just totals/validation)
- `/api/products/` — product list / detail reads
- `/api/orders/` — order list / detail reads

> _TODO: read each route handler and document._

## Order writes

Orders are written by the Stripe webhook (`payment_intent.succeeded`) for shop purchases — NOT by client-side calls. The success path:
1. Webhook receives PI succeeded event
2. Identify it as a shop purchase via metadata
3. Write `Order` row
4. `processPaymentBenefits` writes `BenefitsGranted` ledger row referencing the order

## Member discount calculation

Member-only pricing is computed server-side at checkout time, not client-side. The `MembershipPackage.shopDiscountPercent` field on the user's active package determines the discount.

> _TODO: locate the discount-calculation helper._

## Shop checkout — how an order is actually written (2026-08-17)

> **Correction.** This document and [rules.md](rules.md) R3 previously asserted "Orders are
> written by the Stripe webhook (`payment_intent.succeeded`) for shop purchases". That was
> **design intent, never code** — before this change nothing anywhere created an `Order`. What
> follows is what the code now does.

The write is **split**, deliberately:

| Step | Where | What |
|---|---|---|
| 1 | `POST /api/shop/checkout` | Creates the order **`pending`** from server-read prices, then the PaymentIntent |
| 2 | `payment_intent.succeeded` | `finalizeShopOrder` marks it paid, takes stock, clears the cart |

**Why not build the order in the webhook from Stripe metadata?** Metadata caps at 500 characters
per value, which caps cart size — the unmerged `claude/shop-setup` branch takes that approach and
inherits the ceiling. A pending row also means a payment can always be reconciled to something:
if the webhook is lost, the order still exists and an operator can see it.

**Why is this not a free-goods hole?** The client never supplies a price, a total or an order. It
sends product ids, variant skus and quantities; everything else is read from the database. That is
the same contract `create-one-time-purchase-existing-user` uses.

### The order of operations is load-bearing

```
markPaid  →  decrement stock  →  clear cart
```

- **`markPaid` is the idempotency gate.** It filters on `status: "pending"`, so a redelivered
  Stripe event updates nothing and returns `null` — no double stock decrement, no second cart clear.
- **Stock is taken after payment**, because a print-to-order catalog mostly has none to take and
  reserving before payment would block real buyers. The trade-off is the branch below.
- **The cart is cleared last**, so a failure anywhere above leaves the customer holding their cart
  rather than losing both the cart and the order. Only `type: "product"` lines are pulled — a
  mini-draw ticket in the same cart is a different purchase path this payment did not cover.

### Stock lost after payment

If `decrementStock` cannot fulfil a line (another buyer took the last unit between payment and
webhook), the order is **automatically refunded**, marked `cancelled`, and annotated with which
items failed. Partial decrements are reverted first so a refunded order does not leave phantom
stock reserved.

A **failed refund is logged loudly** — the customer has paid for something we are not sending, and
only a human can resolve it from there.

### It grants no entries

The shop branch deliberately does **not** call `processPaymentBenefits` and does **not** widen
`packageType`. Merchandise entries are a separate, permit-gated feature — see
[the entries spec](../superpowers/specs/2026-08-17-shop-entries-design.md).

> **The failure mode to remember:** the dispatcher's final `else` logs and skips any
> `paymentType` it does not recognise. A missing branch therefore means paid orders silently
> never leave `pending` — no error, no alert.

## Merchandise free entries — the grant (2026-08-17)

A paid shop order credits the free entries included with the garment. Entries are **never
sold**; the customer buys the product and the entries come with it (CLAUDE.md rule 11).

**Base count is snapshotted at checkout.** `Order.products[].includedEntries` is copied from the
catalog in `ShopOrderService.createPendingOrder`, for the same reason `price` and `name` are: an
admin editing the catalog between checkout and webhook must not change what the buyer was
promised. The client never asserts a count — it sends product ids, skus and quantities.

**The multiplier is applied at fulfilment, and merchandise inherits the ONE-TIME pack
multiplier.** Resolved in the webhook shop branch via `getActivePromoMultiplier("one-time")` —
the helper already in that file, with `?? 1` and `catch → 1` — and passed into
`finalizeShopOrder` as a **required** option. It is required rather than optional so a future
caller cannot silently grant at 1×, and resolved by the caller so the shop service does not
become a third copy of that wrapper (the webhook handler and the upsell purchase route already
hold two). Both sides move together, so merch can never become better value per entry than the
packs during a promo.

### Ordering inside `finalizeShopOrder` — all three constraints are load-bearing

`markPaid` → stock → clear cart → **grant**.

- **The grant runs LAST.** A successful grant writes a `BenefitsGranted-{pi}` `PaymentEvent`, and
  `handlePaymentSuccess` short-circuits on `isPaymentProcessed()` *before* it reaches the shop
  branch. Anything sequenced after the grant would therefore never get a retry.
- **The grant runs only on the fulfilled path.** The stock-loss branch refunds the customer in
  full and returns. Granting before that check would leave a fully refunded order holding its
  entries, and the refund reversal cannot clean it up — it fails closed when the
  `BenefitsGranted` row is not yet committed.
- **`already_processed` no longer returns early.** It retries the grant when `entriesGranted` is
  absent, because that redelivery is the only retry a failed grant will ever get. Safe:
  `processPaymentBenefits` is idempotent on the same `PaymentEvent` id. Skipped when the order is
  `cancelled` (auto-refunded), so a refunded order is never granted against.

### Two fields that carry meaning in their absence

- `Order.entriesGranted` has **no schema default**. `undefined` = the grant has not run (in
  flight, or failed and awaiting the reconcile cron); `0` = it ran and the order was worth no
  entries. A `default: 0` would make a failed grant indistinguishable from a zero-entry order,
  and neither support nor the cron could tell them apart.
- A zero total short-circuits **before** `processPaymentBenefits`, so no `PaymentEvent` is
  written at all. That is what lets the feature ship dark at `includedEntries: 0` with genuinely
  zero behaviour change, and it survives any promo — `0 × 10 = 0`.

### No eligibility check, deliberately

Entries are granted to every buyer. SA/ACT exclusion is applied by the Major Draw export when a
winner is picked (`src/app/api/admin/major-draw/export/route.ts:120-131`), which is where every
other entry source is filtered. A point-of-sale skip would be a second, weaker copy of a working
filter, and would silently withhold entries from anyone whose state or birthdate is merely
missing.

### `userEmail` in the PaymentIntent metadata

Shop was the only payment type not sending it. The webhook resolves the buyer by
`stripeCustomerId` first and falls back to `metadata.userEmail`; with neither available it logs
"will be retried" and returns `undefined` — which `dispatchStripeEvent` treats as **processed**,
not retry, so the paid order and its entries were both lost silently. `resolveStripeCustomer`
persists the customer id best-effort with a swallowed catch, so that mismatch is reachable rather
than theoretical.

**Still open (shared, not shop-specific):** that `return undefined` path marks events permanently
processed across every payment type despite its log claiming a retry. Fixing it changes webhook
retry semantics globally, so it is flagged rather than changed here.

### Test

`npm run test:shop-entries` (`src/utils/payment/__tests__/shop-entry-grant.test.ts`) runs against
`E2E_MONGODB_URI`, never the dev database, and cleans up after itself. It covers the silent
failures: both schema round-trips, the absent-vs-zero distinction, the arithmetic, the kill
switch under a promo, and the ladder property at 1/2/5/10×. It includes a **control** assertion
that writes an undeclared source key and confirms Mongoose drops it — without that, "shop
persisted" would also pass on a schema with strict mode off.

**Not covered, and listed in the phase-3 plan rather than claimed:** the end-to-end grant through
`processPaymentBenefits`, webhook replay idempotency, the `already_processed` retry path, and
refund reversal of a shop grant.
