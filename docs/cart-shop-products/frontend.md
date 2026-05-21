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
| `usePurchaseInvalidation()` | Invalidates queries (orders, user) after purchase |

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
