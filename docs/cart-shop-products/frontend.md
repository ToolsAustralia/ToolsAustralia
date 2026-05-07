# Cart-Shop-Products — Frontend

## Pages

- [`src/app/(site)/shop/`](../../src/app/(site)/shop/) — product list + product detail (with `ProductViewTracking`)
- [`src/app/(site)/shop/checkout/page.tsx`](../../src/app/(site)/shop/checkout/page.tsx) — single-page shop checkout under the `/shop` route. Card-based layout (Contact / Shipping / Payment), Stripe `PaymentElement` themed with the site red, sticky GST-inclusive order summary with product thumbnails. Top padding matches the fixed navbar (`pt-[86px] sm:pt-[106px]`).
- [`src/app/(site)/shop/checkout/success/`](../../src/app/(site)/shop/checkout/success/) — `ShopCheckoutSuccessClient` polls `/api/orders/by-payment-intent/[id]` every 2s, fires Pixel `Purchase` once `ready`, 30s timeout fallback. Stripe's `confirmPayment` `return_url` lands here.
- `src/app/(site)/purchase-success/` — legacy one-time-purchase success path (mini-draws etc.)
- `src/app/(site)/my-account/orders/` — order history (Phase 10)

## Components

- [`ShopCheckoutPaymentElement`](../../src/components/payment/ShopCheckoutPaymentElement.tsx) — wraps Stripe `Elements` + `PaymentElement`. POSTs to `/api/stripe/create-shop-purchase` to get a `client_secret`, then renders the element. `confirmPayment` redirects to `/checkout/success?payment_intent=...`.

## Hooks

- [`useOrdersQuery` / `useOrderQuery` / `useOrderByPaymentIntentQuery`](../../src/hooks/queries/useOrdersQueries.ts) — TanStack Query hooks. The PI variant polls every 2s until `status === "ready"` then halts (refetch interval becomes `false`).

## Cart summary — GST-inclusive pricing

The cart summary follows AU convention: prices already include GST. The `gstIncluded` field on `CartSummary` is the 1/11 portion of `totalAmount` and is **for display only** ("incl. $X GST"). It is never added to the total.

Shipping: free over $100, otherwise flat $10. Both thresholds come from [BUSINESS.shop](../../src/config/business.ts).

## Cart context

[src/contexts/CartContext.tsx](../../src/contexts/CartContext.tsx) — primary state. Logged-in users persist via `/api/cart/*`; guests persist via `localStorage` (24h TTL, schema-versioned). On login, the guest localStorage cart is merged into the server cart (server wins on per-item conflict; guest-only items are POST'd; localStorage cleared).

```ts
interface CartContextValue {
  items: CartItem[];
  addItem(item): void;
  removeItem(id): void;
  updateQuantity(id, q): void;
  clear(): void;
  // ...
}
```

## Hooks

| Hook | Purpose |
|---|---|
| `usePurchaseInvalidation()` | Invalidates queries (orders, user) after purchase |

## State conventions

- Cart in CartContext (client-state for in-flight cart)
- Products via TanStack Query (server-state)
- Orders via TanStack Query (server-state, refresh on purchase via `usePurchaseInvalidation`)
- No Zustand for cart

## E2E test IDs

Component data-testids consumed by Playwright specs in `e2e/shop/`. Registered in [`e2e/utils/selectors.ts`](../../e2e/utils/selectors.ts).

| Component | testid | Used by |
|---|---|---|
| `src/app/(site)/my-account/orders/[orderNumber]/page.tsx` | `order-status-timeline` | `e2e/shop/order-detail.spec.ts` |
| `src/app/(site)/my-account/orders/[orderNumber]/page.tsx` | `order-tracking-link` | `e2e/shop/order-detail.spec.ts` |

Existing testids reused by these specs but registered elsewhere (cart, header, checkout) live near their owning components.

## E2E spec coverage

The `e2e/shop/` suite covers the cart, checkout, and order-history surfaces:

| Spec | Project | Asserts |
|---|---|---|
| `cart-icon-badge.spec.ts` | `chromium-guest` | Header badge appears/clears with cart contents |
| `cart-persistence.spec.ts` | `chromium-guest` | Guest cart survives reload via `shop_cart_v1` localStorage key; 24h TTL drops it |
| `guest-checkout.spec.ts` | `chromium-guest` | Guest can complete card checkout end-to-end |
| `member-checkout.spec.ts` | `chromium-fresh` | Logged-in checkout + appearance in `/my-account/orders` |
| `my-account-orders.spec.ts` | `chromium-fresh` | Orders list renders, 404 copy for unknown order numbers |
| `out-of-stock.spec.ts` | `chromium-guest` | `create-shop-purchase` returns 400 `insufficient_stock` |
| `three-ds.spec.ts` | `chromium-guest` | 3DS challenge frame interaction completes |
| `browse-filter.spec.ts` | `chromium-guest` | `/shop` renders product grid; brand filter narrows visible products (client-side, no URL param) |
| `brand-page.spec.ts` | `chromium-guest` | `/shop/brand/dewalt` renders hero heading + pre-applies brand filter on mount |
| `member-discount.spec.ts` | `chromium-fresh` | **Skipped** — `CartContext.calculateSummary` hard-codes `membershipDiscount: 0` and the checkout has no discount UI; re-enable when the feature ships |
| `order-detail.spec.ts` | `chromium-fresh` | `/my-account/orders/[orderNumber]` renders status timeline + tracking link (when `trackingNumber` is set); seeds an Order via `getDb()` |
