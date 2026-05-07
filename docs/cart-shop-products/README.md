# Cart-Shop-Products domain

The shop. Browse products, add to cart, checkout, post-purchase success. Member-only and member-discounted offerings.

## Index

- [architecture.md](./architecture.md) — cart context, checkout flow, order writes
- [frontend.md](./frontend.md) — shop / checkout / purchase-success pages, CartContext
- [backend.md](./backend.md) — order writes, product reads
- [api.md](./api.md) — `/api/cart/`, `/api/products/`, `/api/orders/`
- [rules.md](./rules.md) — member pricing, inventory, idempotency
- [patterns.md](./patterns.md) — cart context, single source of truth
- [gotchas.md](./gotchas.md) — out-of-stock, member-only enforcement
- [models.md](./models.md) — Product, Order
- [testing.md](./testing.md) — unit tests + Playwright e2e
- [launch-checklist.md](./launch-checklist.md) — pre-launch gating list

## Operational scripts

| Command | Purpose |
|---|---|
| `npm run migrate:shop-order-fields:dry` / `npm run migrate:shop-order-fields` | Backfill `gstAmount`/`shippingCost` and copy legacy `shippingAddress.address` → `addressLine1`. |
| `npm run reconcile:shop-orphans:dry` / `npm run reconcile:shop-orphans` | Walk Stripe shop PIs older than 1h with no matching `Order` row and replay `finalizeShopOrder` (idempotent — safe to run on a cron). |
| `npm run test:shop-webhook -- <productId>` | Replay a fake `payment_intent.succeeded` event against the local webhook (dev-only signature bypass). |
| `npm run test:shop` | Run all shop unit tests (totals + cart validation + finalize). |
| `npm run test:e2e:shop` | Run the Playwright shop e2e suite. |
