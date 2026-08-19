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

## The cart is server-side, not localStorage

`CartContext` touches no browser storage. The durable cart is `user.cart` in Mongo, loaded on mount via `GET /api/cart` and keyed to the NextAuth session user; the context holds an in-memory optimistic mirror plus a queue of pending operations that drains to the API. So a multi-device member sees the *same* cart, and anything that only fixes the client list (rather than the server) fixes nothing past a reload. Signed-out visitors have no `userId`, so nothing loads and nothing drains — their optimistic items live and die with the tab.

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

Historical bug: when a cart sync API call failed, the op was pushed onto `failedOperations` but **left in** `pendingOperations`, so the auto-sync effect re-fired on every state update, flickering global `isLoading` true forever and freezing every Add-to-cart button site-wide on `"Adding..."`.

Fix lives in [src/contexts/CartContext.tsx](../../src/contexts/CartContext.tsx) — the post-loop `setCartState` settles both id sets in one pass:

```ts
const settledIds = new Set([...successfulOperations, ...failedOperations.map((op) => op.id)]);
const remainingOperations = prev.pendingOperations.filter((op) => !settledIds.has(op.id));
```

Note it filters `prev.pendingOperations`, not the `operations` array the drain attempted — anything queued *while* the drain was in flight has to survive.

If you ever refactor the sync loop, preserve this invariant: an op in `pendingOperations` means "not yet attempted". Once attempted, it must move to either success (gone) or `failedOperations` (retryable), but never linger in `pendingOperations`.

The mirror of that invariant lives on the retry paths: `retryFailedOperation` / `retryAllFailedOperations` must set `isDirty: true` when they move an op back onto `pendingOperations`. The auto-sync effect gates on `isDirty`, so a requeued op otherwise sat in the queue unsent until some unrelated cart action happened to dirty the state again.

## A per-call debounce timer is not a debounce — the server quantity doubled (2026-08-03)

`createDebouncedSync` looked like a textbook debouncer (`clearTimeout(timeoutId); timeoutId = setTimeout(...)`), but the factory was invoked *inside* `debouncedSync` on every call, so each call got a fresh closure with its own `timeoutId`. The `clearTimeout` only ever cleared that call's own — still unset — handle; the previous call's timer was never cancelled. Two cart actions inside the 1s window therefore left **two** live timers, both fired, and both drains read the same queue.

That is a data bug, not a wasted request: `POST /api/cart` is **additive** (`user.cart[i].quantity += n` — see [src/app/api/cart/route.ts](../../src/app/api/cart/route.ts)), so re-sending an add doubles the stored quantity. Add product A then product B within a second and the server held A×2 — invisible on screen, because the UI was showing its own optimistic count, until the next reload.

The fix is three parts, and all three are load-bearing:

- **One `syncTimerRef`**, cleared before every reschedule and on unmount, so a second action genuinely cancels the first action's drain.
- **An `isSyncingRef` in-flight guard** — the timer is not the only way in (retries, a fast second dirty), and a drain that starts while another owns the queue would re-send the same ops.
- **The queue is read through `pendingOperationsRef`**, not captured at schedule time. A debounced callback fires long after the render that created it; a captured array replays operations that already went out.

The same two-actions-in-a-second window also corrupted the *client* list: each action built its optimistic array from `cartState.items` as of its own render, then handed the finished array to `setCartState`. Both built on the same stale list, so the later one erased the earlier one's item. All three actions now derive from `prev.items` **inside** the updater and no longer take `cartState.items` as a dep.

Transferable lesson: a debounce's timer handle must outlive the call that schedules it, and when the request being duplicated is additive rather than idempotent, "harmless duplicate" is silent data corruption.

## The failed-op rollback was unreachable — reconcile from the server instead (2026-08-03)

The post-loop rollback branch ran only when `failedOperations.length === operations.length`, and then searched *those same operations* for the last one whose id was in `successfulOperations` — a set that is empty by construction whenever that branch is entered. So the rollback never restored anything: `updatedItems` was always `prev.items`. A rejected add left its optimistic item sitting in the cart, and product UI that derives its added state from `items` stayed stuck there until a reload.

