# Cart-Shop-Products — Rules

## R1. Member discount computed server-side

Don't apply discount client-side as a display tweak — compute total + discount on the server (or via a server-validated PI metadata read). Otherwise, manipulated clients can bypass pricing.

## R2. Member-only product enforcement

Products with `isAdditional === true` must be gated server-side at checkout — non-member can't complete purchase. Client-side hide is for UX; server-side block is for security.

## R3. Order written by webhook only

Don't write `Order` rows from the client / route-handler. The webhook is authoritative — same pattern as subscription cancellation events.

## R4. Inventory not currently modeled

There's no inventory tracking on `Product`. Products are assumed in-stock unless marked `isActive: false`. _TODO: confirm._

## R5. The server cart is the source of truth

`user.cart` in Mongo is the cart; `CartContext` is an optimistic mirror of it. Reconcile a failed or partial sync by re-reading `GET /api/cart`, never by reconstructing the list client-side — and remember `POST /api/cart` is additive (`quantity += n`), so any retry path must be certain the op has not already landed.
