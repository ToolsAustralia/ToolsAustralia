# Cart-Shop-Products — Architecture

## Flow

```
Browse /shop → Product list (TanStack Query)
   │
   ▼
Add to cart → CartContext (optimistic in-memory list + op queue → debounced drain to /api/cart)
   │
   ▼
/checkout → Calculate total (member discount applied) → Stripe Payment Intent ([payment](../payment/))
   │
   ▼
3DS if needed → Payment success
   │
   ▼
Webhook payment_intent.succeeded → write Order, processPaymentBenefits
   │
   ▼
/purchase-success → Show order confirmation
```

## Cart state

[src/contexts/CartContext.tsx](../../src/contexts/CartContext.tsx) holds cart state:
- Items + quantities, as an **optimistic mirror** — the durable cart is `user.cart` in Mongo, loaded on mount via `GET /api/cart` for the session user. No browser storage is involved.
- Every action applies to the list immediately and appends a `PendingOperation`; a single debounced timer (`SYNC_DEBOUNCE_MS`, 1s) drains the queue to the API in order, one op at a time.
- After a drain the provider re-reads `GET /api/cart` and adopts that snapshot **if the queue came out empty** — the server is what reconciles a rejected or clamped operation, not client-side rollback. See [gotchas.md](./gotchas.md).
- Read by checkout / mini-cart / shop pages

## Routes & pages

- `/shop` — product list
- `/checkout` — cart + payment
- `/purchase-success` — post-purchase confirmation

## Hooks

| Hook | Purpose |
|---|---|
| `usePurchaseInvalidation()` | Invalidates relevant TanStack queries after a purchase succeeds |

## Models

- **Product** — catalog
- **Order** — completed purchases

## Cross-domain integration

- [payment](../payment/) — Payment Intent flow
- [billing-stripe](../billing-stripe/) — `PaymentEvent.data.grants` ledger records what the order granted
- [tracking](../tracking/) — purchase events to Klaviyo / Meta CAPI
