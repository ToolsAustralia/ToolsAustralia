# Shop Checkout (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in customer can buy a merch item — pick variants, enter a delivery address, pay in AUD, and end up with a paid `Order` a staff member can fulfil.

**Architecture:** Money math lives in one pure, unit-tested module (`src/utils/shop/pricing.ts`) so the cart drawer, the summary endpoint and the PaymentIntent all quote identical figures. Prices are **GST-inclusive**; GST is reported as a *component*, never added. The Order is pre-created `pending` at PaymentIntent creation with server-read prices, and the Stripe webhook flips it to paid — the client never supplies an amount or an order.

**Tech Stack:** Next.js 15 App Router · Mongoose 8 · Stripe (test mode) · Zod · standalone `tsx` tests · Playwright e2e against the isolated `toolsaustralia-e2e` database.

**Spec:** [2026-08-17-shop-catalogue-and-checkout-design.md](../specs/2026-08-17-shop-catalogue-and-checkout-design.md)

## Global Constraints

- **Prices are GST-inclusive.** `gst = total / 11` is a *component* of the total. The current `/api/cart/summary` adds 10% **on top** — that is the bug being fixed, and every price already entered in admin assumes inclusive.
- **The client never sends a price or an amount.** It sends product/variant ids and quantities; the server re-reads everything. This is the repo's existing price-integrity contract.
- **A cart cannot round-trip through Stripe metadata** (500-char values, 50-key cap). Do not try — the Order carries the line items.
- **`packageType` must NOT be widened in this phase.** Shop payments do not touch `processPaymentBenefits`; entries are the entries spec's job. A shop PI writes an Order and nothing else.
- **Rule 11 (LEGAL):** no entry copy anywhere in checkout. `includedEntries` is stored but not displayed and not granted.
- **Rule 2:** `src/models/Order.ts`, `src/app/api/**` and `src/contexts/CartContext.tsx` all require `docs/cart-shop-products/` updates in the same task. `src/models/User.ts` additionally triggers CUSTOMER.md.
- Every new test file needs a matching `test:*` entry in `package.json`.

---

### Task 1: Pricing — one module, GST-inclusive

**Files:**
- Create: `src/utils/shop/pricing.ts`
- Test: `src/utils/shop/__tests__/pricing.test.ts`
- Modify: `package.json` (`test:shop-pricing`)
- Modify: `src/app/api/cart/summary/route.ts`
- Modify: `src/contexts/CartContext.tsx` (drop its duplicate rule, consume the module)
- Modify: `docs/cart-shop-products/rules.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `priceCart(lines, opts): CartTotals` where
  `CartTotals = { subtotal, discount, shipping, total, gstComponent, totalItems }`, all
  **dollars, GST-inclusive**, each rounded to cents.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { priceCart } from "@/utils/shop/pricing";

let failures = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}\n  ${(e as Error).message}`); }
};

const line = (price: number, quantity = 1) => ({ price, quantity });

test("subtotal is the GST-inclusive sum of the lines", () => {
  const t = priceCart([line(79.95), line(20, 2)], { shopDiscountPercent: 0 });
  assert.equal(t.subtotal, 119.95);
});

test("GST is a COMPONENT of the total, not added on top", () => {
  // $110 inclusive => $10 GST, total stays $110.
  const t = priceCart([line(110)], { shopDiscountPercent: 0, freeShippingThreshold: 0, flatShipping: 0 });
  assert.equal(t.total, 110);
  assert.equal(t.gstComponent, 10);
});

test("tier discount applies to the subtotal", () => {
  const t = priceCart([line(100)], { shopDiscountPercent: 20, freeShippingThreshold: 0, flatShipping: 0 });
  assert.equal(t.discount, 20);
  assert.equal(t.total, 80);
});

test("a guest (no tier) gets no discount", () => {
  const t = priceCart([line(100)], { freeShippingThreshold: 0, flatShipping: 0 });
  assert.equal(t.discount, 0);
});

test("shipping is charged below the threshold and free at or above it", () => {
  const under = priceCart([line(50)], { shopDiscountPercent: 0, freeShippingThreshold: 100, flatShipping: 10 });
  assert.equal(under.shipping, 10);
  assert.equal(under.total, 60);
  const over = priceCart([line(100)], { shopDiscountPercent: 0, freeShippingThreshold: 100, flatShipping: 10 });
  assert.equal(over.shipping, 0);
});

