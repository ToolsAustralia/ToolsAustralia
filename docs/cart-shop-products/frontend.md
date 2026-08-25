# Cart-Shop-Products — Frontend

## Pages

- `src/app/(site)/shop/` — product list
- `src/app/(site)/checkout/` — cart + payment
- `src/app/(site)/purchase-success/` — post-purchase. `PurchaseSuccessClient.tsx` reads `wasRecentResubscribe`, `lastMonthAccumulatedEntries`, and `entriesGranted` off the `usePaymentStatus` response (see [payment/api.md](../payment/api.md#get-apipayment-statuspaymentintentid--completed-branch-fields)) and, when all three are present and `wasRecentResubscribe === true`, renders a **"Welcome back!" carry-over banner** above the standard receipt. The banner lead line reads "Your **N** accumulated entries carried over." (where `N = lastMonthAccumulatedEntries − entriesGranted`); the word "previous" was dropped 2026-05-21 to align with the "accumulated entries" copy used by the resubscribe tier picker. The banner also shows this month's grant (`entriesGranted`) and the next-month renewal preview so a returning member who sees only e.g. 150 entries on the page understands their prior 1000 carried over. Plain text (no emoji per project rule). Math is unchanged — `calculateResubscribeEntries` still does the grant.

## Cart context

[src/contexts/CartContext.tsx](../../src/contexts/CartContext.tsx) — primary state. Optimistic mirror of the server cart (`user.cart`), synced through a pending-op queue; no browser storage. The TanStack `useCartQueries` layer exports an identically-named `useCart` and is **not** wired to anything — see [gotchas.md](./gotchas.md).

```ts
interface CartContextValue {
  items: CartItem[];
  addItem(item): void;
  removeItem(id): void;
  updateQuantity(id, q): void;
  clear(): void;
  // ...
  // Global sync flag — do NOT gate per-product buttons on this; see gotchas.md
  isLoading: boolean;
  // Per-product loading helpers — use these inside cards / detail pages
  isAddingToCart(productId: string): boolean;
  isUpdatingCart(productId: string): boolean;
  isRemovingFromCart(productId: string): boolean;
}
```

## Hooks

| Hook | Purpose |
|---|---|
| `usePurchaseInvalidation()` | Invalidates queries (orders, user, partner-discount queue) after purchase |

**Purchase-success portal CTA (2026-07-24, rewards-return):** `PurchaseSuccessClient` gained a third
CTA — **"Open partner portal" (renamed from "Back to the partner portal" — panel F-015: the CTA shows for every partner-bearing purchase, incl. buyers who never came from the portal, so "Back" presumed a journey many never took)** — rendered only when the webhook grant is confirmed
(`usePaymentStatus(...).data.processed === true`) AND `partnerDiscountSsoEnabled()` (the
`NEXT_PUBLIC_PARTNER_DISCOUNT_SSO_ENABLED` client flag). It triggers `usePartnerDiscountSso().mutate()`
(same SSO hand-off as RewardsPartnerCard) and, unlike that card, **renders `sso.error` inline** instead
of swallowing it. Gating on `processed` matters: access is granted by the async Stripe webhook, so the
CTA must not appear before the member could actually enter the portal at their new level.

## State conventions

- Cart in CartContext (client-state for in-flight cart)
- Products via TanStack Query (server-state)
- Orders via TanStack Query (server-state, refresh on purchase via `usePurchaseInvalidation`)
- No Zustand for cart

## Theming

The shop product detail page (`src/app/(site)/shop/[slug]/page.tsx`) and its components (`ProductInteractions.tsx`, `ProductTabs.tsx`) have full light/dark support. The convention used across the slug page is:

- Page wrappers / "white" surfaces → `bg-white dark:bg-neutral-950`
- Secondary surfaces (image frames, tab strip background) → `bg-gray-100 dark:bg-neutral-900`
- Card surfaces (review cards, info panels) → `bg-white dark:bg-neutral-950 dark:border-neutral-800`
- Primary text (`text-gray-900`) → also `dark:text-neutral-100`
- Secondary text (`text-gray-500`/`text-gray-600`, e.g. review meta, descriptions) → also `dark:text-neutral-400`
- Borders (quantity selector, trust-badge top border, dividers) → also `dark:border-neutral-700` / `dark:border-neutral-800`
- Hover states on neutral buttons (`hover:bg-gray-100`) → also `dark:hover:bg-neutral-800`
- Empty rating stars (`text-gray-300`) → also `dark:text-neutral-700`
- Strike-through prices (`text-gray-500`) → also `dark:text-neutral-500`
- Disabled button state (`bg-gray-300 text-gray-500`) → also `dark:bg-neutral-800 dark:text-neutral-400`

Match these classes when extending the slug page or adding new card-style sections under `src/app/(site)/shop/`.

## className conventions (2026-05-08)

Shop/cart components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Conversion tracking (Purchase)

`PurchaseSuccessClient.tsx` fires the browser Purchase pixel via `trackConversion(buildPurchaseEvent(...))` on mount, with `eventId = paymentIntentId` for browser↔server dedup. It passes `contentName: status.data.packageName` so the Purchase carries `content_name` on both the pixel and the server Events API/CAPI (same source as the server, so values match). The shop checkout success (`CheckoutSuccessClient.tsx`) fires the browser half; `finalizeShopOrder` fires the SERVER CAPI half from the Stripe webhook, both keyed on `orderNumber`. **Corrected 2026-08-21** — this line previously said shop was browser-only. Because Meta keeps only one of a deduped pair and which one is not ours to choose, the two halves must carry IDENTICAL custom_data; they disagreed on `num_items` (line count vs sum of quantities) and `content_ids` until the same date. Field-by-field reference: [docs/tracking/EVENT_PARAMETER_MATRIX.md](../tracking/EVENT_PARAMETER_MATRIX.md).

**Re-fire guard (2026-07-08):** both success clients wrap the fire in `shouldSuppressPurchasePixel` / `markPurchasePixelFired` from [src/utils/tracking/purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts) (localStorage key `purchasePixelFired_${eventId}` holding the first-fire time, pruned after 30 days; suppresses only re-fires older than 46h — younger ones are merged by Meta's dedup and double as delivery recovery). The old per-mount `firedRef` alone re-fired the Purchase on every remount (refresh, back-nav, history revisit); Meta's event_id dedup only lasts ~48h, so a revisit later than that counted as a brand-new conversion and inflated Meta-reported ROAS. The guard's `eventId` is `paymentIntentId` on `/purchase-success` and `order.orderNumber ?? orderId` on `/checkout/success`. First legitimate fire is unchanged. See the gotchas entry for why this matters most on the shop path.

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.

## 2026-07-31 — Purchase-success portal CTA uses the shared hand-off

[PurchaseSuccessClient.tsx](../../src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx)'s "Open partner portal" button now goes through `usePortalHandoff()` (consent sheet → transit takeover → redirect) rather than the bare SSO mutation, so a member who just bought a pack gets the same flow as on the Rewards page. Still gated on `status?.processed === true && partnerDiscountSsoEnabled()`. See [docs/partner/frontend.md](../partner/frontend.md).

## Purchase-success order receipt (2026-08-04)

`PurchaseSuccessClient.tsx` renders an order summary of what was actually bought: the pack name,
the amount paid, and the free entries granted, plus the PaymentIntent id as a reference.

Everything comes from the `usePaymentStatus` response already on the page — `packageName`,
`price`, `currency`, `entriesGranted` / `entries`. Before this the component fetched those fields
and used them **only** to populate the Purchase pixel; the page itself said nothing beyond
"Purchase Successful!". (An earlier line in this doc described the carry-over banner as sitting
"above the standard receipt" — there was no receipt until now.)

Two rules govern it:

- **Gated on `status.processed === true`.** The payment-status route omits `price`/`currency`
  until benefits are granted (see [payment/api.md](../payment/api.md)), so rendering earlier
  produces a receipt full of blanks. No receipt beats an empty one.
- **`entriesGranted` is preferred over `entries`.** The former is what the webhook actually wrote,
  the latter is the package's advertised figure. If they ever diverge, the receipt agrees with the
  member's wallet rather than the catalogue.

**Copy is legally constrained — CLAUDE.md rule 11.** Entries are a FREE INCLUSION with the pack,
never a purchased line item, so the layout deliberately separates them:

- the priced line is the **pack** (`Boss Pack … $125.00`), and the total is the pack's price;
- entries appear on their own line as *"Includes 150 free entries in this month's prize draw"*.

Never render entries as a priced line item, a per-entry rate, or part of a subtotal that implies
they were bought. If you add a tax breakdown, an emailed invoice, or a PDF later, the same split
applies there.

## The checkout-success shipping block is masked from session replay (2026-08-07)

`CheckoutSuccessClient.tsx` renders the recipient name and full delivery address — the highest
concentration of PII anywhere in the purchase flow, and it sits on a page every buyer reaches.
The address `<div>` carries `data-cs-mask`, so Contentsquare session replay masks it. The
`MapPin` icon and the **Shipping** label stay outside the masked element, so the block is still
recognisable in a replay.

Convention: [docs/shared-ui/frontend.md](../shared-ui/frontend.md). Mechanism:
[docs/tracking](../tracking/). Card details need no treatment — they are entered in a
cross-origin Stripe iframe and never enter our DOM. If you add an order-confirmation surface
that echoes the address (a PDF, an order-history detail view), it needs the same attribute.

## Variant selection on the product page (2026-08-17)

Apparel is sold by variant (size × colour), so the product page — not the grid card — is where
a customer chooses what they are buying.

**[ProductInteractions.tsx](../../src/app/(site)/shop/[slug]/components/ProductInteractions.tsx)**
renders a button-per-variant picker above the quantity selector, driven by
`activeVariants` / `variantLabel` / `isVariantPurchasable` from
[src/utils/shop/variants.ts](../../src/utils/shop/variants.ts). The chosen `sku` is passed to
`addToCart`.

Three behaviours worth knowing:

- **A product with no variants behaves exactly as before.** The picker does not render and the
  add-to-cart path is unchanged, so the existing tool catalog is unaffected.
- **"Made to order" replaces "Out of Stock" when `trackInventory` is false.** Print-to-order
  items carry `stock: 0` permanently; without this they would every one read as out of stock.
- **The add-to-cart button says *why* it is disabled** — "Choose an option" rather than a
  silently inert button. Unavailable variants render struck through and disabled rather than
  being hidden, so a customer can see their size exists but is currently unavailable.

**Grid cards navigate, they do not add.** `ShopContent`'s `handleAddToCart` was a `console.log`
TODO stub; it now routes to `/shop/{id}`. A card has nowhere to choose a size, so adding from
the grid would either guess a variant or create an unbuyable line.

> `/shop` and `/shop/[slug]` are both `force-dynamic` (nonce-CSP route class). Never add
> `generateStaticParams` — that exact mistake already shipped once on `/shop/brand/[brand]`.

## The free-entry badge on a product page (2026-08-17)

`ProductInteractions` renders "Includes N free entries" above the stock line, where
**N = includedEntries × quantity × the effective multiplier** — it updates live as the customer
changes quantity.

The *effective* multiplier is the current one-time promo rate lowered by any admin ceiling in
force (2026-08-20). The split is deliberate: the **server** resolves the ceiling — two of its
three tiers, category and shop-wide, are admin config the browser has no business reading in
full — and passes it down as a single `entryMultiplierCap` prop; the **client** keeps reading
the live promo rate and applies `applyShopEntryCap`, the same function the grant calls. So the
page and the webhook cannot disagree even though they read at different moments.

**Why the multiplier is in the displayed number.** The grant multiplies too, so a page printing
the bare `includedEntries` would understate the offer during a promo (page says 8, buyer receives
40) and overstate it if the promo lapsed between add-to-cart and payment. Both sides resolve
through the *same* server chain, so they cannot disagree:

```
page  → useResolvedMultiplier("one-time-packages")
      → /api/promo/alternating-multiplier/current
      → getEffectiveMultipliers() → getResolvedMultiplierWithSource()
grant → getActivePromoMultiplier("one-time") → resolveMultiplierForPayment()
      → getResolvedMultiplierWithSource()      ← same function
```

**Do not "fix" the hook to honour its `context` argument.** `useResolvedMultiplier(type, context)`
ignores `context` entirely; the body always reads the effective-multiplier endpoint. That is
correct here. The function it *looks* like it should call, `resolveMultiplierForDisplay`, stops at
active-promo → alternating and never reaches the `derived-from-membership` branch — during a
membership-only promo it returns `null` while the payment path returns 5.

Two further traps, both verified: `applyPromoToPackage` (`src/data/membershipPackages.ts`) reads
exactly like the shared helper this wanted and has **zero callers** — do not wire money math to
it. And the client's rendered number is display only; it is never an input to a grant.

**Nothing renders at `includedEntries: 0`** — the state the feature ships in until the permit
lands. No badge, no promise, no copy to retract.

The route is `force-dynamic` (for the nonce-CSP route class, not for us), so the count cannot be
frozen into cached HTML across the start or end of a promo. If a future perf pass removes that,
the entry count silently freezes with it.

Rule 11: the badge states a free **inclusion** with the product. Never add a per-entry figure or
a dollar-to-entry rate. `/shop` is now in the e2e legal-copy scan's `PAGES` list — it was not
before, so a per-entry price on a product page would have passed every automated guard in the
repo purely because the list did not mention it.

## Shipping copy is derived from config, not typed (2026-08-17)

`FREE_SHIPPING_THRESHOLD_LABEL` and `FLAT_SHIPPING_RATE_LABEL` (`src/config/shop.ts`) exist so no
page restates a money figure. The product page previously promised free shipping **"over $99"**
while `priceCart` charges flat shipping on anything under **$100** — a $99.50 order was told
delivery was free and billed $10 at checkout.

The same block advertised **Express Shipping $15** and **Same Day Delivery $25** in three cities.
Neither exists anywhere in the pricing path: checkout can only ever produce $0 or the flat rate.
Both were removed rather than reworded — they were template copy promising services the business
does not sell.

## Shop hero (2026-08-17)

The hero's overlay div was commented `{/* Background Image with Dark Overlay */}` and carried
**no background class at all** — `className="absolute inset-0 "`. Hero copy sat directly on a busy
photograph, and on a phone the title and strapline collided into an unreadable block.

It now uses `bg-black/50`, copied from
[`MiniDrawsHero.tsx`](<../../src/app/(site)/mini-draws/components/MiniDrawsHero.tsx>) rather than
invented, plus that hero's mobile rhythm (`pb-5 sm:pb-14`, gap and margin tightened at the small
breakpoint). The shop and mini-draws heroes should stay visually interchangeable.

## Alignment with mini-draws — what matches and what does not

The shop listing already shares the mini-draws skeleton: left filter rail, "Browse …" header with
subtitle, search field, grid/list toggle, sort dropdown. **This is deliberate — do not redesign
the shop as its own thing.** The remaining differences are the work, not the layout:

| | Mini-draws | Shop | Status |
|---|---|---|---|
| Hero overlay | `bg-black/50` | `bg-black/50` | aligned 2026-08-17 |
| Mobile filters | Horizontal scrolling **brand chip row** | Single "Filters" drawer button | **open** |
| Empty state | Icon + "Try a different brand or clear your filters" | Nothing rendered | **open** |
| Facets | Brands, drawn from real data | Hard-coded power-tool categories (`Power Tools`, `Cutting Tools`) and a `Tool Style` group (`DIY`, `Heavy Duty`) | **open** — merchandise is unfilterable, and the brand list has no `Tools Australia` entry |

## The free-entry badge

`ProductInteractions` renders it above the stock line. See
[the entry-count section](#) in this file and `docs/cart-shop-products/backend.md` for why the
multiplier is included in the displayed number and why the page must stay dynamic.

## Filter facets are derived, never hard-coded (2026-08-17)

`ProductFilters` used to declare three literal arrays: eight tool categories
(`Power Tools`, `Hand Tools`, `Cutting Tools`…), five tool brands (`DeWalt`, `Makita`…), and a
`Tool Style` group (`Professional`, `DIY`, `Industrial`, `Compact`, `Heavy Duty`). None of them
was connected to the database.

**The shop sells apparel — tools are prizes, not stock.** So every one of those facets returned
zero results forever, while the two things a merchandise shopper actually filters by (size and
colour) were absent entirely.

Facets now come from `useShopFacets()` → `/api/products/categories`, which already computed
distinct categories, brands and a price range from active products and simply was not being used.
Size and colour were added to it, aggregated from `variants[]` with `variants.isActive != false`
so an inactive size is never offered as a filter that returns nothing.

Today the rail renders **Apparel / Tools Australia / XS S M L XL / Black**. If the catalogue ever
grows, the rail grows with it — there is nothing to keep in sync.

**Sizes sort in garment order, not by frequency.** Aggregation returns them by count, which put
"S, M, L, XS, XL" in front of customers — every value correct, and it still reads as broken.
Unrecognised sizes keep their frequency position at the end of the list.

### Why not a separate `/shop/merch` view, and why not an "Apparel" category

Both were considered and rejected:

- **A separate merch view** forks a route, filter set, card path, test suite and docs for a
  catalogue that *is* the entire catalogue — `/shop` would show nothing and `/shop/merch`
  everything. Two names for one concept (see the naming rule in the user-level CLAUDE.md).
- **An "Apparel" category beside "Power Tools"** promises siblings that will never have stock. A
  customer filtering to Hand Tools gets zero results permanently.

Deriving the facets is also the least code of the three: it deleted three arrays and reused an
endpoint that already existed.

### `FilterState` shape change

`styles: string[]` became `sizes: string[]` + `colours: string[]`, in both `ProductFilters` and
`ShopContent` (each declares its own copy of the interface — they must move together; `tsc`
catches it because the prop is passed between them).

**Do not reuse `useProductCategories`** in `useProductQueries.ts` — it is typed
`{ success, data: ProductCategory[] }`, which has never matched what
`/api/products/categories` actually returns. `useShopFacets` is the correctly-typed accessor.

## Sticky columns — and why the wrapper is not optional (2026-08-17)

The product image and the checkout order summary both follow the scroll on desktop, matching the
mini-draw detail page.

Three things are load-bearing, and the first two are copied verbatim from
[`mini-draws/[id]/page.tsx`](<../../src/app/(site)/mini-draws/[id]/page.tsx>):

1. **`overflow-x-clip`, never `overflow-x-hidden`, on the page root.** `overflow-x: hidden`
   computes `overflow-y: auto`, which makes that element the scroll container and stops `sticky`
   engaging at all. `clip` suppresses horizontal overflow without creating a scroll box.
2. **A wrapper around the sticky element.** `sticky` applied directly to a grid item collapses it
   to content height and never engages. The pattern is an outer `lg:self-stretch` div containing
   an inner `lg:sticky lg:top-24`.
3. **The other column has to be taller than the sticky one.** A sticky element can only travel
   inside its own grid row.

Point 3 is the one that bites, because the first two can be right and it still looks broken.
`ProductTabs` used to render *below* the grid, so the two columns were near-equal height (692px
against a 579px image) and the image scrolled away after ~113px — sticky was correctly applied
and did almost nothing. Moving the tabs **inside the right column** is what gives it travel, and
is how mini-draws was already built.

Verified by measurement, not by eye: at 300px and 600px of scroll the image holds its position
completely (`e2e-artifacts/tmp/sticky3.mjs` pattern — compare the element's `y` against
`y0 - scrollDistance`).

## Signing in at the point of purchase

`SignInToBuyModal` (`src/components/modals/SignInToBuyModal/`) replaces the native
`alert("Please log in to add items to cart")` that used to fire from the product
page. A browser dialog was wrong three ways: it rendered as an OS chrome box over
a dark themed page, it offered no way to actually sign in, and dismissing it lost
the colour and size the customer had just chosen.

**Email-first, by necessity.** `LoginModal` takes an `email` prop and is a
complete in-place portal from there — password, Google, or a one-time code posted
to that address. So the sheet collects the address and hands over. Nothing
navigates, and the variant selection survives.

**Creating an account still leaves the page, deliberately.**
`/api/auth/register` mints no session, and all three existing session bridges
refuse a brand-new non-member (`auto-login` wants a paid PaymentIntent,
`verify-email` wants `hasMembership`, `send-login-code` wants `isEmailVerified`
which defaults false). Signing someone up in place therefore needs a new auth
endpoint — an auth-surface change that gets its own review and its own
`docs/auth/` + `CUSTOMER.md` updates rather than riding in on a shop ticket. The
sheet links to `/login` with a `callbackUrl` back to the product until then.

The failure path on add-to-cart uses the repo toast for the same reason; there are
no `alert()` calls left in the shop flow.

## Reviews are gated on a real count (2026-08-19)

`Product.reviewCount` now exists on the schema. Four surfaces gate their star
display on the same rule — at least one review AND a 4-star average — and the
listing card could not apply it without a count, because projecting the whole
`reviews` array into a list query would ship every review body and every
reviewer's user id to the browser.

It is written as `reviews.length` from the array the write returns, alongside the
recomputed `rating`, **never incremented**. An earlier `reviewCount` was read by
six paths and had never existed on the schema, so Mongoose silently dropped every
write and it read 0 forever. Derived from the same array as the average, the two
cannot disagree.

`colourways` is deliberately absent from the list projection: only the product
detail page renders them, and on a 51-colour tee it is the heaviest field on the
document.

## The storefront sort default — why a server default was not enough (2026-08-20)

Reordering the catalogue in admin appeared to do nothing on `/shop`, even though the
positions saved correctly.

`ShopContent` holds its sort in state and forwards **every** filter to `/api/products` as a
query parameter. It initialised to `"createdAt-desc"`, so the request always carried an explicit
`sortBy` — and making `displayOrder` the API's Zod default therefore had no effect whatsoever.
**A server-side default cannot fix a client that never omits the parameter.**

The fix is a `Featured` option (`displayOrder-asc`) at the head of `sortOptions`, and
`DEFAULT_SORT = sortOptions[0].value` used for the initial state, the reset handler and the
has-controls-applied check. Those three were separate string literals before, so changing the
default meant changing three unrelated lines — and missing one left the "Clear" affordance
disagreeing with what was actually applied.

**The order is not visible instantly, and the admin copy says so.** Three layers of caching sit
in front of it:

| Layer | Setting |
| --- | --- |
| Next route segment | `export const revalidate = 60` |
| CDN | `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` |
| TanStack Query | `staleTime: 5 * 60 * 1000` |

A new visitor sees the change within about a minute; someone with the page already open can hold
the old order for up to five. The save confirmation deliberately says "within a few minutes"
rather than "now" — promising immediacy here is what makes a working feature read as broken.

Verified end-to-end: reversing the order through `POST /api/admin/products/order` flipped the
storefront from `Alpha, Bravo, Charlie, Delta` to `Delta, Charlie, Bravo, Alpha`, with a control
query on `createdAt` returning a genuinely different order to prove the fixture discriminated.

## Shop layout: sticky rail and uncropped photos (2026-08-20)

**The filter rail follows the scroll**, matching `MiniDrawsContent`. `sticky top-24` goes on an
INNER div — making the flex column itself sticky pins a box whose height is the whole column,
which has nowhere to travel. `max-h-[calc(100vh-8rem)]` with `overflow-y-auto` keeps a long brand
list scrolling inside the rail rather than making the rail taller than the viewport, at which
point sticky has nothing left to hold.

**Nothing is cropped.** `object-cover` was used for tools on the theory that they are shot to fill
the frame; supplier photography is not that consistent, and cropping a drill through the chuck
reads as a broken image rather than a tight one. Every card is `object-contain` on a painted
ground — a contained photo does not fill its box, and a bare card background behind a product
cut-out looks like a rendering fault.

**A debugging note that cost time here:** the rail appeared not to stick, and the ancestor chain
was clean of the usual sticky-killers (`transform`, `filter`, `contain`, `overflow`). The real
cause was the test: only one product had loaded, so the flex row was 778px and the rail had 185px
of travel before running out. With 12 products the row is 2371px and the rail pins correctly at
y=96. **Check the containing block's height before hunting for an overflow ancestor** — sticky
with nowhere to travel looks identical to sticky that is broken.

## Checkout: editable order, discount before commit, and the pay flow (2026-08-20)

**The member discount is shown before the customer commits.** `CartContext` deliberately leaves
`summary.discount` at 0 — it has no session and cannot know the tier — which was fine while the
summary was a badge. On checkout it meant the undiscounted total stood until *Continue to payment*,
at which point it dropped. A total that changes after you commit to paying is the wrong moment to
be surprised. `CheckoutClient` now computes a preview from `resolveShopDiscountPercent(userData)`.

`serverTotals` still wins the instant it exists: the server prices from the catalogue and is the
only figure the PaymentIntent is built from. The preview is a figure that happens to agree, not a
second source of truth.

**The order is editable until the PaymentIntent exists, and frozen after.** Quantity controls and
Remove sit on each line, with an "Add more items" link back to the shop. Once `clientSecret` is
set the controls are replaced by a plain quantity and a notice, because changing the cart while
Stripe holds an amount would leave the customer paying the old total for a different cart — the
intent is created from server-priced lines at Continue and nothing re-prices it.

**Saved cards** come from a Stripe **Customer Session** (`customerSessions.create`, Basil), passed
to `<Elements>` as `customerSessionClientSecret`. That is Stripe's supported mechanism for
redisplaying saved methods in `PaymentElement`. The alternative — the hand-rolled picker in
`StripePaymentModal` that confirms with an explicit `payment_method` — predates PaymentElement and
reimplements selection, removal and the new-card form by hand; bolting it on would mean two
payment UIs for one checkout.

`payment_method_save` is **disabled**: a shop purchase is one-off and silently storing a card is
not something the buyer asked for. Cards saved by the membership flow are redisplayed, which is
the case that matters. The session call is non-fatal — without it PaymentElement still renders a
card form, and failing checkout because a convenience could not be set up is the wrong trade.

**The pay flow is confirm → processing overlay → success breakdown → success page.** The overlay
covers the form (never unmounting the Element mid-confirm) because a 3DS challenge is an
open-ended wait and a form that still looks editable invites a second submit. `SuccessScreen` —
the same component the membership and pack flows use — then holds for three seconds with the
order's own figures. It acknowledges the PAYMENT; the order is still finalised by the webhook, and
the success page it lands on is what reads the finished order.

## The checkout-success page states the order's ACTUAL state (2026-08-21)

`CheckoutSuccessClient.tsx` renders three states off `isOrderPaid(order)` + `status === "cancelled"`,
and everything money-shaped on the page follows that split rather than assuming a sale:

| State | Headline | Total labelled | "paid by card" | Entries badge | "What happens next" |
| --- | --- | --- | --- | --- | --- |
| paid | Order confirmed | Total paid | yes | when `entriesGranted > 0` | yes |
| pending | We're confirming your payment | Order total | **no** | no | no |
| cancelled | This order was cancelled | Refund issued | **no** | no | no |

Two rules behind that table, both of which the page previously broke:

- **Never claim a payment that has not settled.** `pending` means the webhook has not landed, so
  nothing has been captured; `cancelled` means the money has gone back. "Total paid" and "paid by
  card" are assertions about a completed charge and are withheld in both. The GST line still
  renders — it is the composition of the order total, not a claim that the total was collected.
- **"Refund issued", not "Refunded".** The cancel path in `finalizeShopOrder` attempts the refund
  and swallows a failure, so the refund is the intent and not a guarantee. See
  [gotchas.md](gotchas.md).

The page also shows the **whole money breakdown** — subtotal, each `appliedDiscounts` row, shipping,
total, and the GST inside it — not just a total. GST is **inside** `totalAmount` (never added), so it
is stated beneath the total as a note rather than as a row that would break the arithmetic on screen.

The page metadata title is deliberately neutral (`"Your order | Tools Australia"`). It is static
metadata and cannot branch on the order, so the old `"Order Confirmed"` sat in the browser tab above
a cancelled, refunded order.

Both themes are complete: every tone in `statusHeader` carries a `dark:` counterpart, and the page
shell + Suspense fallback in `page.tsx` paint `dark:bg-neutral-950`. A `text-green-600` with no dark
pair is exactly what made the headline disappear into its own ground.

## Checkout remembers the address, and offers wallets (2026-08-21)

### The address is typed once

Three layers, in priority order when prefilling:

1. **`sessionStorage` draft** (`utils/shop/checkout-address-draft.ts`) — what this person was
   typing before they refreshed. Newer than anything stored, and losing it is the part that
   actually annoys.
2. **`User.shippingAddress`** — where their last **paid** order went. Written by
   `finalizeShopOrder`, not at checkout-start, so an abandoned attempt can never overwrite
   the address that received goods.
3. **Profile first/last name**, so even a first-time buyer types less.

The prefill effect runs **once**, guarded by a `prefilled` flag: `userData` resolves
asynchronously, and an effect keyed on it would re-run on every refetch and overwrite live
typing. The draft is written on every change *after* the prefill has run — writing before it
would persist the empty form over a real draft.

**Privacy:** a delivery address is PII, so `ta-checkout-address-draft` is registered in
`USER_SESSION_KEYS` in `utils/auth/total-sign-out.ts`. Without that, the next person to sign
in on a shared device would find the previous customer's home address already in the form.
The draft is cleared on payment too — the durable copy is on the user document by then.

### Wallets and saved cards

`ExpressCheckoutElement` renders **above** the card form — Apple Pay, Google Pay and Link, one
tap. It is a separate Element from `PaymentElement` deliberately: rendering wallets as tabs
*inside* the payment element buries them behind a click, and skipping the form is the entire
value of a wallet. Both share the one PaymentIntent.

The "or pay by card" divider is conditional on `onReady` reporting `availablePaymentMethods`.
Apple Pay needs Safari + HTTPS + a Stripe-registered domain; Google Pay needs a card in the
browser profile. On a machine with neither the element renders nothing, and an unconditional
divider would sit under empty space.

**One confirm path** serves both, parameterised by source — a wallet payment and a card
payment differ only in which Element collected the details, and duplicating the confirm is how
the two drift on `return_url` or error handling. `payment_method_data.billing_details` is sent
on the **card path only**: wallets supply their own billing details from the device.

`fields.billingDetails.address: "never"` removes Stripe's own country/postcode block, because
this page already collected a validated Australian address — Stripe's duplicate country
selector was defaulting off IP and offering a Sydney buyer "Philippines". Hiding those fields
**requires** passing `billing_details` on confirm, or confirmation fails.

`payment_method_save: "enabled"` on the Customer Session puts a "Save payment details for
future purchases" checkbox in the form, so a card entered once is redisplayed next time. The
buyer chooses — nothing is stored silently.

> Saved cards only redisplay if the stored payment method carries `allow_redisplay` of
> `always` or `limited`. A card saved by an older flow without it will not appear, however
> correct the Customer Session is.

## The cart line carries its variant in human terms (2026-08-21)

Checkout was showing the raw sku — `ajrAx-2XL-Bot8043-BAC-2_11` — under the product
name, because that was the only variant information the cart line held.

`colour` and `size` are now snapshotted onto the cart line at add-to-cart, from the
variant the route has already looked up and validated. Snapshotted rather than joined on
read, for the same reason the **order** line snapshots them: the cart's product projection
carries no variants, and a 383-variant garment is not something to ship to a browser to
resolve one label. Joined at `[colour, size].join(" · ")` — colour first, matching the
order-history list and the confirmation email, so one purchase never reads as two
different variants on two screens.

Falls back to the sku for lines added before the fields existed.

> Both are declared on the cart subdocument in `models/User.ts`. Mongoose strict mode
> drops unknown keys **silently on save** — the same footgun the `sku` note there was
> written for.

## The order summary links to the product (2026-08-21)

The image and the name link to `/shop/[id]`, and the variant line carries a **Change**
link to the same place (hidden once the PaymentIntent exists and the cart is frozen).

Change goes to the product page rather than opening a picker in the summary. That is where
the variant picker already lives — colourway swatches with their own photography, the size
grid, stock state — and a second picker in the checkout column would be a copy to keep in
step with the first, for a garment that can carry 383 variants.

## The drawer scrims were inert (2026-08-21)

Both the mobile menu and the cart drawer rendered a full-screen `bg-black/50` scrim with
**no click handler**, so the only way out was the X. A full-screen dark overlay reads as
dismissable to everyone.

Both are now buttons routing through the existing `handleCloseMobileMenu` /
`handleCloseCart`, so the slide-out animation still plays rather than the panel vanishing.

## The badge system (2026-08-25 redesign)

Badges used to accumulate until they collided — a discount chip, an entries chip and a
stock chip competing in one corner of a card 189px wide. The redesign is **two axes, two
corners, a hard cap**, and it lives in
[`src/components/shop/ProductBadges.tsx`](src/components/shop/ProductBadges.tsx).

**Commerce claims** — scarcity, price, hype, merchandising — sit **top left**, ranked in
that fixed order, and never exceed **two**; a third collapses into a `+N` chip.
**Entries** sit **top right**, on their own axis.

That separation is a rule-11 safeguard, not a layout preference. An entries badge ranked
beside a discount badge invites reading one against the other as a rate, and entries are
a free inclusion that is never priced. Keep the corners separate in anything that
consumes this.

**Fulfilment is not a badge.** `In stock` / `Only N left` / `Made to order` / `Sold out`
render as a coloured dot plus text in the card body — a fact about the item, not a
merchandising claim. As a chip it competed with the discount for the same attention.

**Three badges have no data source.** `HOT`, `SET` and `BACK IN STOCK` are in the rank
table because the *order* is the design decision worth recording, but `Product` carries
no field for any of them (verified against the model). No caller passes them, so nothing
speculative renders; when a field lands it is one argument at the call site.

The cap, the rank and the overflow count are asserted in
`npm run test:shop-badges` — all three fail silently rather than throwing.

## `ShopProductCard` vs `ui/ProductCard`

`ui/ProductCard` renders **both** shop products and mini-draw packs from one 1000-line
body, and the two have divergent rules: entry packs have no variants, no stock, no member
discount and a different CTA. The redesigned badge system, the variant-aware CTA and the
member price block apply only to the shop half, so the shop path forked into
[`ShopProductCard`](src/components/shop/ShopProductCard.tsx) rather than branching that
component further. Mini-draws still use the original, untouched.

Two behaviours worth knowing:

- **A variant product is not addable from a grid.** The purchasable unit is a variant
  (size × colour), so its card routes to the detail page. Adding "a hoodie" would have to
  guess a size, and the server rejects an unknown sku with a 400 anyway.
- **Adding is not a dead end.** Once an item is in, the button becomes the route to the
  cart and the toast carries a `View cart` action. Previously the button said "Added" and
  offered nothing to do next.

The card gates on `isAddingToCart(productId)` plus a local `justPressed` flag — never on
`useCart().isLoading`, which is the global sync flag and would freeze every button on the
page. The local flag covers the window before the optimistic op is queued; without it a
second tap starts a second add, and `POST /api/cart` is additive.

## Price emphasis follows the reader

[`PriceBlock`](src/components/shop/PriceBlock.tsx) moves the emphasis rather than showing
one layout to everyone. A **member** sees their price as the headline with the RRP struck
through beside it — the big number is the one that leaves their account. A **guest** sees
the RRP as the headline, because that *is* their price, with the member figure as a gold
invitation. Striking through the price a guest actually pays reads as a discount they
already have.

The discount **badge** is gated on the viewer actually being a member, unlike the
prototype which showed it on every card. To a guest, `10% OFF` claims a price they cannot
get.

## Shop controls (2026-08-25)

**Active-filter pills.** The filter button's count says *how many* constraints are on; it
never said *which*. Narrowing to zero results left no way to see what was excluding things
short of opening the sheet and reading it back. Each pill now drops exactly its own
constraint — "clear all" is the wrong granularity once four facets are stacked.

**The empty state names the constraint.** A failed *search* and a failed *filter* are
different situations and one message helps neither:

| Situation | Heading | Body |
| --- | --- | --- |
| Search found nothing | `Nothing matches "hoodie"` | Check the spelling, or try a broader word. |
| Filters exclude everything | `Nothing in this filter` | Nothing in the shop matches every filter you have on. |
| Catalogue genuinely empty | `Coming Soon` | (unchanged — the only case that may say this) |

The third branch already existed and is the one that must never be shown for the first
two: telling someone who searched "hoodie" that the shop does not exist yet is how that
bug read before.

**The view toggle is gone.** Grid/list was removed on both breakpoints — the redesign's
control row is search, filter and sort, and a list view of an image-led card is a second
layout to maintain for a mode the design does not have.

## Variant gating on the product page (2026-08-25)

The purchasable unit is a variant, so the page must not let anyone buy before one is
resolved. Three things changed.

**A partial selection no longer resolves a variant.** `findVariantByOptions` used to
`find` the first match, so colour-without-size collapsed the predicate to
`v.colour === "Black"` and returned Black/S. The add button went live — and would have
added a size the customer never picked — while the page was still asking them to pick one.
It now returns a variant only when the selection narrows to **exactly one candidate**,
which needs no special case for how many axes a product uses: a colour-only product with
one variant per colour still resolves on colour alone, because that genuinely narrows to
one. Six assertions in `npm run test:shop-variants` cover it.

**The CTA names what is missing** — `Pick colour & size` → `Pick a size` → the chosen
variant — and the sticky bar's sub-line reads from the same value, so the two cannot
disagree. This is **gated on `hasColourways`**, which is the subtlety: there are *two*
variant pickers, colour-then-size for apparel and a flat list of whole variants for the
tool catalogue. On the flat path there is no colour row to point at, so it keeps
`Choose an option` — naming controls that are not on the page is worse than being vague.

**Withdrawn sizes render struck through rather than vanishing.** Sizes are listed from
*all* variants (`sizeHost`) while selection still resolves against the active ones. A
shopper looking for XL can now see it exists and is unavailable, instead of wondering
whether it was ever made.

> **`isActive` is the only per-variant availability signal.** `Product.variants` stores
> `sku / size / colour / gtin / isActive` and **no stock** — stock is a product-level
> fact, so a single size cannot be out of stock on its own. `isVariantPurchasable`
> checking `host.stock` is correct for this model, not a bug. (Worth stating because
> seeding a `stock` onto a variant through the *native driver* does persist it, while
> Mongoose never reads it back — which makes it look like a bug for exactly as long as it
> takes to check the schema.)

**A sticky bottom bar** carries the price and the CTA on mobile. The add button sits below
the description, the spec grid and the related rail, so a shopper who scrolled to read
about the product had to scroll back up to buy it.

## Cart drawer (2026-08-25)

**The sku is part of the React key.** Cart line identity is `(productId, sku)`, so two
sizes of one hoodie are two lines — and they shared a key without it. React reconciles
them as one, so a quantity typed into Black L could paint onto Navy XL.

**The variant is named on the line.** Two sizes of the same product are two rows with the
same name; without the `colour · size` line the cart shows what looks like a duplicate and
the only way to tell them apart is to remove one and see what vanishes.

**Stepping below one removes the line.** A minus button that stops responding at 1 reads
as broken, and it left the bin icon as the only way out of a line already decided against.

Thumbnails are `object-contain` — product shots sit on white and `cover` cropped the
garment.

> **The design's free-delivery progress bar is not implementable and was not built.**
> It reads `$N to free delivery` / `Free delivery unlocked`, which requires a threshold.
> Delivery is a flat $10 on every order as of 2026-08-25 (see `backend.md`), so there is
> no threshold to progress toward. The cart states the flat charge in the totals instead.

## `/my-account/orders` — search, filters, Buy again (2026-08-25)

**Search matches the order number *and* the item names.** People hunt for "hoodie", not
`SHOP-20260821-KU8AIR` — the number is what they have when support asks for it, not what
they remember.

**Status chips** are All / Being made / On its way / Delivered / Cancelled. `pending` and
`cancelled` stay absent from the *progress strip* — one is webhook latency, the other an
exit from the journey — but both are filterable, because "where is my refund" is a real
reason to come here.

**A live count** reads `3 of 4 orders` when narrowed and `4 orders` when not, and the
controls only appear above more than one order — a search box over a single order is noise.

**The filtered-empty state is distinct from having no orders.** This customer *has*
orders; telling them they have none is both wrong and alarming. It names the constraint —
`Nothing matches "…"` or `No delivered orders`.

**Buy again** appears only on **delivered** and **cancelled** orders: one is where wanting
another is ordinary, the other is where they wanted it and did not get it. On an order
still being made it would invite buying a second copy of something already paid for and in
transit. It routes to the shop rather than re-adding lines — sizes sell out and prices
move, and silently filling a cart from a months-old order is a decision made on the
customer's behalf.

## Checkout address validation (2026-08-25)

Validation is **per field, on blur** — not on submit. Pressing Continue and being told
"the form is wrong" makes someone hunt for which field; a message under the field they
just left names it while they are still looking at it. Nothing is marked until it has been
blurred at least once, so an untouched form is never covered in red.

`Continue to payment` marks **every** required field touched at once, because someone who
never entered a field never blurred it — without that the form would refuse to proceed
while showing no message anywhere, which is the worst version of a validation failure.

> **The form carries `noValidate`, and it is load-bearing.** Without it the browser runs
> its own constraint check first, **refuses to fire `submit` at all**, and shows a native
> bubble on the first invalid field — so `startCheckout` never runs, nothing is marked, and
> none of the messages below ever appear. This cost a debugging round: the per-field
> messages worked (they fire on blur) while the submit path silently did nothing, which
> looks like a state bug rather than a form-attribute one. The `required` attributes stay
> for assistive tech; they just no longer block the handler.

Postcode enforces four digits with the message `Four digits, e.g. 3220`. The example earns
its place — "four digits" alone leaves someone wondering about leading zeros, which
Victoria and the NT both use.

## Two bugs the grid shipped with (fixed 2026-08-25)

**A signed-out add hung the button forever.** The cart lives on the server, and
`CartContext`'s drain effect starts with a `userId` guard — so adding while signed out
queued an operation that could never drain. The optimistic line appeared, the button
flipped to "In cart · add another", and its spinner ran against a sync that would never
happen. The product page already guarded this with `SignInToBuyModal`; the card did not.
It does now.

**Every garment was treated as a simple item.** `LIST_FIELDS` deliberately excludes
`variants` — hundreds of rows per tee for a card that renders none — so the grid saw
`variants: undefined`, decided nothing had variants, and added garments with **no sku**.
`POST /api/cart` correctly rejects that, which is the request the spinner was waiting on.

The projection now carries `variants.isActive` and the route derives a `hasVariants`
boolean, dropping the array before the response is built: the browser gets one boolean,
not the rows. Verified — `'variants' in product` is `false` on the wire while
`hasVariants` is correct per product, and a variant card navigates to the PDP instead of
adding.

## The toast moved to the bottom left (2026-08-25)

Bottom **left** specifically: the bottom right is Cobber's corner, and a toast landing
there covered the support bubble. Newest sits closest to the bottom edge
(`flex-col-reverse`) — with a bottom-anchored stack the eye starts at the edge, so the
most recent message should be the first it reaches. The entrance rises rather than sliding
in from the right, which from this corner would read as the toast crossing the page to get
there.

## Toast position is route-scoped (2026-08-25)

**Top right everywhere, bottom left on `/shop*`.** The shop is the one surface whose
toast carries an action worth pressing — the add-to-cart `View cart` — so it belongs near
the goods rather than up by the header. Bottom *left* rather than right because the bottom
right is Cobber's corner, and a toast there lands on the support bubble.

Everywhere else keeps its original top-right position: those toasts are mostly errors and
confirmations that get read and dismissed, and moving all of them to serve one page would
be a site-wide change to fix a single surface.

Scoped by `usePathname` inside `ToastContainer` rather than a prop — the provider mounts
once at the app root, so a prop would have to be threaded from a layout that knows nothing
about which page is rendering. The entrance direction follows the corner: bottom-anchored
toasts rise, top-right ones still slide in from the right.

**The action is a button now, on the right.** It was a blue text link stacked under the
message, where it read as part of the copy rather than the thing to press.

## The cart badge pops on an add (2026-08-25)

Adding from the grid announced itself with a toast in the opposite corner, which says
*something* happened but not that the **cart** changed — the number just quietly differed
next time you looked. `.ta-cart-pop` fires only when the count **goes up**: a removal
should not celebrate, and firing on every change would pop while someone steps a quantity
down. Reduced-motion gated; the count still updates, it just stops jumping.

## Product page structure (2026-08-25)

The price uses the same `PriceBlock` as the cards, so the PDP and a listing card cannot
describe one discount two different ways. It renders through `ViewerPriceBlock`, a thin
client wrapper — **the product page is a server component and cannot read the session, and
`user={null}` is not a neutral default**: it renders the guest treatment, so a Foreman
would be shown the full price and invited to join and save a discount they already hold.

**The description moved below the pickers** and is titled "The detail". Someone on a
product page is choosing a size, not reading — the copy pushed the colour row and the buy
button down a screen on mobile for text most buyers skim after they have already decided.

Picker labels are uppercase eyebrows with the prompt on the **right** (`COLOUR` … `Pick
one`). Folding both into one sentence — "Colour: choose one" — made the instruction read
as a value, as though the colour were named "choose one", and left nothing to change once
a colour was picked.
