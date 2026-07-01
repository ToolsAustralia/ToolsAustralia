# Cart-Shop-Products — Rules

## R1. Member discount computed server-side

Don't apply discount client-side as a display tweak — compute total + discount on the server (or via a server-validated PI metadata read). Otherwise, manipulated clients can bypass pricing.

## R2. Member-only product enforcement

Products with `isAdditional === true` must be gated server-side at checkout — non-member can't complete purchase. Client-side hide is for UX; server-side block is for security.

## R3. Order written by webhook only

Don't write `Order` rows from the client / route-handler. The webhook is authoritative — same pattern as subscription cancellation events.

## R4. Inventory not currently modeled

There's no inventory tracking on `Product`. Products are assumed in-stock unless marked `isActive: false`. _TODO: confirm._

## R5. Cart is per-browser-session via localStorage

Cart state isn't synced across devices. Members on multiple devices see different carts.
