# Cart-Shop-Products — Patterns

## P1. Cart in Context, products in TanStack Query

Server-state (products) goes through TanStack Query. Client-state (cart) goes through React Context with localStorage backing. Don't mix.

## P2. Webhook-authoritative order writes

Same as subscription / draws / promo: webhook writes the durable record, not the client. Handles retries and out-of-band cancels safely.

## P3. Single invalidator hook

`usePurchaseInvalidation()` is THE place that invalidates queries after a purchase. Components call it; don't manually `queryClient.invalidateQueries()` from random places.
