# Cart-Shop-Products — Frontend

## Pages

- `src/app/(site)/shop/` — product list
- `src/app/(site)/checkout/` — cart + payment
- `src/app/(site)/purchase-success/` — post-purchase. `PurchaseSuccessClient.tsx` reads `wasRecentResubscribe`, `lastMonthAccumulatedEntries`, and `entriesGranted` off the `usePaymentStatus` response (see [payment/api.md](../payment/api.md#get-apipayment-statuspaymentintentid--completed-branch-fields)) and, when all three are present and `wasRecentResubscribe === true`, renders a **"Welcome back!" carry-over banner** above the standard receipt. The banner lead line reads "Your **N** accumulated entries carried over." (where `N = lastMonthAccumulatedEntries − entriesGranted`); the word "previous" was dropped 2026-05-21 to align with the "accumulated entries" copy used by the resubscribe tier picker. The banner also shows this month's grant (`entriesGranted`) and the next-month renewal preview so a returning member who sees only e.g. 150 entries on the page understands their prior 1000 carried over. Plain text (no emoji per project rule). Math is unchanged — `calculateResubscribeEntries` still does the grant.

## Cart context

[src/contexts/CartContext.tsx](../../src/contexts/CartContext.tsx) — primary state. Persists to localStorage.

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

`PurchaseSuccessClient.tsx` fires the browser Purchase pixel via `trackConversion(buildPurchaseEvent(...))` on mount, with `eventId = paymentIntentId` for browser↔server dedup. It passes `contentName: status.data.packageName` so the Purchase carries `content_name` on both the pixel and the server Events API/CAPI (same source as the server, so values match). The shop checkout success (`CheckoutSuccessClient.tsx`) is browser-only (no server CAPI today), so it has no `content_name` parity requirement. Field-by-field reference: [docs/tracking/EVENT_PARAMETER_MATRIX.md](../tracking/EVENT_PARAMETER_MATRIX.md).

**Re-fire guard (2026-07-08):** both success clients wrap the fire in `shouldSuppressPurchasePixel` / `markPurchasePixelFired` from [src/utils/tracking/purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts) (localStorage key `purchasePixelFired_${eventId}` holding the first-fire time, pruned after 30 days; suppresses only re-fires older than 46h — younger ones are merged by Meta's dedup and double as delivery recovery). The old per-mount `firedRef` alone re-fired the Purchase on every remount (refresh, back-nav, history revisit); Meta's event_id dedup only lasts ~48h, so a revisit later than that counted as a brand-new conversion and inflated Meta-reported ROAS. The guard's `eventId` is `paymentIntentId` on `/purchase-success` and `order.orderNumber ?? orderId` on `/checkout/success`. First legitimate fire is unchanged. See the gotchas entry for why this matters most on the shop path.

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.
