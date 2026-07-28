# Cart-Shop-Products — Gotchas

## CartContext value is memoized — keep new constituents stable (2026-07-19)

`CartContext`'s provider value is wrapped in `useMemo` (it previously re-rendered every cart consumer on
each provider render). Every constituent is a `useState` value or a `useCallback`-wrapped function; if you
add a new field to the context value, keep it referentially stable and add it to the memo's deps array —
an inline object/function there silently defeats the memo. Same incident/pattern as
[client-state/gotchas.md](../client-state/gotchas.md) "Unmemoized context values fan out".

## Cart auth is the NextAuth session cookie, not a bearer token (2026-06-19)

The cart/orders/mini-draws routes used to read `Authorization: Bearer <token>` and resolve the user from it. They now authorize via `requireAuthenticatedUserDoc()` (NextAuth `getServerSession`) — the browser sends the session cookie automatically, so **client cart calls send no `Authorization` header**. Concrete consequences:

- The old per-route `getUserFromToken` helpers are **gone**. On any verify failure they fell back to `User.findById(token)` — i.e. they accepted a raw 24-hex ObjectId as a "token", and the live client (`CartContext`, `lib/queries.ts`) was actually sending `session.user.id` as that bearer. That was an authentication bypass; do not reintroduce a bearer path here.
- Mutating cart routes (POST/PUT/DELETE) now call `requireSameOrigin(request)` for CSRF protection (cookie auth is auto-attached, so it needs an origin check).
- **Two latent endpoint bugs fixed in the op queue** ([CartContext](../../src/contexts/CartContext.tsx)): single-item "remove" hit a non-existent `/api/cart/remove` (now `DELETE /api/cart` with a body), and "clear" hit `DELETE /api/cart` with no body (500) instead of the dedicated `DELETE /api/cart/clear`. `useCartQueries.useRemoveFromCart` was likewise pointed at the real `DELETE /api/cart`.

## Cart desync between devices

Cart is localStorage per-browser. Multi-device users see different carts. Acceptable — sync is more trouble than it's worth at current scale.

## Stale cart after purchase

After purchase success, `usePurchaseInvalidation` clears the cart via `CartContext.clear()`. If you bypass it, cart can show items that were already paid for.

## Dead invalidation key: partner-discount queue (fixed 2026-07-24)

`usePurchaseInvalidation` invalidated `["partner-discount-queue", userId]` — but the live query key in
`usePartnerDiscountQueue` is `["partnerDiscountQueue"]` (no userId segment). Result: **no purchase ever
refreshed the partner-discount queue cache**; freshness came only from window-focus/remount. Fixed to
the matching key. Lesson: query keys are stringly-typed contracts — when adding an invalidation, copy
the key from the hook that owns the query (or `src/lib/queryKeys.ts`), never retype it from memory.

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

## Success-page Purchase pixel must stay guarded by localStorage, not just `firedRef` (2026-07-08)

`CheckoutSuccessClient.tsx` and `PurchaseSuccessClient.tsx` guard the browser Purchase fire with `shouldSuppressPurchasePixel` / `markPurchasePixelFired` ([src/utils/tracking/purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts)). A per-mount `firedRef` is NOT enough: it dies with the mount, and Meta's event_id dedup only lasts ~48h, so reopening the success URL later re-fired a fully-valued Purchase that inflated Meta-reported ROAS. The guard is window-aware: re-fires within 46h of the first fire stay allowed — Meta merges them, and on the shop path they are the ONLY recovery for a swallowed first fire, since shop checkout has **no server CAPI counterpart**; only re-fires older than 46h (the ones Meta would count as new) are suppressed. Three invariants to preserve: (1) never suppress the first legitimate fire; (2) re-marks must not move the first-fire timestamp (Meta's dedup window anchors at the first received event); (3) the guard key is deliberately NOT cleared on sign-out — it holds no user data, and clearing it would reintroduce the >48h re-fire.

## `/checkout/success` depended on a broken `useOrder` response shape (fixed 2026-07-08)

`useOrder` read `{ success, data }` while `GET /api/orders/[id]` returns `{ order }` — `order` was always `undefined`, so the order-confirmation page rendered its error state and the shop Purchase pixel never fired. Fixed in [useOrderQueries.ts](../../src/hooks/queries/useOrderQueries.ts) (now reads `response.order`). Shop-launch checklist before going live: (1) the other order hooks (`useOrders`, `useRecentOrders`, `useOrderAnalytics`) are still misaligned/aspirational — see [client-state/gotchas.md](../client-state/gotchas.md); (2) add a server-side CAPI Purchase for shop orders — the browser pixel is currently the ONLY Meta signal and loses 10–30% to ad blockers.

## Klaviyo event keys are snake_case

The cart and product callsites — `CartContext.trackKlaviyoRemoveFromCart`, `ProductCard.trackKlaviyoAddToCart`, `ProductInteractions.trackKlaviyoAddToCart`, `ProductViewTracking.trackKlaviyoViewContent` — pass `product_id` / `product_name` / `num_items`, not the camelCase equivalents. The shape is enforced by `KlaviyoEventParams` in [src/hooks/useKlaviyoTracking.ts](../../src/hooks/useKlaviyoTracking.ts). Mixing camelCase keys creates duplicate shadow properties on Klaviyo profiles and silently breaks any flow or segment built against the snake_case variant. See [docs/tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) for the full property-naming contract.

## Shop brand pages: generateStaticParams removed (2026-07-19)

`/shop/brand/[brand]` had `generateStaticParams` + `force-dynamic` together — the params won and the pages prerendered, which is a breakage under the nonce-CSP route class (prerendered HTML has no nonces; the runtime CSP header expects them). generateStaticParams was removed; params resolve per-request. Nonce-class pages must never prerender — check the `next build` route table.