Rather than repair the client-side reconstruction, the drain now re-reads `GET /api/cart` afterwards and adopts that snapshot. Only the server knows what actually landed — a rejected add, a partly-applied batch, a quantity it clamped against stock — and a per-op `optimisticState` snapshot cannot represent any of those. `optimisticState` was dropped from `PendingOperation` accordingly; nothing consumes a per-op snapshot now, so don't reintroduce one.

One guard on that reconcile: the server snapshot is adopted **only when `remainingOperations.length === 0`**. An action taken while the drain was in flight exists only in the optimistic list — the server has not heard about it yet — so adopting the snapshot with a non-empty queue would flicker that item away and back.

## `useCartQueries` is dead code — the live cart is `CartContext` (2026-08-03)

[src/hooks/queries/useCartQueries.ts](../../src/hooks/queries/useCartQueries.ts) exports a complete TanStack cart layer (`useCart`, `useCartItems`, `useCartSummary`, `useAddToCart`, `useUpdateCartItem`, `useRemoveFromCart`, `useClearCart`, `useCartPrefetch`) and **no component imports any of it**. The only live import is the `CartSummary` *type* into `CartContext`; the rest is reachable only via the `src/hooks/queries/index.ts` barrel and `usePrefetching.ts`, which itself has no consumers. Every real cart mutation goes through `CartProvider`'s pending-op queue.

The trap is the name collision: `useCart` is exported by both files, so a grep for cart behaviour lands in the query layer and reads like the implementation. It has already misled one audit. When reasoning about or fixing cart behaviour, confirm the import path is `@/contexts/CartContext` — and be aware that a fix applied to `useCartQueries` changes nothing a user can see.

## Success-page Purchase pixel must stay guarded by localStorage, not just `firedRef` (2026-07-08)

`CheckoutSuccessClient.tsx` and `PurchaseSuccessClient.tsx` guard the browser Purchase fire with `shouldSuppressPurchasePixel` / `markPurchasePixelFired` ([src/utils/tracking/purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts)). A per-mount `firedRef` is NOT enough: it dies with the mount, and Meta's event_id dedup only lasts ~48h, so reopening the success URL later re-fired a fully-valued Purchase that inflated Meta-reported ROAS. The guard is window-aware: re-fires within 46h of the first fire stay allowed — Meta merges them, and on the shop path they are the ONLY recovery for a swallowed first fire, since shop checkout has **no server CAPI counterpart**; only re-fires older than 46h (the ones Meta would count as new) are suppressed. Three invariants to preserve: (1) never suppress the first legitimate fire; (2) re-marks must not move the first-fire timestamp (Meta's dedup window anchors at the first received event); (3) the guard key is deliberately NOT cleared on sign-out — it holds no user data, and clearing it would reintroduce the >48h re-fire.

## `/checkout/success` depended on a broken `useOrder` response shape (fixed 2026-07-08)

`useOrder` read `{ success, data }` while `GET /api/orders/[id]` returns `{ order }` — `order` was always `undefined`, so the order-confirmation page rendered its error state and the shop Purchase pixel never fired. Fixed in [useOrderQueries.ts](../../src/hooks/queries/useOrderQueries.ts) (now reads `response.order`). Shop-launch checklist before going live: (1) the other order hooks (`useOrders`, `useRecentOrders`, `useOrderAnalytics`) are still misaligned/aspirational — see [client-state/gotchas.md](../client-state/gotchas.md); (2) add a server-side CAPI Purchase for shop orders — the browser pixel is currently the ONLY Meta signal and loses 10–30% to ad blockers.

## Klaviyo event keys are snake_case

