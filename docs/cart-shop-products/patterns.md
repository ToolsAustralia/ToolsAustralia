# Cart-Shop-Products — Patterns

## P1. Cart in Context, products in TanStack Query

Server-state (products) goes through TanStack Query. Client-state (cart) goes through React Context with localStorage backing. Don't mix.

## P2. Webhook-authoritative order writes

Same as subscription / draws / promo: webhook writes the durable record, not the client. Handles retries and out-of-band cancels safely.

## P3. Single invalidator hook

`usePurchaseInvalidation()` is THE place that invalidates queries after a purchase. Components call it; don't manually `queryClient.invalidateQueries()` from random places.

## P4. Per-product loading flags, not global `isLoading`

For any UI element scoped to a single product (Add-to-cart button on a card, qty stepper on a row, remove button), gate its disabled / spinner state on `isAddingToCart(productId)` / `isUpdatingCart(productId)` / `isRemovingFromCart(productId)` from `useCart()` — **never** on the top-level `isLoading`. The global flag covers the entire pending-op queue and will visibly freeze unrelated buttons across the page. See [gotchas.md](./gotchas.md) for the failure mode.

## P5. Light/dark theming on shop pages

Shop pages follow a consistent dark-mode token set: `bg-white dark:bg-neutral-950` (wrapper), `bg-gray-100 dark:bg-neutral-900` (secondary surfaces), `dark:text-neutral-100` (primary text), `dark:text-neutral-400` (secondary text), `dark:border-neutral-800` (borders/cards). Extend with the same tokens rather than introducing new dark variants. Full convention list lives in [frontend.md](./frontend.md#theming).
