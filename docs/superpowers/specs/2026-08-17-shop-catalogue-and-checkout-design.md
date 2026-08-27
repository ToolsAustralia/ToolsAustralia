# Shop — catalogue and checkout

**2026-08-17** · branch `feature/merchandise` · **1 of 3** · blocked on nothing

Sibling specs: [shop-entries](2026-08-17-shop-entries-design.md) ·
[print-provider-fulfilment](2026-08-17-print-provider-fulfilment-design.md)

Provenance: `[V]` verified — I read the code or ran it, citation shown ·
`[D]` documented — written down somewhere, not tested against reality ·
`[A]` assumed — neither; who confirms it is named.

---

## 1. Problem and done

`/shop` has been "Coming Soon" since launch. The scaffolding exists but the purchase path is
broken end to end, so we cannot sell branded apparel — the first product line we actually have
a supplier for.

**Done means** a signed-in customer can pick a size and colour, pay in AUD, and receive an
order confirmation; an `Order` document exists with a correct money breakdown; and a staff
member can see and fulfil it. **Number that says it worked:** first ten real orders complete
with zero manual database repair.

**Failure** is any of: a customer charged without an `Order` row, a GST-inclusive price with
GST added on top again, or overselling a variant we cannot print.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Vocabulary | Extend `shop` / `Product` / `Order` | Repo already owns these names; domain is `cart-shop-products`. A parallel "merchandise" term becomes a second concept forever |
| Variants | Real `variants[]` on `Product` | Apparel is size × colour. Retrofitting after orders exist is far more expensive. Rejected: encoding size in the product name |
| Who writes the `Order` | The Stripe webhook, never a route handler | `POST /api/orders` today accepts a client-supplied `paymentIntentId` with no verification `[V src/app/api/orders/route.ts:83]` — a free-goods hole |
| Price integrity | Client sends IDs + quantities only; server re-reads price | Matches the existing one-time-purchase contract |
| GST | Prices entered **GST-inclusive**, GST shown as a component (`total / 11`) | AU retail norm, and the rest of the site is all-in priced. Current code adds 10% *on top* `[V src/app/api/cart/summary/route.ts:37]` |
| Shipping | Flat AU rate for apparel, one service | Apparel is light parcel-class, so cubic-weight risk is low. Rejected: live carrier rates — not worth it before volume exists |
| Stock | `trackInventory: false` | Print-to-order. Faking a count invites overselling |

## 3. Starting state (verified)

| Fact | Provenance |
|---|---|
| `/shop` "Coming Soon" is the **empty state of a real grid** — one seeded product away from rendering | `[V src/components/features/ShopContent.tsx:459]` |
| The shop grid's add-to-cart is a `console.log` TODO stub | `[V src/components/features/ShopContent.tsx:121]` |
| "Proceed to Checkout" links to `/shop`. **There is no `/checkout` page**, only `/checkout/success` | `[V src/app/(site)/checkout/` listing] |
| **Nothing creates an `Order`.** The only `new Order(` is dead code that never sets the required `orderNumber` and writes `productId` where the schema wants `product` | `[V src/app/api/orders/route.ts:83]` |
| Both order reads `.populate("products.productId")` — a path that does not exist. Throws `StrictPopulateError` under Mongoose 8 the moment any order exists | `[V src/app/api/orders/route.ts:35]` |
| The webhook failure path writes `status = "failed"`, absent from the status enum → ValidationError | `[V src/services/stripe-webhook-handlers/index.ts:1512]` |
| Flat shipping rule is duplicated in three files | `[V src/contexts/CartContext.tsx:101, src/app/api/cart/summary/route.ts:40]` |
| Tier shop discount (5/10/20%) is seeded but commented out and never read | `[V src/data/membershipPackages.ts:78]` |
| `Product` has no variants, SKU, weight or dimensions | `[V src/models/Product.ts]` |
| **The domain docs describe an order-write that does not exist** — `docs/cart-shop-products/backend.md` and `rules.md` R3 both assert the webhook writes Orders | `[V]` — treat both as design intent |
| `/api/products/**` was fully unauthenticated; now gated on `shop.*` | `[V]` — landed, see §7 phase 0 |

## 4. Design

### Product

```
variants: [{ sku, size, colour, gtin, isActive }]   // gtin = print-provider blank id
printArtwork: [{ url, placement, type }]            // placement "1"=Front, "3"=Left Chest
trackInventory: Boolean                             // false for print-to-order
originLocation: String                              // reserved — merch ships from the printer
```

### Order