The cart and product callsites — `CartContext.trackKlaviyoRemoveFromCart`, `ProductCard.trackKlaviyoAddToCart`, `ProductInteractions.trackKlaviyoAddToCart`, `ProductViewTracking.trackKlaviyoViewContent` — pass `product_id` / `product_name` / `num_items`, not the camelCase equivalents. The shape is enforced by `KlaviyoEventParams` in [src/hooks/useKlaviyoTracking.ts](../../src/hooks/useKlaviyoTracking.ts). Mixing camelCase keys creates duplicate shadow properties on Klaviyo profiles and silently breaks any flow or segment built against the snake_case variant. See [docs/tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) for the full property-naming contract.

## Shop brand pages: generateStaticParams removed (2026-07-19)

`/shop/brand/[brand]` had `generateStaticParams` + `force-dynamic` together — the params won and the pages prerendered, which is a breakage under the nonce-CSP route class (prerendered HTML has no nonces; the runtime CSP header expects them). generateStaticParams was removed; params resolve per-request. Nonce-class pages must never prerender — check the `next build` route table.

## The `ShopContent` Suspense fallback must reserve a viewport, or `/shop` scores CLS 0.55 (2026-07-30)

`/shop` and `/shop/brand/[brand]` render `<MembershipSection>` immediately after the
`<Suspense>` that wraps `ShopContent`. The fallback was a bare `py-12`/`py-16` line of text
(~120px), so while the grid streamed, the membership section sat **inside** the viewport and
was then shoved ~1500px down when products arrived:

```
shift: section#membership.pt-8.pb-32  from y=378 h=522  ->  to y=0 h=0
0.527 of /shop's 0.551 total (desktop, throttled)
```

`h=0` does **not** mean the section unmounted — `LayoutShiftAttribution` rects are
viewport-relative, so an element pushed below the fold reports an empty `currentRect`. Do not
go looking for a conditional render; look for the unreserved thing above it.

Both fallbacks now carry `min-h-screen-svh`. A viewport is the correct size for a reason worth
keeping: the section starts 258px down the page, so `100svh` clears the fold at **any** window
height (a fractional reservation like `75svh` fails on tall monitors, where `0.25 × vh > 258`),
while still being shorter than the real grid — measured 1539px desktop / 864px mobile — so the
swap can only push the section further down, never back up into view. Measured after:
**/shop 0.551 → 0.023**, `/shop/brand/*` → 0.017, three runs each.

`/shop/[slug]` has no Suspense boundary and is unaffected. Same failure family as the promo
footer/newsletter shifts — see [docs/promo/gotchas.md](../promo/gotchas.md).

## Print-to-order merchandise was unbuyable from the shop listing (fixed 2026-08-17)

`ProductCard` computed `isOutOfStock = productData.stock === 0` with **no `trackInventory`
check**. Print-to-order items hold `stock: 0` permanently — the printer makes each one on demand
— so every merchandise card rendered **"Out of Stock"** with a disabled **"Sold Out"** button.
The customer could never reach the size picker, which lives on the product page.

The product page was correct the whole time (`ProductInteractions` has always read
`trackInventory && stock === 0`), so the two surfaces disagreed: the listing said Sold Out, the
detail page said Made to order. Anyone testing from the product URL directly would never see it.

The same root cause had **three** faces, and fixing only the card would have left two:

1. `ProductCard.tsx` — the comparison itself. Now `trackInventory && stock === 0`, and the label
   is three-state (`Out of Stock` / `Made to order` / `In Stock`) to match the product page.
2. **The related-products projection** in `shop/[slug]/page.tsx` did not `.select()`
   `trackInventory`. `ProductCard` defaults a missing value to *tracked*, so related products
   still rendered Sold Out even after the card was fixed. A projection that drops a field a
   consumer defaults to `true` fails **closed** and silently.
3. **SEO metadata and JSON-LD** both derived availability from `stock > 0`, publishing
   `out of stock` / `schema.org/OutOfStock` to Google and every social crawler for the whole
   made-to-order catalogue.

**Rule of thumb:** anything that reads `stock` to decide availability must check `trackInventory`
first. Grep for `stock === 0` and `stock > 0` before adding a fourth surface.

## Customer-facing claims that were not true (removed 2026-08-17)

