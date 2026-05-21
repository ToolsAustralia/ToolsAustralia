# Cart-Shop-Products — Gotchas

## Cart desync between devices

Cart is localStorage per-browser. Multi-device users see different carts. Acceptable — sync is more trouble than it's worth at current scale.

## Stale cart after purchase

After purchase success, `usePurchaseInvalidation` clears the cart via `CartContext.clear()`. If you bypass it, cart can show items that were already paid for.

## Member status changes mid-checkout

If a user's subscription cancels between adding to cart and checkout, their member discount may evaporate. Server-side recalculation at PI creation handles this — just don't trust the client total.

## Product config drift

Products are in Mongo (`Product` model) AND referenced by static IDs in some code. _TODO: verify whether `src/data/sampleProducts.ts` is just dev fixture or also used as fallback._

## Never gate per-product UI on `useCart().isLoading`

`isLoading` from `useCart()` is the **global** sync flag — it flips true any time `processPendingOperations` is running for ANY item in the cart (or even retrying a failed op). If you wire an "Add to cart" button on a product card to it, every card on the page will visibly flicker / lock up whenever any other product is syncing.

Use the per-product helpers from `CartContext` instead:

- `isAddingToCart(productId)` — true while an `add` op for this productId is pending
- `isUpdatingCart(productId)` — same for `update`
- `isRemovingFromCart(productId)` — same for `remove`

Pair them with a local `useState` flag inside the button component to cover the brief window before the optimistic op lands in `pendingOperations`. See [src/app/(site)/shop/[slug]/components/ProductInteractions.tsx](../../src/app/(site)/shop/[slug]/components/ProductInteractions.tsx) for the canonical pattern (`isAddingToCart || isPendingForThisProduct`).

## `processPendingOperations` must clear failed op ids too

Historical bug: when a cart sync API call failed, the op was pushed onto `failedOperations` but **left in** `pendingOperations`. Because `processPendingOperations` is a `useCallback` whose deps include `cartState.pendingOperations`, and the auto-sync `useEffect` depends on `debouncedSync` (which depends on `processPendingOperations`), the effect re-fired on every state update, flickering global `isLoading` true forever and freezing every Add-to-cart button site-wide on `"Adding..."`.

Fix lives in [src/contexts/CartContext.tsx](../../src/contexts/CartContext.tsx) — the post-loop `setCartState` filters `pendingOperations` by **both** the successful and failed id sets:

```ts
const successfulIds = new Set(successfulOperations);
const failedIds = new Set(failedOperations.map((op) => op.id));
// ...
pendingOperations: prev.pendingOperations.filter(
  (op) => !successfulIds.has(op.id) && !failedIds.has(op.id)
),
```

If you ever refactor the sync loop, preserve this invariant: an op in `pendingOperations` means "not yet attempted". Once attempted, it must move to either success (gone) or `failedOperations` (retryable), but never linger in `pendingOperations`.
