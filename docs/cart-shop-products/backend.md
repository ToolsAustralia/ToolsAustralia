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