Found while reviewing the shop UI against the mini-draws pages. All four were template filler
inherited from a storefront starter and applied to **every** product:

| Claim | Where | Why it was wrong |
|---|---|---|
| `Save 20%` beside a struck-through price | `shop/[slug]/page.tsx` | The "was" price was `product.price * 1.2` — a former price the item was never sold at. A misleading former-price representation under Australian Consumer Law, on every product page |
| `Free Shipping` badge | `ProductInteractions.tsx` | Unconditional, while `priceCart` only waives shipping at $100+. A $45.95 tee was shown "Free Shipping" and charged $10 at checkout |
| `3 Year Warranty` badge | `ProductInteractions.tsx` | No such warranty is offered, on apparel or anything else |
| `30-Day Returns` badge | `ProductInteractions.tsx` | States a returns window no policy backs |
| Weight `2.5 kg`, Dimensions `30 x 20 x 15 cm`, Power Source `Cordless/Battery`, Warranty `3 Years` | `ProductTabs.tsx` | Hard-coded on every product, so a cotton t-shirt advertised a battery and a warranty |
| Six fixed "Key Features" incl. `Manufacturer warranty included` | `ProductTabs.tsx` | Same — fixed strings, one of which asserts a warranty that does not exist |

Specifications and features now render the product's own `specifications` map and `features[]`
(both real fields the model always carried and the template ignored). **A product with none shows
none** — an empty section is honest; an invented row is not.

**If badges return here, drive each from something real** — the resolved shipping for *this*
cart, a stated returns policy, a genuine `originalPrice` with evidence of sale at that price. A
badge is a promise, and the product page is where a customer decides whether to trust it.

## Shipping figures are imported, never typed

`FREE_SHIPPING_THRESHOLD_LABEL` / `FLAT_SHIPPING_RATE_LABEL` (`src/config/shop.ts`) exist because
the product page said "over $99" while the code charged below $100, and separately advertised
Express $15 and Same Day $25 in three cities — neither of which exists in the pricing path at
all. Copy that restates a money value drifts from it. Import the label.

## The cart clear was not scoped to the order (fixed 2026-08-19)

`finalizeShopOrder` ended with `$pull: { cart: { type: "product" } }` — **every** product
line, not the order's own. Webhooks are asynchronous, so a customer who adds a new item while
the previous order's webhook is still in flight had that new item silently removed.

Now matched on `(productId, sku)` pairs taken from the order, with a line that has no sku
matched on the absence of one so a variant-less product does not pull every sku of the same
product. Mini-draw tickets were always excluded and still are.

Found by two e2e specs running back to back, where the first purchase's late webhook emptied the
second test's cart. Narrow in production, but a fast customer can hit it.

## `full-story.spec.ts` must run on its own

It shares the seeded member — and that member's cart — with `entries.spec.ts`, which also drives
a full purchase. Run back to back, its add-to-cart is intermittently rejected with a 400 while
the previous purchase settles. Alone it passes every time.

Deliberately **not** retried around. A retry would hide it, and the honest fix is to give the spec
its own user, which is worth doing if it ever needs to run inside the full suite. Run it with:

```bash
npx tsx e2e/run.ts --proof --grep "the complete story" --project chromium-desktop
```

## Response shapes on `/api/admin/shop/**`

Both routes return `{ success, data }` / `{ success, error }`, matching `/api/admin/products`.
The CSV branch of the fulfilment route is the exception — it returns a file and is not wrapped.

## The print provider's API will mislead you

- **The published docs describe GraphQL. The deployment is REST.** `POST /graphql`
  returns Express's default `Cannot POST /graphql`. Auth runs BEFORE routing, so
  no key gives a JSON 403 and a valid key gives the HTML 404 — that pair is how
  you tell "bad key" from "route absent".
- **Collection endpoints return empty, get-by-id works.** `/products`, `/shops`,
  `/orders`, `/designs` all answer `[]`. Do not read that as an empty account.
- **Query parameters are ignored on collection routes.** `GET /blank-products`
  and `GET /blank-products?limit=1` return byte-identical 182,464-byte payloads.
