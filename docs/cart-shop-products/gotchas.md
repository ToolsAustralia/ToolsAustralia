# Cart-Shop-Products — Gotchas

## Guest vs logged-in cart split

Guest cart is `localStorage` per-browser, key `shop_cart_v1`, 24h TTL. Logged-in cart is server-side (`User.cart`, accessed via `/api/cart/*` with `getServerSession` cookie auth). On login, the guest cart is merged into the server cart (see [frontend.md](./frontend.md)) and localStorage is cleared. Multi-device guests see different carts — acceptable; sync arrives once they log in.

> Stale: Earlier docs said "cart is localStorage per-browser" universally — that only applies to guests now.

## Stale cart after purchase

After purchase success, `usePurchaseInvalidation` clears the cart via `CartContext.clear()`. If you bypass it, cart can show items that were already paid for.

## Member status changes mid-checkout

If a user's subscription cancels between adding to cart and checkout, their member discount may evaporate. Server-side recalculation at PI creation handles this — just don't trust the client total.

## Product config drift

Products are in Mongo (`Product` model) AND referenced by static IDs in some code. _TODO: verify whether `src/data/sampleProducts.ts` is just dev fixture or also used as fallback._
