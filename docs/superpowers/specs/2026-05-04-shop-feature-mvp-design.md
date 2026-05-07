# Shop Feature MVP — Design Spec

**Date:** 2026-05-04
**Branch:** `claude/shop-setup` (worktree of `claude/ShopFeature`)
**Status:** Draft for user review
**Domain:** `cart-shop-products`

## Goal

Activate a guest- and member-friendly shop with Australian-compliant checkout, Stripe card + Apple Pay + Google Pay, and a tax-invoice email per successful order. Launch as MVP — *architecture forward-looking, functionality MVP-only*.

The shop scaffolding already exists (cart context, shop pages, partial API routes, partial Order schema) but is broken for guests, missing the checkout page, missing the shop Stripe endpoint, and missing my-account order views. This work makes it actually shippable.

## Guiding principle

**Architecture forward-looking, functionality MVP-only.** Build extension points for deferred features so we don't need rewrites. Document each deferred feature clearly so adding it later is mechanical. Section 9 lists all deferred features with their entry points.

## Scope

### In scope
- Guest + logged-in checkout
- AU-compliant shipping address + tax invoice
- Stripe PaymentIntent flow with Apple Pay / Google Pay (PaymentElement)
- 3DS handling
- Webhook-as-truth: Order written, stock decremented, emails fired all from `payment_intent.succeeded`
- Atomic stock decrement with auto-refund on race
- SendGrid order confirmation = AU tax invoice
- Klaviyo + Meta Pixel + Meta CAPI events at Shopify-tier coverage
- `/checkout` page (single-page)
- `/my-account/orders` + `/my-account/orders/[orderNumber]`
- Cart icon visible in header (theme → cart → user order)
- Cart persistence: server-side for logged-in (existing), localStorage 24h for guests (new)
- Playwright e2e + tsx unit tests + manual smoke checklist
- Repair the broken pieces of existing scaffolding (POST /api/orders, JWT auth on /api/cart, GST-as-extra-line in CartContext)

### Out of scope (see Section 9 — Deferred from MVP)
- Member discount on shop products
- Member-only products
- Admin order management UI
- Refund/return flow beyond auto-refund on stock-race
- Tax invoice download endpoint
- Magic-link guest order viewing
- Shipping label generation
- Multi-step checkout, Express Checkout buttons, custom saved-card radio

## 1. Architecture overview

```
Browse /shop → Add to cart → CartContext
                                │
            ┌───────────────────┴───────────────────┐
       guest:                                  logged-in:
   localStorage (24h TTL)              POST /api/cart → User.cart
            │                                       │
            └───────────────────┬───────────────────┘
                                ▼
                   /checkout (NEW page)
                                │
              POST /api/stripe/create-shop-purchase
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  validate cart       calculate totals          stock pre-check
  server-side       (subtotal + shipping,        (block if insufficient)
   (auth+stock)      GST-inclusive, AUD)
                                │
                                ▼
                Stripe PaymentIntent (idempotency key)
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
        card flow:                      wallet (Apple/Google):
        confirm with                    PaymentElement renders
        paymentMethodId                 wallet buttons; same
        + 3DS if required              confirmPayment call
               │                                 │
               └────────────────┬────────────────┘
                                ▼
              Stripe webhook payment_intent.succeeded
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  atomic stock         write Order row          send confirmation
  decrement-or-        (guestEmail or            (= AU tax invoice)
  refund                user)                   Klaviyo Placed Order
                                                Meta CAPI Purchase
                                │
                                ▼
              /checkout/success?payment_intent=...
                                │
              Logged-in: link to /my-account/orders/[orderNumber]
              Guest:     "Check your email"
```

### Key architectural decisions

1. **Cart split by auth.** Guests = localStorage 24h TTL. Logged-in = server cart (existing). Merge on login: server wins on conflict, otherwise union.
2. **Duplicate-first for shared payment plumbing.** A new `createShopPurchasePaymentIntent.service.ts` mirrors what one-time-purchase does, but separately. Prevents regressions in the existing live revenue path. Extraction into a shared service deferred until shop has been live ≥2 weeks.
3. **Webhook is the only writer.** Order rows, stock decrements, emails, Klaviyo, CAPI Purchase — all triggered from `payment_intent.succeeded`. Matches existing membership/draws pattern.
4. **Guest path fully supported.** No login wall. Stripe customer created from form email + name. Order row stores `guestEmail`/`guestFirstName`/`guestLastName`. Email is the only confirmation guests get.
5. **Domain stays `cart-shop-products`.** Manifest entry expanded; no new domain.

### Cross-domain integrations
- `payment` — reuses `createPaymentIntentConfig`, 3DS handling
- `billing-stripe` — webhook handler gets shop branch
- `email` — adds `shop-order-confirmation` and `shop-stock-refund` templates
- `tracking` — Pixel + CAPI + Klaviyo Shopify-tier events

