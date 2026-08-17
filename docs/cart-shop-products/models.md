# Cart-Shop-Products — Models

| Model | Path | Purpose |
|---|---|---|
| `Product` | [src/models/Product.ts](../../src/models/Product.ts) | Shop catalog |
| `Order` | [src/models/Order.ts](../../src/models/Order.ts) | Completed purchases |

> _TODO: pull schemas (fields, indexes)._

## ⚠️ `Order` is read by the admin Receipts ledger — changes here reach it

[docs/admin/receipts.md](../admin/receipts.md) unions `Order` into the admin **Receipts**
revenue ledger (`src/services/admin/receipts.ts`, `orderStages()`). It reads `createdAt`,
`status`, `totalAmount`, `paymentIntentId`, `orderNumber` and `user`. It currently returns
**0 rows** — the shop has not launched — and the mapping exists so Receipts works on launch
day instead of needing a rework.

**Two invariants that live in this domain but are depended on over there:**

1. **`Order` is always a shop-product order.** `createOrderSchema`
   ([src/app/api/orders/route.ts](../../src/app/api/orders/route.ts)) accepts only
   `products` / `shippingAddress` / `paymentIntentId`, and that route is the **only** writer
   of `Order`. This is what makes `Order.tickets[]` and `Order.membership` vestigial, and it
   is the entire reason unioning `Order` with `PaymentEvent` cannot double-count.
2. **`cancelled` means a voided sale.** Receipts excludes that status as money-not-received.

**If you add a second `Order` writer, start writing `tickets[]` / `membership`, or repurpose
the `cancelled` status, the Receipts ledger can double-count or mis-total revenue.** Work
through the launch checklist in
[admin/receipts.md § When the shop launches](../admin/receipts.md#when-the-shop-launches--update-this-feature)
in the same change.
