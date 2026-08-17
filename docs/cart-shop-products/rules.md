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

## R7 — Prices are GST-inclusive, and the money math lives in ONE module (2026-08-17)

`priceCart` in [src/utils/shop/pricing.ts](../../src/utils/shop/pricing.ts) is the single source
of cart totals. Never re-derive GST, shipping or a discount anywhere else.

**GST is a component, not an addition.** Every price entered in the admin catalog is
GST-inclusive, so `gst = total / 11` describes tax *already inside* the total. The previous code
computed `subtotal * 0.1` and added it, **overcharging every cart by 10%**.

**It was duplicated in more places than the delivery-fee research recorded.** That doc says three;
there were **seven**:

| Site | Status |
|---|---|
| `/api/cart/summary` | live — fixed |
| `CartContext.calculateSummary` | live — fixed |
| `/api/cart/update` | **live** — fixed. Called from `CartContext:251`; missed by earlier audits |
| `useCartQueries.ts` × 4 | **dead code** — left as-is, see below |

`useCartQueries` still carries four stale copies. It is [documented dead code](gotchas.md) — no
component imports it, only the `CartSummary` *type* is used — so fixing it changes nothing a user
sees. **If that layer is ever revived, it must be switched to `priceCart` first** or it will
reintroduce the 10% overcharge.

Two behaviours worth knowing:

- **The free-shipping threshold is tested AFTER the discount**, against what the customer actually
  pays. Testing the pre-discount subtotal ships a $90 order free against a $100 threshold.
- **An empty cart costs zero.** `0 >= 100` is false, so a naive threshold check charges flat
  shipping on an empty cart — guarded explicitly, and covered by a test.

Shipping sits inside the GST component: under ATO ruling GSTD 2002/3 a delivery charge supplied
with taxable goods is itself a taxable supply.

Tests: `npm run test:shop-pricing`.