## 2. Schema changes

### 2.1 `Order` model

Touched fields:

```ts
{
  // ── ownership (was: user required) ──
  user?: ObjectId,              // OPTIONAL now (was required)
  guestEmail?: string,          // NEW
  guestFirstName?: string,      // NEW
  guestLastName?: string,       // NEW

  // ── shippingAddress: EXPANDED for AU ──
  shippingAddress: {
    firstName: string,
    lastName: string,
    email: string,                          // NEW (denormalized)
    phone: string,                          // NEW (required for AusPost)
    addressLine1: string,                   // RENAMED from "address"
    addressLine2?: string,                  // NEW
    city: string,                           // KEPT in DB; UI labels as "Suburb"
    state: enum["NSW","VIC","QLD","WA","SA","TAS","ACT","NT"],  // tightened
    postalCode: string,                     // validate /^[0-9]{4}$/
    country: string,                        // default "Australia"
    deliveryInstructions?: string,          // NEW
  },

  // ── NEW for tax invoice ──
  gstAmount: number,            // GST included in totalAmount, stored for invoice
  shippingCost: number,         // separate from items so invoice can break it down
  invoiceSentAt?: Date,         // null until SendGrid send completes
}
```

**Schema invariant** (validator): exactly one of `user` OR (`guestEmail` + `guestFirstName` + `guestLastName`) must be set.

**Note on `guestEmail` vs `shippingAddress.email`:** they are not redundant. `guestEmail` identifies the *order owner* (who placed it). `shippingAddress.email` is the *delivery contact* for this shipment — typically the same value, but allowed to differ if the buyer is shipping a gift to someone else. Order confirmation and tax invoice always go to `guestEmail` (or `user.email`); shipping update emails (future) go to `shippingAddress.email`.

**Index changes:**
- `{ paymentIntentId: 1 }` — change from sparse non-unique to **sparse unique** (closes webhook double-write race)
- `{ guestEmail: 1, createdAt: -1 }` sparse — new (future guest support flow)

**Naming decision:** keep field name as `city` in DB; UI form labels it "Suburb" (AU norm). Avoids migration risk.

### 2.2 `Product` model
**No changes.** Existing fields sufficient for MVP.

### 2.3 `User.cart`
**No schema change.** Logged-in cart on `User.cart` continues to work.

### 2.4 New config file: `src/config/business.ts`

```ts
export const BUSINESS = {
  legalName: "Tools Australia Pty Ltd",
  abn: "54 690 397 061",
  acn: "690 397 061",
  license: "TP/04720",
  address: {
    line1: "6A Aylesbury Crescent",
    suburb: "Gladstone Park",
    state: "VIC",
    postcode: "3043",
    country: "Australia",
  },
  shop: {
    freeShippingThreshold: 100,
    flatShippingRate: 10,
  },
} as const;
```

`Footer.tsx` and `terms/page.tsx` refactored to import from `BUSINESS` (deduplication bonus). Business address ADDED to terms page (legally required for AU tax invoices over $1,000; currently missing).

## 3. API surface

### 3.1 New: `POST /api/stripe/create-shop-purchase`
Thin route handler → `createShopPurchase` service.

Request body (Zod):
```ts
{
  items: [{ productId: string, quantity: number }],
  shippingAddress: { firstName, lastName, email, phone, addressLine1, addressLine2?, city, state, postalCode, deliveryInstructions? },
  paymentMethodId: string,
  paymentIntentId?: string,        // for wallet pre-confirm reuse — unused in MVP shop, kept for shape parity
  idempotencyKey?: string,
  attribution: attributionSchema,
}
```

Response: `{ clientSecret, paymentIntentId, status }`. Handles `requires_action` for 3DS via clientSecret.

**Auth:** reads NextAuth session. Logged-in → uses `user._id` and `user.email`. Guest → uses `shippingAddress.email`/`firstName`/`lastName`. **No JWT bearer token.**