test("the free-shipping threshold is tested AFTER the discount", () => {
  // $100 subtotal - 20% = $80, which is under the $100 threshold, so shipping applies.
  // Testing before the discount would ship it free and quietly lose the fee.
  const t = priceCart([line(100)], { shopDiscountPercent: 20, freeShippingThreshold: 100, flatShipping: 10 });
  assert.equal(t.shipping, 10);
  assert.equal(t.total, 90);
});

test("shipping is inside the GST component (GSTD 2002/3)", () => {
  const t = priceCart([line(100)], { shopDiscountPercent: 0, freeShippingThreshold: 1000, flatShipping: 10 });
  assert.equal(t.total, 110);
  assert.equal(t.gstComponent, 10);
});

test("money is rounded to cents, never left as float noise", () => {
  const t = priceCart([line(0.1), line(0.2)], { shopDiscountPercent: 0, freeShippingThreshold: 0, flatShipping: 0 });
  assert.equal(t.subtotal, 0.3);
});

test("an empty cart is all zeroes, not NaN", () => {
  const t = priceCart([], {});
  assert.equal(t.subtotal, 0);
  assert.equal(t.total, 0);
  assert.equal(t.gstComponent, 0);
  assert.equal(t.totalItems, 0);
});

test("totalItems counts quantities, not lines", () => {
  assert.equal(priceCart([line(10, 3), line(5, 2)], {}).totalItems, 5);
});

if (failures > 0) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log("\nAll tests passed");
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx tsx src/utils/shop/__tests__/pricing.test.ts` → `Cannot find module '@/utils/shop/pricing'`.

- [ ] **Step 3: Implement**

```ts
/**
 * Shop cart pricing. The single source of the money math — the cart drawer, the
 * summary endpoint and the PaymentIntent all read from here, so a figure can
 * never drift between what a customer is quoted and what they are charged.
 *
 * ALL PRICES ARE GST-INCLUSIVE. Australian retail is quoted inclusive, and every
 * price entered in admin assumes it. GST is therefore reported as a COMPONENT of
 * the total (total / 11), never added on top.
 */
export interface CartLine {
  price: number;
  quantity: number;
}

export interface PriceCartOptions {
  /** Member tier shop discount: Tradie 5, Foreman 10, Boss 20. Guests 0. */
  shopDiscountPercent?: number;
  /** Order value at or above which shipping is free. */
  freeShippingThreshold?: number;
  flatShipping?: number;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  /** The GST already inside `total`. Display only — never add it. */
  gstComponent: number;
  totalItems: number;
}

export const GST_DIVISOR = 11;
export const DEFAULT_FREE_SHIPPING_THRESHOLD = 100;
export const DEFAULT_FLAT_SHIPPING = 10;

const money = (n: number): number => Math.round(n * 100) / 100;