```
subtotal, gst, shippingFee          // persist the composition, not one total
shippingCarrier, shippingService
printProviderOrderId                // unique sparse — see spec 3
printProviderStatus, submittedAt
```

### Flow

Cart → **one** PaymentIntent → `payment_intent.succeeded` → webhook writes the `Order`.

The webhook branches on `paymentIntent.metadata.type`; anything unrecognised is skipped
`[V src/services/stripe-webhook-handlers/index.ts]`, so `"shop"` must be added as a branch or
orders silently never write.

### Edge and failure states

| Case | Behaviour |
|---|---|
| Payment succeeds, webhook never arrives | Existing `StripeWebhookQueue` sweeper retries; admin Replay button as backstop `[V]` |
| Webhook delivered twice | `PaymentEvent` unique index on `{paymentIntentId, eventType}` `[V src/models/PaymentEvent.ts:149]` |
| Price changes between add-to-cart and pay | Server re-reads at PI creation; the cart price is advisory only |
| Variant deactivated mid-checkout | Reject at PI creation with a named error, not a silent drop |
| Two customers buy the last unit | Not applicable — `trackInventory: false`, print-to-order |
| Card declined | No `Order`, no side effects. PI stays `requires_payment_method` |
| Partial refund | Money returns; the `Order` keeps its line items. Entry consequences are spec 2's problem |
| GST on shipping | Shipping is GST-inclusive too (ATO GSTD 2002/3) `[D docs/cart-shop-products/australia-delivery-fee-research.md]` |

## 5. Threading checklist

| # | Location | Miss it and… | Fails |
|---|---|---|---|
| 1 | `metadata.type === "shop"` branch in the webhook dispatcher | Payment taken, **no Order ever written** | **silent** |
| 2 | `PaymentType` union + both return-URL maps in `payment-intent-config.ts` | 3DS redirect breaks | loud |
| 3 | `Order.status` enum vs the webhook's `"failed"` write | ValidationError on the first failed payment | loud |
| 4 | `products.productId` → `products.product` in both order reads | Every order-history page 500s | loud |
| 5 | Shipping rule in 3 files → 1 service | Totals drift between cart drawer and checkout | **silent** |
| 6 | GST switched from additive to component | Every price 10% too high | **silent** |

## 6. Tests

| Assertion | Covers |
|---|---|
| A `shop` PaymentIntent webhook writes exactly one `Order` with matching line items | row 1 |
| Replaying the same `payment_intent.succeeded` writes no second `Order` | row 1 |
| A declined payment writes no `Order` | row 1 |
| Cart totalling: `subtotal + shipping` GST-inclusive, `gst === round(total/11)` | row 6 |
| One shipping service returns identical figures to cart drawer and checkout for the same cart | row 5 |
| Order-history read succeeds against a seeded `Order` (guards the populate fix) | row 4 |
| Tier discount applied server-side: Boss 20% off, guest 0% | decision row |

New file `src/utils/shop/__tests__/cart-totals.test.ts` plus a `test:shop-cart` script in
`package.json` — a test with no npm entry is undiscoverable in this repo `[V CLAUDE.md]`.

## 7. Phases

| # | Ships | User-visible win |
|---|---|---|
| **0** ✅ | `/api/products/**` gated on new `shop.view/edit/delete`; reviews POST takes identity from session | — (landed 2026-08-17) |
| **1** | Variants, artwork fields, admin catalogue CRUD | Real merch appears on `/shop` |
| **2** | Cart→PI, address form, GST fix, webhook writes the Order, tier discount on | A customer can buy |

## 8. Rollback

**Kill switch:** unpublish the products (`isActive: false` in admin). `/shop` reverts to its
"Coming Soon" empty state with no deploy — that panel is the grid's zero-result branch
`[V src/components/features/ShopContent.tsx:459]`.

**In-flight work:** paid orders already written are unaffected; they still appear in the admin
fulfilment list and can be fulfilled by hand through the supplier portal.

**Recovery surface:** if a payment succeeds and the `Order` write fails, the row sits in
`StripeWebhookQueue` and surfaces on the admin Webhook Queue tab with a Replay button `[V]`.
That is the "human can see it and act" path.

## 9. Open dependencies

| Item | Owner | Asked | Expected | Blocks |
|---|---|---|---|---|
| Trade price sheet + MOQ (needed to set retail prices) | TeePrintCentre | 2026-08-17 | — | Phase 1 seeding |
| Confirm apparel ships flat-rate AU-wide from their VIC facility | TeePrintCentre | 2026-08-17 | — | Phase 2 shipping |

Neither blocks building — both block *launching* with correct prices.
