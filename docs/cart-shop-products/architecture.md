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

- `/shop` — product list (and `/shop/[slug]` for detail)
- `/shop/checkout` — single-page checkout (contact + shipping + Stripe PaymentElement)
- `/shop/checkout/success` — shop post-purchase confirmation (polls `/api/orders/by-payment-intent/[id]`, fires Pixel `Purchase`, 30s timeout fallback)
- `/my-account/orders` and `/my-account/orders/[orderNumber]` — order history

## Hooks

| Hook | Purpose |
|---|---|
| `usePurchaseInvalidation()` | Invalidates relevant TanStack queries after a purchase succeeds |

## Services

- **`computeShopTotals`** — server-side totals computed by [src/services/shop/shopTotals.service.ts](../../src/services/shop/shopTotals.service.ts). Pure function; returns subtotal/shipping/total/gst in cents. GST is the AU 1/11 portion of `totalCents`. Free shipping kicks in at the configured threshold (`BUSINESS.shop.freeShippingThreshold`).

## Models

- **Product** — catalog
- **Order** — completed purchases

## Cross-domain integration

- [payment](../payment/) — Payment Intent flow
- [billing-stripe](../billing-stripe/) — `PaymentEvent.data.grants` ledger records what the order granted
- [tracking](../tracking/) — purchase events to Klaviyo / Meta CAPI