- **`GET /blank-products/{id}` returns MORE than the list, not less.** The wrapper
  carries `blankProduct`, `blankProductSettings`, `blankVariants` and `mockups` as
  SIBLINGS. Looking for settings *inside* `blankProduct` finds nothing and reads
  as "the detail endpoint is thinner" — it is not.
- **`colorsWithImages` on a BLANK is the undecorated garment.** It has no logo on
  it. The customer-facing mockups are `colorImages` on the PRODUCT wrapper, keyed
  by colour and placement (`"3"` left chest, `"2"` back, `"front_back_stagger"`
  both). Using the blank's imagery ships plain stock photos.
- **Colour names come from `variants[].properties`, never from the sku.** Sku
  colour codes are a three-letter prefix plus a supplier id (`CHA847`, `CHA4055`,
  `CHA8197` for Charcoal, Charity Pink and Charlotte) and the numeric part appears
  nowhere in the catalogue payload, so prefix-matching is ambiguous by design.
- **Rotating the API key breaks access.** A rotated key is `rv_live_…` (56 chars)
  rather than a 28-char uid, and as at 2026-08-19 the deployment rejects it on
  every header scheme tried (`x-uid`, `x-api-key`, bearer, and six others) with
  `403 Authentication failed`. Outstanding with the supplier.

## Rotating the print-provider API key (2026-08-19) — do not

Rotation was attempted on the strength of their docs and reverted the same day.

- The rotated key is `rv_live_…` (56 chars). The deployment **rejects it on every
  endpoint and every auth scheme** — `x-uid`, `x-api-key`, `Authorization: Bearer`,
  and six others, across nine host and path-prefix combinations.
- The tell that it is their fault, not ours: the API returns a **byte-identical
  403** for the real rotated key and for the literal string
  `"obviously-not-a-real-key"`. It does not recognise the new format at all.
- Their docs say *"After you rotate, only the new key is accepted — the previous
  key stops working immediately."* **Both halves are false.** The previous
  28-character uid was pasted back into `.env.local` and every route returned 200
  immediately.

So the working credential is the account **uid**, and rotation issues a parallel
key the deployed API ignores. Until the supplier confirms otherwise, treat the uid
as the only credential and **do not rotate it** — there is no in-product way back
if the revert ever stops working, and the uid is the join key for product ids and
mockup URLs as well as for auth.

## A customer could mark their own order paid (fixed 2026-08-19)

`PUT /api/orders/[id]` accepted `status`, `trackingNumber` and `notes` from the
request body, authorised by nothing more than owning the order. A signed-in
customer could therefore move their own unpaid order from `pending` to
`processing` — exactly what `fulfilmentExport.ts` `pendingFilter()` selects on —
and have a garment printed and posted **without paying**. It would also have
desynced the Stripe webhook, whose `markPaid` matches on `status: "pending"`.

Nothing called it: the order hooks point at `/cancel` and `/status`, **neither of
which exists**. The handler is deleted rather than patched. Order status belongs
to the webhook and to staff, never to the buyer.

## Fabricated reviews shipped on every product page (removed 2026-08-19)

`ProductTabs.tsx` rendered three invented testimonials as literal JSX — named
reviewers, invented bodies, a "Verified Purchase" badge on each — beside a real
review count of zero, plus a rating histogram whose bars were hard-coded
60/25/10/3/2%. Fabricated testimonials and false verified-purchase badges are
prohibited conduct under the Australian Consumer Law.

Reviews now render from `Product.reviews` and only above the gate in
`src/utils/shop/reviews.ts`: **at least one review AND a 4-star average**. Below
either bar there is no tab and no star row, because five grey stars beside
"(0 reviews)" reads as a bad product rather than a new one.

The same pass removed untrue delivery and warranty claims from the same file:
30-day returns, free return shipping, a first-party 3-year warranty (on a cotton
tee, contradicted by our own `/terms`), nationwide repair centres, and a
`1800-TOOLS-AU` number that appears nowhere else in the repo and is not dialable.