export function priceCart(lines: readonly CartLine[], opts: PriceCartOptions = {}): CartTotals {
  const {
    shopDiscountPercent = 0,
    freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD,
    flatShipping = DEFAULT_FLAT_SHIPPING,
  } = opts;

  const subtotal = money(lines.reduce((sum, l) => sum + l.price * l.quantity, 0));
  const totalItems = lines.reduce((sum, l) => sum + l.quantity, 0);
  const discount = money(subtotal * (shopDiscountPercent / 100));
  const discounted = money(subtotal - discount);

  // Threshold is tested against the DISCOUNTED value — what the customer
  // actually pays. Testing the pre-discount subtotal would ship a $90 order
  // free against a $100 threshold and quietly lose the fee.
  const shipping = discounted >= freeShippingThreshold ? 0 : flatShipping;

  const total = money(discounted + shipping);
  return {
    subtotal,
    discount,
    shipping,
    total,
    gstComponent: money(total / GST_DIVISOR),
    totalItems,
  };
}
```

- [ ] **Step 4: Run the test, confirm it passes**

- [ ] **Step 5: Wire the npm script**

```json
"test:shop-pricing": "tsx src/utils/shop/__tests__/pricing.test.ts",
```

- [ ] **Step 6: Replace both duplicate implementations**

`/api/cart/summary` currently computes `tax = subtotal * 0.1` and `shipping = subtotal >= 100 ? 0 : 10`.
Replace with `priceCart(...)` and return `{ subtotal, discount, shipping, total, gstComponent, totalItems }`.
Do the same in `CartContext`'s `calculateSummary`. The rule must exist in exactly one place.

- [ ] **Step 7: Verify**

`npm run test:shop-pricing && npx tsc --noEmit && npm run lint`

- [ ] **Step 8: Document + commit**

Correct `docs/cart-shop-products/rules.md` — it describes the additive-GST behaviour that is now wrong.

```bash
git add src/utils/shop package.json src/app/api/cart src/contexts/CartContext.tsx docs/cart-shop-products
git commit -m "fix(shop): one GST-inclusive pricing module, replacing three copies"
```

---

### Task 2: Order creation + PaymentIntent

**Files:**
- Modify: `src/models/Order.ts` (money breakdown + shipping fields)
- Create: `src/services/shop/ShopOrderService.ts`
- Create: `src/app/api/shop/checkout/route.ts`
- Modify: `src/utils/payment/stripe/payment-intent-config.ts` (`PaymentType` + both URL maps)
- Modify: `docs/cart-shop-products/api.md`, `docs/payment/api.md`

**Interfaces:**
- Consumes: `priceCart` (Task 1), `isVariantPurchasable` / `findVariantBySku` (Phase 1).
- Produces: `ShopOrderService.createPendingOrder({ user, shippingAddress })` → `{ order, totals }`; `ShopOrderService.markPaid(orderId, paymentIntentId)`; `generateOrderNumber()`.

- [ ] **Step 1: Add `"shop"` to `PaymentType`**

In `payment-intent-config.ts`: add `"shop"` to the union **and** to `getReturnUrlForPaymentType`'s
`returnUrls` record (→ `${baseUrl}/checkout/success`) **and** the client-side twin map lower in
the same file. `Record<PaymentType, string>` makes a missed map a compile error — good.

- [ ] **Step 2: Extend `Order`**

Add to the interface and schema: `subtotal`, `gst`, `shippingFee`, `discount` (all Number, min 0),
`shippingCarrier?`, `shippingService?`, `printProviderOrderId?` (String, **unique sparse index**),
`printProviderStatus?`, `submittedAt?`. Add `sku?` to the `products[]` subdoc — the Order must
record which variant was bought or the printer cannot be told.

Also **fix the two latent 500s while here**: `.populate("products.productId")` → `products.product`
in `GET /api/orders` and `GET /api/orders/[id]`.

- [ ] **Step 3: Write the service**

`generateOrderNumber()` returns `TA-` + a base36 timestamp + 4 random chars, e.g. `TA-M2K9X1-4F7A`.
`orderNumber` is `required: true, unique: true`, and the dead writer's failure to set it is one of
the two reasons that route throws today.

`createPendingOrder` must: load the user's cart, re-read every product server-side, reject empty
carts, reject inactive products/variants, resolve the tier `shopDiscountPercent` from the user's
active membership package, call `priceCart`, and persist an `Order` with `status: "pending"` and
the full line snapshot (product, sku, quantity, **price at time of order**).

- [ ] **Step 4: Write `POST /api/shop/checkout`**

Guards: `requireSameOrigin` + `requireAuthenticatedUserDoc` (copy `/api/cart`'s pattern verbatim).
Body: `{ shippingAddress }` only — **no amount, no line items, no price**.

Then: `createPendingOrder` → `createPaymentIntentConfig({ amount: Math.round(totals.total * 100), currency: "aud", paymentType: "shop", metadata: { type: "shop", orderId, orderNumber, userId } })` → `stripe.paymentIntents.create(config, { idempotencyKey: \`shop_${order._id}\` })` → return `{ clientSecret, orderId, orderNumber, totals }`.

The idempotency key is keyed on the order, so a double-submit reuses one PaymentIntent.

- [ ] **Step 5: Verify the guards reject**

With no session: `POST /api/shop/checkout` → **401**. A 200 or 500 means the guard is not wired.

- [ ] **Step 6: Commit**

```bash
git add src/models/Order.ts src/services/shop src/app/api/shop src/utils/payment/stripe/payment-intent-config.ts docs
git commit -m "feat(shop): pending-order creation and shop PaymentIntent"
```

---

### Task 3: Webhook marks the order paid

**Files:**
- Modify: `src/services/stripe-webhook-handlers/index.ts`
- Modify: `docs/cart-shop-products/backend.md` (it currently asserts a flow that does not exist)

**Interfaces:**
- Consumes: `ShopOrderService.markPaid` (Task 2).
- Produces: a `paymentType === "shop"` branch.

- [ ] **Step 1: Add the branch**

Beside `upsell` / `mini-draw` / `one-time` in the dispatcher, add `else if (paymentType === "shop")`.
It must: read `metadata.orderId`, mark the order `processing`, set `paymentIntentId`, and clear the
user's cart. **It must not call `processPaymentBenefits`** — no entries in this phase.

Anything not matching a known type still falls through to the existing warn-and-skip, so a missing
branch means orders silently never write. That is the loudest thing to get wrong here.

- [ ] **Step 2: Make it idempotent**

Stripe redelivers. `markPaid` must be a no-op when the order is already past `pending` — use a
conditional update (`findOneAndUpdate({ _id, status: "pending" }, …)`) rather than a read-then-write.

- [ ] **Step 3: Clear the cart only after the order is marked**

If the order write fails, the customer must keep their cart. Order the operations accordingly.

- [ ] **Step 4: Correct the domain doc**

`docs/cart-shop-products/backend.md` and `rules.md` R3 both claim the webhook writes Orders. It now
partly does — it *marks* an order the checkout route created. State the split explicitly, and why:
a cart cannot round-trip through Stripe metadata, and a client-supplied order would be a free-goods
hole.

- [ ] **Step 5: Commit**

---

### Task 4: Checkout page

**Files:**
- Create: `src/app/(site)/checkout/page.tsx`
- Create: `src/app/(site)/checkout/components/CheckoutClient.tsx`
- Modify: `src/components/layout/Header.tsx` (the cart drawer's dead "Proceed to Checkout" link)
- Modify: `docs/cart-shop-products/frontend.md`

- [ ] **Step 1: Read the existing payment UI before writing any**

Read `src/components/modals/PaymentMethodSelector/CardFormSection.tsx` for how `<PaymentElement>`
is mounted, and `src/hooks/usePaymentIntent.ts`. **Match them.** `.cursorrules` forbids introducing
a second payment pattern alongside the existing one. Do not hand-roll a card form.

- [ ] **Step 2: Build the page**

`export const dynamic = "force-dynamic"` — `/checkout` sits in the nonce-CSP route class like
`/shop`. Never add `generateStaticParams`.

Sections: cart review (with variant labels), a shipping-address form, an order summary rendering
`priceCart`'s figures with GST shown as **"includes $X GST"**, and the Stripe Payment Element.

Submit → `POST /api/shop/checkout` → confirm with the returned `clientSecret` → redirect to
`/checkout/success`.

- [ ] **Step 3: Fix the cart drawer link**

`Header.tsx` links "Proceed to Checkout" to `/shop`. Point it at `/checkout`.

- [ ] **Step 4: Reconcile the success page**

`CheckoutSuccessClient` reads `order.paymentStatus`, `order.items` and `order.paymentMethod` —
none of which exist. Point it at the real fields (`status`, `products`, `totalAmount`) now that
orders actually exist, or it renders blanks on the first real purchase.

- [ ] **Step 5: Commit**

---

### Task 5: End-to-end proof

**Files:**
- Modify: `e2e/specs/admin/shop-catalogue.spec.ts` *or* create `e2e/specs/shop/checkout.spec.ts`

- [ ] **Step 1: Extend the e2e suite**

Chromium-desktop only for the click-through (same rationale as Phase 1). Assert:

1. A member adds a variant, reaches `/checkout`, and the summary total equals `priceCart`'s figure.
2. **GST is displayed as a component** — a $110 cart shows `$110.00` total and `$10.00` GST, not `$121`.
3. Paying with the Stripe test card `4242 4242 4242 4242` produces an `Order` whose `status` is no
   longer `pending` and whose `products[0].sku` is the chosen variant.
4. The cart is empty afterwards.
5. `POST /api/shop/checkout` unauthenticated → 401.

- [ ] **Step 2: Run it**

`npm run e2e -- --grep "checkout"` — must be green before this phase is called done.

---

## Definition of done for Phase 2

- [ ] `npm run test:shop-pricing` and `test:shop-variants` pass
- [ ] `npx tsc --noEmit` exits 0; the changed files lint clean
- [ ] The GST bug is gone — one pricing module, no additive tax anywhere
- [ ] A real card payment in the e2e harness produces a paid `Order` carrying the variant sku
- [ ] The cart empties on success, and survives a failed payment
- [ ] No entry copy anywhere in checkout; `packageType` untouched

**Not in this phase:** entry granting, supplier submission, shipping-rate quoting, guest checkout.
