# Cart-Shop-Products — Architecture

## Flow

```
Browse /shop → Product list (TanStack Query)
   │
   ▼
Add to cart → CartContext (in-memory, persisted to localStorage)
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
- Items + quantities
- Localized to localStorage (per browser session)
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