### 3.2 Rebuilt: `/api/cart` routes
- Replace custom JWT bearer with `getServerSession`
- Return clean 401 for guests (don't crash)
- `CartContext` updates fetch calls to use credentials, drops Authorization header

Server cart remains logged-in-only. Guest cart lives entirely in localStorage.

### 3.3 Rebuilt: `/api/orders`
- **DELETE the POST handler.** Webhook owns Order writes. (It's broken anyway: schema mismatch `street` vs `address`, decrements stock client-side, violates webhook-as-truth rule.)
- Keep `GET /api/orders` (list user's orders) and `GET /api/orders/[id]` (detail) — both use `getServerSession`, return only the calling user's orders.

### 3.4 New: `GET /api/orders/by-payment-intent/[paymentIntentId]`
For `/checkout/success` polling. Returns `{ status: 'pending' | 'ready', order? }`. Pending = PI succeeded but webhook hasn't written Order yet.

Auth: optional. Guest can poll their own PI's status (PI ID in URL is sufficient cap — Stripe's design).

### 3.5 Webhook branch in `/api/stripe/webhook`
In `payment_intent.succeeded`, branch on `metadata.type === 'shop'` → call `finalizeShopOrder` service. Existing `ProcessedStripeEvent` idempotency check applies (no double-processing).

### 3.6 Auth summary

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/products/*` | None | Public |
| `POST /api/stripe/create-shop-purchase` | Optional session | Guest path supported |
| `GET/POST/PUT/DELETE /api/cart*` | Required (NextAuth) | Logged-in only |
| `GET /api/orders` | Required | User's own orders only |
| `GET /api/orders/[id]` | Required | Owner check; 404 if not owner |
| `GET /api/orders/by-payment-intent/[id]` | Optional | PI ID is the cap |

## 4. Service layer

### 4.1 New folder: `src/services/shop/`

```
src/services/shop/
  cartValidation.service.ts                    ← validate items + prices server-side
  shopTotals.service.ts                        ← subtotal + shipping + GST extraction
  createShopPurchase.service.ts                ← orchestrator
  createShopPurchasePaymentIntent.service.ts   ← duplicate of shared payment plumbing (per Section 4.4)
  finalizeShopOrder.service.ts                 ← webhook-side writer
  shopAnalytics.ts                             ← Pixel/CAPI/Klaviyo payload builders
  __tests__/
    cartValidation.test.ts
    shopTotals.test.ts
    finalizeShopOrder.test.ts
```

### 4.2 Service responsibilities

**`cartValidation.service.ts`** — pure function. Takes `items[]` from request, hits Mongo, returns `{ validatedItems, errors }`. Checks: product exists, isActive, stock >= quantity. Item price taken from DB (security boundary). Accepts `userContext` arg for future member-only checks (extension point).

**`shopTotals.service.ts`** — pure function. Returns:
```ts
{
  subtotal,           // sum of items, GST-inclusive (cents)
  shippingCost,       // 0 if subtotal >= threshold, else flat
  totalAmount,        // subtotal + shippingCost
  gstAmount,          // totalAmount * (1/11), rounded
  appliedDiscounts: [],   // empty for MVP — extension point
}
```
All numbers in cents internally; dollar-formatted only at boundaries.

**`createShopPurchase.service.ts`** — orchestrator:
1. `cartValidation` → validated items
2. `shopTotals` → totals in cents
3. Call `createShopPurchasePaymentIntent` → PI with metadata
4. Return `{ clientSecret, paymentIntentId, status }`

PI metadata stored:
```json
{
  "type": "shop",
  "items": "[{...}]",
  "shippingAddress": "{...}",
  "userId": "..." | "guestEmail": "...", "guestFirstName": "...", "guestLastName": "...",
  "subtotal": "...", "shippingCost": "...", "gstAmount": "...", "totalAmount": "...",
  "capi_*": "...",
  "attribution_*": "..."
}
```

**`finalizeShopOrder.service.ts`** — webhook-side:
1. Parse `metadata.items` and `metadata.shippingAddress`
2. **Atomic stock decrement loop:** `Product.findOneAndUpdate({ _id, stock: { $gte: q } }, { $inc: { stock: -q } })` per item
3. If ANY item failed: revert successful decrements (`$inc: +q` best-effort), call `stripe.refunds.create`, fire "sold out, refunded" email, return early — no Order written
4. If all succeeded: write Order row (with user OR guest fields)
5. Background jobs (`executeBackgroundJob`):
   - SendGrid order-confirmation email (= AU tax invoice)
   - Klaviyo `Placed Order` + `Ordered Product` per line item
   - Meta CAPI `Purchase` (event_id = PI.id, dedupes with client Pixel)
6. Set `Order.invoiceSentAt` after SendGrid 200
7. Clear `User.cart` for logged-in users

### 4.3 Shared payment service — duplicate-first

`createShopPurchasePaymentIntent.service.ts` is a deliberate duplicate of the equivalent plumbing in `create-one-time-purchase`. Same function shape as the eventual shared service. Marked with `// TODO(shared-payment-extraction)` comment.

**Why:** mini-draw / one-time-purchase is current revenue. Extracting it now means rewriting battle-tested code. Better to ship shop safely, then extract once both flows have run for ≥2 weeks and we know what stays the same.

### 4.4 Existing utilities reused (no changes)
- `createPaymentIntentConfig`, `buildAttributionMetadata`, `executeBackgroundJob`, `extractRequestContext`, `savePaymentMethodToUser`

## 5. Frontend

### 5.1 Navbar — `Header.tsx`

Order: **theme → cart → user icon**. Cart icon shows badge with count. Click opens existing cart sidebar (already wired via `setIsCartOpen`). Mobile menu gets same treatment. Cart sidebar's "Checkout" button now points to new `/checkout` route.

Remove the `{/* Theme (replaces cart until shop is live) */}` comment block.

### 5.2 `CartContext` — guest localStorage path

```
On mount:
  if (userId) → load from /api/cart  (existing)
  else        → load from localStorage["shop_cart_v1"] with 24h TTL  (NEW)

On any mutation:
  if (userId) → optimistic + sync to /api/cart  (existing)
  else        → optimistic + write localStorage  (NEW)

On login (userId transitions undefined → defined):
  merge localStorage cart with server cart:
    - server items win on (productId) conflict
    - guest-only items POST'd to /api/cart
    - localStorage cleared after merge
```

LocalStorage shape: `{ v: 1, savedAt: ISO, items: CartItem[] }`. TTL: drop on read if `Date.now() - savedAt > 24h`.

**GST fix:** drop `tax` from `CartSummary`; add `gstIncluded` for "incl. $X GST" display only. `totalAmount` no longer adds GST on top.

### 5.3 `/shop` pages — light review only
- Confirm `addToCart` wired
- Confirm Pixel/Klaviyo `AddToCart` events fire
- Confirm out-of-stock disabling works
- No layout changes

### 5.4 New `/checkout` page

Single-page layout:

```
┌─────────────────────────────────────────────────────────┐
│  Checkout                                                │
├──────────────────────────────────┬──────────────────────┤
│  [1] Contact (email, phone)      │  Order summary       │
│      (prefilled if logged-in)    │  ─────────           │
│  [2] Shipping address            │  Items × N    $..    │
│      (state dropdown, AU only)   │  ─────────           │
│  [3] Stripe PaymentElement       │  Subtotal     $..    │
│      (card + Apple/Google Pay)   │  Shipping     $..    │
│                                  │  Total       AUD $.. │
│                                  │  (incl. $X GST)      │
│                                  │  [ Pay $.. ]         │
└──────────────────────────────────┴──────────────────────┘
```

Empty cart → redirect `/shop` with toast.
Mobile: form stacks above summary; Pay button sticky-bottom.

### 5.5 New: `src/components/payment/ShopCheckoutPaymentElement.tsx`

Uses Stripe PaymentElement directly (NOT existing `StripeInlineCardSetupForm`, which is for SetupIntents).

Flow:
1. Mount → POST `/api/stripe/create-shop-purchase` (no payment method) → returns `clientSecret`
2. Mount Stripe Elements with that clientSecret
3. PaymentElement renders with `automatic_payment_methods: { enabled: true }` → wallets render automatically
4. Submit → `stripe.confirmPayment({ elements, confirmParams: { return_url } })`
5. 3DS redirects via `return_url` → `/checkout/success?payment_intent=...`
6. Success page polls `/api/orders/by-payment-intent/[id]` for Order row

**Apple Pay domain verification:** `.well-known/apple-developer-merchantid-domain-association` file served from domain root + Stripe Dashboard verification. Verify during implementation; if missing, `next.config.ts` rewrite + Dashboard step.

### 5.6 New: `/my-account/orders` and `/my-account/orders/[orderNumber]`

Mirrors `/my-account/draws` and `/my-account/membership` patterns.

**List view:** filters (status), sort (most recent), each row shows order number, date, item count, total, status badge, "View" link.

**Detail view:** header with status badge; status timeline (pending → processing → shipped → delivered); items list with images; shipping address; payment info (card last4 if available, paymentIntentId); tracking number when present (clickable to AusPost); "Need help?" → `/my-account/support`.

New TanStack Query hooks: `useOrdersQuery`, `useOrderQuery(orderNumber)` under `src/hooks/queries/`. Auto-invalidated by existing `usePurchaseInvalidation`.

### 5.7 Dashboard widget on `/my-account` root
Small "Recent Orders" card after MajorDrawOverview. 3 most recent orders + "View all". Hidden if user has zero orders.

### 5.8 Routing summary

| Route | Status |
|---|---|
| `/shop`, `/shop/[slug]`, `/shop/brand/[brand]` | exists |
| `/checkout` | **NEW** |
| `/checkout/success` | exists (tweaked for shop case) |
| `/my-account/orders` | **NEW** |
| `/my-account/orders/[orderNumber]` | **NEW** |

### 5.9 Tracking — Shopify-tier coverage

#### Meta Pixel + CAPI

Both fire with same `event_id` for **dedup**.

| Event | Trigger | Source |
|---|---|---|
| `ViewContent` | `/shop/[slug]` mount | Pixel + CAPI |
| `AddToCart` | `addToCart` | Pixel + CAPI |
| `RemoveFromCart` | `removeFromCart` | Pixel (already wired) |
| `InitiateCheckout` | `/checkout` mount with non-empty cart | Pixel + CAPI |
| `AddPaymentInfo` | PaymentElement reports first user interaction (focus or change event) | Pixel + CAPI |
| `Purchase` | Webhook on `payment_intent.succeeded` | **CAPI server-side** + Pixel client-side on `/checkout/success` |

CAPI server-side events use `metadata.capi_*` fields stashed at PI creation (existing pattern). Client Pixel uses same `event_id` for dedup.

#### Klaviyo

Standard Klaviyo "Started Checkout / Placed Order / Ordered Product" schema, identical to Shopify's official Klaviyo integration so Klaviyo's pre-built flows work.

| Event | Trigger | Source |
|---|---|---|
| `Viewed Product` | `/shop/[slug]` mount | client `useKlaviyoTracking` |
| `Added to Cart` | `addToCart` | client |
| `Started Checkout` | `/checkout` mount | client |
| `Placed Order` | Webhook | server (`src/lib/klaviyo.ts`) |
| `Ordered Product` | Webhook (one per line item) | server |

`Placed Order` and `Ordered Product` payloads include `$value`, `Items[]`, `Categories[]`, `BrandName` matching Shopify's schema.

#### Helper service: `src/services/shop/shopAnalytics.ts`
Pure functions building Meta/Klaviyo payloads from a cart or order. Single source of payload shape.

### 5.10 Frontend design alignment

| New surface | Reuse from |
|---|---|
| Form inputs | `src/components/ui/Input`, `Select`; pattern from contact / login forms |
| Order summary card | `src/components/ui/Card` + `/my-account` dashboard tokens |
| "Pay" button | Primary `Button` variant, same as draw entry CTA |
| State dropdown | `src/components/ui/Select` |
| `/my-account/orders` list | Mirror `/my-account/draws` |
| Order detail | Mirror `/my-account/membership` |
| Status badges | `src/components/ui/Badge`, membership-status palette |
| Status timeline | Reuse if exists in `/my-account/draws`; else build small `OrderStatusTimeline` |
| Empty states | Pattern from `/my-account/benefits` |
| Theme | Tailwind dark mode, no custom palette |

No new design system tokens, no new icon set.

## 6. Payment flow walkthrough

### 6.1 Card flow (canonical)
1. User on `/checkout`, fills shipping form, clicks "Pay"
2. POST `/api/stripe/create-shop-purchase` with cart + address
3. Server: validate cart, compute totals, create-or-attach Stripe customer, create PI with metadata, return `clientSecret`
4. Client: mount Stripe Elements with clientSecret
5. Fire `AddPaymentInfo` Pixel + CAPI
6. User enters card → `stripe.confirmPayment({ elements, confirmParams: { return_url } })`
7. Three branches: succeeded (redirect), 3DS required (Stripe redirects to issuer page → back to return_url), declined (inline error, retry — same PI reusable)
8. Stripe sends `payment_intent.succeeded` webhook
9. Webhook handler: atomic stock decrement → write Order → background jobs (SendGrid invoice, Klaviyo, CAPI Purchase) → set `invoiceSentAt` → clear logged-in cart
10. `/checkout/success` polls `/api/orders/by-payment-intent/:id`; on Order found, fires Pixel `Purchase` (event_id = PI.id, dedupes with CAPI). Logged-in: link to `/my-account/orders/[orderNumber]`. Guest: "Check your email."

### 6.2 Wallet flow
Identical to card except step 6: user clicks Apple/Google Pay button inside the PaymentElement → wallet sheet → Face ID / fingerprint → confirmPayment fires. **No separate code path** server-side.

The "wallet PI reuse" complexity in `create-one-time-purchase` is NOT needed for shop because PaymentElement's wallet is in-form (not pre-confirm before account creation).

### 6.3 Error paths

| Error | When | Behavior |
|---|---|---|
| Out-of-stock at PI creation | Cart validation | 400 with item name; checkout shows inline error |
| 3DS required | After confirmPayment | Redirect to issuer; back to return_url |
| Card declined | After confirmPayment | Inline Stripe message; PI reusable; user retries |
| Network failure between PI creation and confirm | Submit | Idempotency key returns same PI; user retries safely |
| Webhook never arrives | After payment | `/checkout/success` polls 30s; shows "Processing — check email shortly". Stripe retries up to 3 days. Reconcile cron catches stragglers. |
| Stock disappears between PI and webhook | Webhook | Revert any successful decrements; Stripe refund; sold-out email; no Order written |
| SendGrid fails | Background | Order written; `invoiceSentAt` null; admin can re-trigger |
| Klaviyo / Meta CAPI fail | Background | Logged; non-blocking |

Pattern: anything that loses customer money or delivery info **blocks**; analytics/marketing failures are logged and skipped.

### 6.4 Idempotency
- PI creation: idempotency key on POST. Same key = same PI.
- `confirmPayment`: Stripe internal per PI.
- Webhook: `ProcessedStripeEvent` dedup (existing pattern).
- Stock decrement: atomic, naturally idempotent.
- Order write: `paymentIntentId` unique sparse index prevents double-write.

### 6.5 Saved cards
PaymentElement renders saved methods natively when PI has `customer.id`. **No custom UI.** User picks one → confirmPayment uses it.

### 6.6 The `/checkout/success` race
Stripe charges before webhook fires. Window of ~50ms-30s before Order row exists.

`/checkout/success`:
1. Reads `payment_intent` from query
2. Calls `GET /api/orders/by-payment-intent/[id]`
3. Returns Order if exists, else `{ status: 'pending', pi }` (re-fetched from Stripe)
4. Polls every 2s for up to 30s
5. After 30s without Order: shows "Payment confirmed — order processing. Check your email shortly."
6. Email arrives independently

Reconcile script (`scripts/reconcile-orphan-shop-payments.ts`): finds shop PIs older than 1 hour with no Order, replays them. Daily.

### 6.7 Concurrent tabs
Multi-tab guest checkout race documented as known issue. Logged-in users protected by server cart clear after success. Real fix (server-side anonymous cart) deferred.

Browser back from success → `/checkout` sees empty cart → redirects `/shop` with toast.

### 6.8 Partial stock loss → full refund
Cart [A×1, B×2]; webhook time, B has only 1 stock. **Decision: full refund.** Reasons: partial fulfillment is genuinely complex (proration, partial invoice, stock decrement order, customer confusion, AU consumer law nuance). Frequency at MVP volume makes "full refund + apologize" a fine UX. Partial fulfillment deferred.

Implementation: gather successes/failures first; if any fail, revert all successes (`$inc: +q` best-effort); Stripe refund; sold-out email; no Order.

### 6.9 Stripe customer dedup (guest → member)
MVP: don't reconcile. Future purchases look up by `user.stripeCustomerId` first; if guest, look up Stripe customers by email and reuse most recent. Existing `create-one-time-purchase` already does this. Future merge-script deferred.

### 6.10 3DS return URL
`<origin>/checkout/success?payment_intent=<PI>&payment_intent_client_secret=<secret>` — Stripe standard.

State preservation across 3DS: none needed (PI ID in URL is sufficient). Cart on success page is cleared after Order confirmed visible.

## 7. Testing

### 7.1 Playwright setup
- `npm install -D @playwright/test` + `npx playwright install chromium`
- `playwright.config.ts` at repo root, runs vs local dev server
- Folder: `e2e/` (top-level)
- Stripe test mode keys in `.env.test`
- Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) documented as dev pre-req
- npm scripts: `test:e2e`, `test:e2e:ui`, `test:e2e:shop`

### 7.2 e2e scenarios

| File | Scenario | Card |
|---|---|---|
| `guest-checkout.spec.ts` | Browse → cart → checkout → AU address → pay → success → email assert | `4242 4242 4242 4242` |
| `member-checkout.spec.ts` | Logged-in (auth.setup) → checkout (form prefilled) → pay → `/my-account/orders` shows order | `4242 4242 4242 4242` |
| `cart-persistence.spec.ts` | Guest add → reload → still has items → mock 25h fwd → reload → empty | n/a |
| `out-of-stock.spec.ts` | Stock=0 → add-to-cart blocked OR checkout blocks with line-item error | n/a |
| `three-ds.spec.ts` | Same as guest-checkout but 3DS card → drive 3DS iframe → success | `4000 0027 6000 3184` |

**Not e2e tested** (documented why): Apple/Google Pay (system UI), real SendGrid delivery, real CAPI/Klaviyo delivery.

**Test data isolation:** deterministic `test-shop-e2e-` prefixes; global teardown deletes them.

**CI:** excluded from default CI for this iteration. Run manually before merging. Wire to CI once stable.

### 7.3 tsx unit tests
Per repo convention (standalone `tsx` scripts under `__tests__/`):

| File | Coverage |
|---|---|
| `shopTotals.test.ts` | subtotal, shipping thresholds, GST extraction, empty cart |
| `cartValidation.test.ts` | DB price authority, inactive product, insufficient stock, missing product |
| `finalizeShopOrder.test.ts` | Happy path, race + revert + refund, idempotency, guest path, logged-in path |

npm scripts: `test:shop-totals`, `test:cart-validation`, `test:finalize-shop-order`, `test:shop` (runs all).

Mocking: hand-rolled assertion helpers (matches existing pattern); Stripe mocked via dependency injection; Mongo real (test DB).

### 7.4 Webhook integration test
`scripts/test-shop-webhook.ts` — replays a fixture event against the local handler. `npm run test:shop-webhook`. Run before any webhook code merge.

### 7.5 Stripe test cards
Documented in `e2e/utils/stripe-test-cards.ts`:

| Constant | PAN | Behavior |
|---|---|---|
| `SUCCESS` | 4242 4242 4242 4242 | succeeds |
| `REQUIRES_3DS` | 4000 0027 6000 3184 | 3DS required |
| `DECLINED` | 4000 0000 0000 0002 | generic decline |
| `INSUFFICIENT_FUNDS` | 4000 0000 0000 9995 | insufficient funds |

CVC: any 3 digits. Expiry: any future date.

### 7.6 Manual smoke checklist (`docs/cart-shop-products/launch-checklist.md`)
- [ ] Apple Pay verified on real iPhone Safari
- [ ] Google Pay verified on real Android Chrome
- [ ] `apple-developer-merchantid-domain-association` served + Stripe Dashboard verified
- [ ] Live Stripe key + webhook endpoint configured in production
- [ ] At least one prod-mode guest + logged-in real-card transaction (refunded after)
- [ ] SendGrid templates `shop-order-confirmation` and `shop-stock-refund` created/tested
- [ ] Klaviyo "Placed Order" arriving in dashboard
- [ ] Meta Events Manager shows Purchase events with high match quality
- [ ] AusPost / fulfillment provider notified (manual for MVP)
- [ ] `/checkout/success` works on mobile Safari (3DS redirect)
- [ ] Reconcile script runs cleanly in dry-run

### 7.7 Not tested (honesty)
AU postcode → delivery zone validation; tax invoice rendering across email clients (manual review); high-concurrency stock race (atomic in theory; load test if volume warrants); Stripe-side refund email (Stripe sends own); fractional cents.

## 8. Migration & rollout

### 8.1 DB migration: `scripts/migrations/add-shop-order-fields.ts`
- `--dry-run` flag, uses `connectDB`, exposed as `migrate:shop-order-fields:dry` and `migrate:shop-order-fields`
- Operations:
  1. Make `Order.user` non-required (additive)
  2. Add new optional fields
  3. Backfill `gstAmount = totalAmount * (1/11)`, `shippingCost = 0` for existing rows
  4. Change `paymentIntentId` index to unique sparse
  5. Add `guestEmail` sparse index
  6. Rename `shippingAddress.address` → `shippingAddress.addressLine1` (dual-read pattern: model accepts both for one release; cleanup follows)

### 8.2 Code cleanups bundled
- Delete `POST /api/orders` handler
- Refactor `Footer.tsx` and `terms/page.tsx` → import from `BUSINESS`; add address to terms page
- Update `CartContext`: localStorage path, drop `tax`, add `gstIncluded`, swap to credentials-included fetches
- Update `/api/cart/*`: replace JWT with `getServerSession`
- Update `Header.tsx`: render cart icon (theme → cart → user); remove "replaces cart until shop is live" comment

### 8.3 Domain manifest update

`cart-shop-products` adds:
- `src/services/shop/**`
- `src/app/(site)/my-account/orders/**`
- `src/hooks/queries/useOrdersQueries.ts`

`dev-tooling` adds:
- `e2e/**`
- `playwright.config.ts`

`config-and-data` already covers `src/config/business.ts`.

`billing-stripe` already covers `src/app/api/stripe/**`.

### 8.4 Documentation refresh (per doc-sync hook)

| Domain | Files |
|---|---|
| `cart-shop-products` | architecture.md, frontend.md, backend.md, api.md, rules.md, models.md, gotchas.md, **testing.md** (currently `_TODO_`), launch-checklist.md (NEW) |
| `billing-stripe` | api.md (add `create-shop-purchase`), rules.md (note shop branch in webhook) |
| `email` | templates/patterns (new shop templates) |
| `tracking` | events list (shop coverage) |
| `dashboard-account` | `/my-account/orders` mention |
| `config-and-data` | `business.ts` mention |

### 8.5 Rollout — no feature flag

Deliberately no flag. Cart icon currently absent from navbar — that IS the flag.

**Deploy 1 (silent foundation):** schema migrations, services, webhook branch (dead until shop PI exists), new API routes, new pages, updated CartContext, `business.ts` + Footer/terms refactor. Cart icon NOT rendered. Result: prod unchanged from user POV; testable via direct URL.

**Manual production smoke** (Section 7.6): real card transactions, Apple/Google Pay on real devices, refund.

**Deploy 2 (launch):** single Header.tsx commit renders cart icon. Result: shop visibly live.

**Rollback:** revert Deploy 2 (one commit). Direct URLs continue working for bookmarks; no new traffic via nav.

## 9. Deferred from MVP — to add later

Architecture supports each of these without rewrites. Each has a documented entry point.

### Likely next-up (within first 1-2 follow-up iterations)
- **Extract shared payment service** — after shop is live ≥2 weeks; eliminates `createShopPurchasePaymentIntent` duplicate
- **Admin order management UI** — status transitions, tracking number entry, manual refund. Order schema already supports.
- **Server-side anonymous cart for guests** — cookie-session backed; closes multi-tab race
- **Member discount** — `appliedDiscounts` schema + `userContext` arg already in place
- **Member-only products** — add `isMemberOnly` to Product, gate in `cartValidation.service`
- **Klaviyo Order Shipped / Order Delivered** — fire on admin status transitions

### Probably-needed (when volume warrants)
- Tax invoice download endpoint (`GET /api/orders/[orderNumber]/invoice`)
- Reconcile cron for orphan shop PIs (monthly)
- Express Checkout button at top of `/checkout` (skip-the-form Apple/Google Pay)
- Partial fulfillment with partial refund
- Multi-step checkout (only if AOV grows)

### Maybe (volume / business decision dependent)
- Weight-based shipping
- Postcode surcharges (rural / remote)
- Express shipping option
- Click-and-collect
- Multi-warehouse routing
- Stock reservation (reserve-then-finalize) — only if oversells real
- Stripe customer reconciliation (guest → member email merge)
- Email magic-link guest order viewing
- Wishlist
- Product reviews wired up
- Custom "use saved card" radio (currently using Stripe native)

### Cross-feature deferrals
- Apple Pay / Google Pay automated e2e (system UI; manual only)
- Real-card production smoke automation (one-time pre-launch task)

## 10. Files touched (summary)

### New
- `src/services/shop/cartValidation.service.ts`
- `src/services/shop/shopTotals.service.ts`
- `src/services/shop/createShopPurchase.service.ts`
- `src/services/shop/createShopPurchasePaymentIntent.service.ts`
- `src/services/shop/finalizeShopOrder.service.ts`
- `src/services/shop/shopAnalytics.ts`
- `src/services/shop/__tests__/{cartValidation,shopTotals,finalizeShopOrder}.test.ts`
- `src/app/api/stripe/create-shop-purchase/route.ts`
- `src/app/api/orders/by-payment-intent/[paymentIntentId]/route.ts`
- `src/app/(site)/checkout/page.tsx`
- `src/app/(site)/my-account/orders/page.tsx`
- `src/app/(site)/my-account/orders/[orderNumber]/page.tsx`
- `src/components/payment/ShopCheckoutPaymentElement.tsx`
- `src/hooks/queries/useOrdersQueries.ts`
- `src/config/business.ts`
- `scripts/migrations/add-shop-order-fields.ts`
- `scripts/reconcile-orphan-shop-payments.ts`
- `scripts/test-shop-webhook.ts`
- `playwright.config.ts`
- `e2e/fixtures/{test-products,test-user,auth.setup}.ts`
- `e2e/shop/{guest-checkout,member-checkout,cart-persistence,out-of-stock,three-ds}.spec.ts`
- `e2e/utils/{stripe-test-cards,fill-payment-element}.ts`
- `shop-order-confirmation-email-template.html` (root)
- `shop-stock-refund-email-template.html` (root)
- `docs/cart-shop-products/launch-checklist.md`

### Modified
- `src/models/Order.ts` (schema additions, dual-read for `address`/`addressLine1`)
- `src/contexts/CartContext.tsx` (localStorage path, GST fix, auth swap)
- `src/components/layout/Header.tsx` (cart icon render)
- `src/components/layout/Footer.tsx` (read from `BUSINESS`)
- `src/app/(site)/terms/page.tsx` (read from `BUSINESS` + add address)
- `src/app/api/cart/route.ts` and siblings (`getServerSession`)
- `src/app/api/orders/route.ts` (delete POST)
- `src/app/api/stripe/webhook/route.ts` (shop branch in `payment_intent.succeeded`)
- `src/lib/email/templates.ts` (register shop templates)
- `src/lib/klaviyo.ts` (Placed Order / Ordered Product helpers)
- `package.json` (Playwright, test:shop-* scripts, migrate scripts)
- `CLAUDE.md` Domain Manifest (paths)
- Docs: `docs/cart-shop-products/*`, `docs/billing-stripe/api.md`, `docs/email/*`, `docs/tracking/*`, `docs/dashboard-account/*`, `docs/config-and-data/*`

### Deleted
- (none — all dead code removals are inline, not whole-file)

## 11. Pre-implementation checklist
- [ ] User review of this spec
- [ ] Confirmation that Stripe Apple Pay domain verification will be available (if not, add one-line `next.config.ts` rewrite to setup)
- [ ] Confirmation `STRIPE_TEST_*` keys available in `.env.test` for Playwright
- [ ] Confirm `BUSINESS` config values match production registration

## 12. Open questions / risks
- **One-time-purchase refactor risk** — mitigated by duplicate-first; revisit after shop ≥2 weeks live
- **Guest multi-tab double-charge** — known issue, deferred fix
- **Email delivery in-flight** — Order written before SendGrid 200; if SendGrid permanently down, customer has Order but no email. Admin re-trigger path is manual for MVP.
- **Domain verification for Apple Pay** — requires file served + Dashboard step; flagged in launch checklist
