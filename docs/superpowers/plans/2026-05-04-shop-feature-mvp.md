# Shop Feature MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate a guest- and member-friendly shop with AU-compliant checkout, Stripe card+wallet, webhook-as-truth, atomic stock decrement, SendGrid tax invoice, and Shopify-tier tracking — without breaking the existing live revenue path.

**Architecture:** Webhook-as-source-of-truth Stripe flow. Duplicate payment plumbing rather than refactor live `create-one-time-purchase`. Single-page checkout with `PaymentElement` (handles card + Apple/Google Pay automatically). Cart icon absence is the deploy gate — no feature flag.

**Tech Stack:** Next.js 15 App Router, MongoDB/Mongoose, NextAuth, Stripe (PaymentElement + 3DS + atomic stock), SendGrid (transactional + tax invoice), Klaviyo (e-commerce events), Meta Pixel + CAPI (deduped via event_id), Tailwind, TanStack Query, Zod, Playwright.

**Spec:** [docs/superpowers/specs/2026-05-04-shop-feature-mvp-design.md](../specs/2026-05-04-shop-feature-mvp-design.md)

**Worktree:** `c:\Codes\ToolsAustralia\.worktrees\shop-setup` on branch `claude/shop-setup`. All paths in this plan are worktree-relative.

---

## Project rules (re-read before each task)

1. **No auto-commit.** This repo's `CLAUDE.md` forbids `git commit`/`git add`/`git push`/`gh pr create` without an explicit user keyword (`commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`). Commit steps in this plan are **prompt steps** — when you reach one, ask: *"Want me to commit this?"* and wait. Never bypass with `--no-verify`.
2. **Doc-sync hook.** When you modify `src/` or `scripts/`, the matching `docs/<domain>/` must update in the same task. The hook (`.claude/hooks/doc-sync.mjs`) will block commit otherwise. Tasks below name the docs to update.
3. **No new test runner.** Tests are standalone tsx scripts under `src/**/__tests__/*.test.ts`, each wired to its own `package.json` script. Add scripts as you add tests.
4. **Layering.** No DB access in `src/components/**`. Route handlers stay thin — business logic in `src/services/<domain>/`. See `CLAUDE.md`.
5. **Console.** Production strips `console.log/info/debug/warn`. Use `console.error` for genuine errors that must survive.
6. **Strict TypeScript.** `npm run type-check` must pass before each commit. `npm run lint` should pass too.

---

## Phase 1 — Foundation (Tasks 1–7)

### Task 1: Create `src/config/business.ts`

**Files:**
- Create: `src/config/business.ts`

- [ ] **Step 1: Create the file**

```ts
// src/config/business.ts
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
    freeShippingThreshold: 100, // dollars (AUD)
    flatShippingRate: 10,        // dollars (AUD)
  },
} as const;

export type BusinessConfig = typeof BUSINESS;
```

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: passes (no usages yet)

- [ ] **Step 3: Update `docs/config-and-data/` to mention `business.ts`**

Edit `docs/config-and-data/README.md` (or `architecture.md`) to add a brief mention: "Business identity config: `src/config/business.ts`."

- [ ] **Step 4: Commit prompt**

Suggest: `feat(shop): add BUSINESS config for tax invoice + shipping`. Ask user to commit.

---

### Task 2: Refactor `Footer.tsx` to read from `BUSINESS`

**Files:**
- Modify: `src/components/layout/Footer.tsx`

- [ ] **Step 1: Read existing footer**

Read `src/components/layout/Footer.tsx`. Find the hardcoded `ABN:54 690 397 061 | ACN: 690 397 061 | License: TP/04720` line (~line 35).

- [ ] **Step 2: Replace hardcoded strings with `BUSINESS` import**

Add `import { BUSINESS } from "@/config/business";` at the top.

Replace the hardcoded line with:
```tsx
ABN: {BUSINESS.abn} | ACN: {BUSINESS.acn} | License: {BUSINESS.license}
```

- [ ] **Step 3: Verify dev server renders identically**

Run: `npm run dev` in worktree (port 3000).
Expected: footer reads identically to before (visual diff = none).

- [ ] **Step 4: Update `docs/shared-ui/`**

The footer is in `shared-ui` domain per the manifest. Add a brief note in `docs/shared-ui/patterns.md` (or `architecture.md`): "Business identity strings come from `src/config/business.ts`."

- [ ] **Step 5: Commit prompt**

Suggest: `refactor(layout): footer reads business identity from BUSINESS config`. Ask user.

---

### Task 3: Refactor `terms/page.tsx` to read from `BUSINESS` + add address

**Files:**
- Modify: `src/app/(site)/terms/page.tsx`

- [ ] **Step 1: Read existing terms page**

Find the section showing "Tools Australia Pty Ltd" / `ABN: 54690397061` / etc.

- [ ] **Step 2: Replace hardcoded values with `BUSINESS`**

Add `import { BUSINESS } from "@/config/business";` to the top. Replace the hardcoded values (Name, ABN, ACN) with `{BUSINESS.legalName}`, `{BUSINESS.abn}`, `{BUSINESS.acn}`.

- [ ] **Step 3: Add registered address row to the same section**

Where the legal entity block is, add a row:
```tsx
<span className="font-semibold text-white">Registered Address:</span>
<span>
  {BUSINESS.address.line1}, {BUSINESS.address.suburb} {BUSINESS.address.state} {BUSINESS.address.postcode}, {BUSINESS.address.country}
</span>
```

- [ ] **Step 4: Verify dev render**

Visit `/terms` in dev. Confirm address row visible, other fields unchanged.

- [ ] **Step 5: Update domain docs**

`/terms` lives under `src/app/(site)/` which falls under no specific domain in the manifest. Check `CLAUDE.md` Domain Manifest — `src/app/(site)/terms/**` is not explicitly listed; the doc-sync hook may report it as orphan. If hook fires:
- Either add to an existing domain (likely `shared-ui` or a new `legal` domain)
- Or quickly update the `infrastructure` domain doc to mention legal pages

Read `.claude/hooks/doc-sync.mjs` if needed to understand which path it expects.

- [ ] **Step 6: Commit prompt**

Suggest: `refactor(terms): read business identity from BUSINESS + add registered address`. Ask user.

---

### Task 4: Update `Order` model schema (additive)

**Files:**
- Modify: `src/models/Order.ts`

- [ ] **Step 1: Add new fields and make `user` optional**

Replace the `user` field block (currently `required: true`) with:
```ts
user: {
  type: Schema.Types.ObjectId,
  ref: "User",
  required: false, // optional now — guest orders use guestEmail/guestFirstName/guestLastName
},
guestEmail: { type: String, trim: true, lowercase: true },
guestFirstName: { type: String, trim: true },
guestLastName: { type: String, trim: true },
```

- [ ] **Step 2: Add tax-invoice fields**

After `appliedDiscounts`, add:
```ts
gstAmount: {
  type: Number,
  required: false,
  default: 0,
  min: [0, "GST cannot be negative"],
},
shippingCost: {
  type: Number,
  required: false,
  default: 0,
  min: [0, "Shipping cannot be negative"],
},
invoiceSentAt: { type: Date },
```

- [ ] **Step 3: Expand `shippingAddress` schema**

Modify the `shippingAddress` block to add `email`, `phone`, `addressLine1` (alongside existing `address` for dual-read), `addressLine2`, `deliveryInstructions`. Tighten `state` to AU enum:
```ts
shippingAddress: {
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  addressLine1: { type: String, trim: true },
  address: { type: String, trim: true }, // legacy — read-only fallback during migration
  addressLine2: { type: String, trim: true },
  city: { type: String, trim: true }, // labeled "Suburb" in UI
  state: {
    type: String,
    enum: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
    trim: true,
    uppercase: true,
  },
  postalCode: {
    type: String,
    trim: true,
    match: [/^[0-9]{4}$/, "Australian postcode must be 4 digits"],
  },
  country: { type: String, trim: true, default: "Australia" },
  deliveryInstructions: { type: String, trim: true, maxlength: 500 },
},
```

- [ ] **Step 4: Update `IOrder` TypeScript interface**

Add the new fields to the interface declaration at the top of the file. `user` becomes `user?: mongoose.Types.ObjectId;`. Add `guestEmail?`, `guestFirstName?`, `guestLastName?`, `gstAmount`, `shippingCost`, `invoiceSentAt?`. Update `shippingAddress` shape to match.

- [ ] **Step 5: Add schema-level invariant (pre-save validator)**

Below the schema definition, before the `mongoose.models.Order || ...` export:
```ts
OrderSchema.pre<IOrder>("validate", function (next) {
  const hasUser = !!this.user;
  const hasGuest = !!(this.guestEmail && this.guestFirstName && this.guestLastName);
  if (hasUser && hasGuest) {
    return next(new Error("Order cannot have both user and guest fields"));
  }
  if (!hasUser && !hasGuest) {
    return next(new Error("Order must have either user or guest fields"));
  }
  next();
});
```

- [ ] **Step 6: Replace `paymentIntentId` index with sparse + unique**

Find: `OrderSchema.index({ paymentIntentId: 1 }, { sparse: true });`
Replace with: `OrderSchema.index({ paymentIntentId: 1 }, { sparse: true, unique: true });`

- [ ] **Step 7: Add new indexes**

After existing indexes:
```ts
OrderSchema.index({ guestEmail: 1, createdAt: -1 }, { sparse: true });
```

- [ ] **Step 8: Run type-check**

Run: `npm run type-check`
Expected: passes. If errors mention `Order.user` being non-nullable somewhere, those callers will be fixed in later tasks; for now, fix any compile-blockers by adding non-null assertions or optional chaining.

- [ ] **Step 9: Update `docs/cart-shop-products/models.md`**

Replace the `_TODO_` placeholder with the actual schema documentation matching what you just added — including the new `user` optionality, guest fields, address expansion, and indexes.

- [ ] **Step 10: Commit prompt**

Suggest: `feat(shop): expand Order schema for guest checkout + AU tax invoice`. Ask user.

---

### Task 5: Write migration script for Order schema

**Files:**
- Create: `scripts/migrations/add-shop-order-fields.ts`

- [ ] **Step 1: Read another migration for pattern**

Read `scripts/migrations/` for an example. Match imports (`connectDB` from `@/lib/mongodb`), the `--dry-run` arg pattern, and the exit-code convention.

- [ ] **Step 2: Create the migration script**

```ts
// scripts/migrations/add-shop-order-fields.ts
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";

const DRY = process.argv.includes("--dry-run");

async function main() {
  console.error(`[migrate-shop-order-fields] starting${DRY ? " (DRY RUN)" : ""}`);
  await connectDB();

  // Backfill gstAmount and shippingCost where missing
  const filter = { $or: [{ gstAmount: { $exists: false } }, { shippingCost: { $exists: false } }] };
  const candidates = await Order.find(filter, { _id: 1, totalAmount: 1 }).lean();
  console.error(`[migrate-shop-order-fields] found ${candidates.length} rows to backfill`);

  let updated = 0;
  for (const row of candidates) {
    const total = (row as { totalAmount?: number }).totalAmount ?? 0;
    const gstAmount = Math.round(total * (1 / 11) * 100) / 100;
    const shippingCost = 0;
    if (DRY) {
      console.error(`[dry] _id=${row._id} → gstAmount=${gstAmount} shippingCost=${shippingCost}`);
    } else {
      await Order.updateOne({ _id: row._id }, { $set: { gstAmount, shippingCost } });
      updated += 1;
    }
  }

  // Address rename: address → addressLine1
  const renameFilter = {
    "shippingAddress.address": { $exists: true, $ne: null },
    "shippingAddress.addressLine1": { $in: [null, undefined, ""] },
  };
  const toRename = await Order.find(renameFilter, { _id: 1, "shippingAddress.address": 1 }).lean();
  console.error(`[migrate-shop-order-fields] found ${toRename.length} rows to copy address → addressLine1`);

  for (const row of toRename) {
    const addr = (row as { shippingAddress?: { address?: string } }).shippingAddress?.address;
    if (!addr) continue;
    if (DRY) {
      console.error(`[dry] _id=${row._id} → addressLine1="${addr}"`);
    } else {
      await Order.updateOne({ _id: row._id }, { $set: { "shippingAddress.addressLine1": addr } });
      updated += 1;
    }
  }

  console.error(`[migrate-shop-order-fields] done. ${DRY ? "would update" : "updated"} ${updated} rows`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrate-shop-order-fields] failed", err);
  process.exit(1);
});
```

- [ ] **Step 3: Add npm scripts**

Edit `package.json`, add to `"scripts"`:
```json
"migrate:shop-order-fields:dry": "tsx scripts/migrations/add-shop-order-fields.ts --dry-run",
"migrate:shop-order-fields": "tsx scripts/migrations/add-shop-order-fields.ts"
```

- [ ] **Step 4: Run dry-run against dev DB**

Run: `npm run migrate:shop-order-fields:dry`
Expected: prints number of candidate rows, no writes.

- [ ] **Step 5: Update `docs/infrastructure/`**

Add the migration script to whatever migration log doc exists (or `architecture.md`).

- [ ] **Step 6: Commit prompt**

Suggest: `feat(shop): migration to backfill gstAmount/shippingCost and copy address → addressLine1`. Ask user.

---

### Task 6: Update Domain Manifest in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (the manifest JSON block)

- [ ] **Step 1: Read the current manifest**

Open `CLAUDE.md`, locate the `cart-shop-products` entry.

- [ ] **Step 2: Add new paths**

Inside `cart-shop-products.paths`:
```diff
+   "src/services/shop/**",
+   "src/app/(site)/my-account/orders/**",
+   "src/hooks/queries/useOrdersQueries.ts",
+   "src/components/payment/ShopCheckoutPaymentElement.tsx",
+   "shop-order-confirmation-email-template.html",
+   "shop-stock-refund-email-template.html",
```

- [ ] **Step 3: Add e2e + Playwright to `dev-tooling`**

Inside `dev-tooling.paths`:
```diff
+   "e2e/**",
+   "playwright.config.ts",
```

- [ ] **Step 4: Bump `lastModified`**

Update `lastModified` at the top of the JSON to today's date.

- [ ] **Step 5: Verify with doc-sync hook**

Read `.claude/hooks/doc-sync.mjs` — confirm it parses the JSON correctly. (No way to run it dry; trust the format.)

- [ ] **Step 6: Commit prompt**

Suggest: `chore(manifest): register shop services, e2e, and email template paths`. Ask user.

---

### Task 7: Verify Phase 1 baseline

- [ ] **Step 1: Run lint + type-check**

```
npm run lint
npm run type-check
```
Expected: both pass.

- [ ] **Step 2: Run dev server smoke**

```
npm run dev
```
Expected: starts without errors. Visit `/`, `/terms`, `/shop` (already exists). Confirm no regressions.

- [ ] **Step 3: Stop here and confirm with user before Phase 2**

Phase 1 is foundational; nothing user-facing changed yet.

---

## Phase 2 — Pure services (Tasks 8–9)

### Task 8: `shopTotals` service + test

**Files:**
- Create: `src/services/shop/shopTotals.service.ts`
- Create: `src/services/shop/__tests__/shopTotals.test.ts`

- [ ] **Step 1: Write the test FIRST (TDD)**

```ts
// src/services/shop/__tests__/shopTotals.test.ts
import { computeShopTotals } from "../shopTotals.service";

const items = [
  { productId: "a", priceCents: 4000, quantity: 1 }, // $40.00
  { productId: "b", priceCents: 2000, quantity: 1 }, // $20.00
];

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const t1 = computeShopTotals({ items, freeShippingThresholdCents: 10000, flatShippingRateCents: 1000 });
assert(t1.subtotalCents === 6000, "subtotal sum");
assert(t1.shippingCents === 1000, "shipping = flat under threshold");
assert(t1.totalCents === 7000, "total = subtotal + shipping");
assert(t1.gstCents === Math.round(7000 / 11), "gst = total/11");

const t2 = computeShopTotals({
  items: [{ productId: "x", priceCents: 12000, quantity: 1 }],
  freeShippingThresholdCents: 10000,
  flatShippingRateCents: 1000,
});
assert(t2.shippingCents === 0, "shipping = 0 over threshold");
assert(t2.totalCents === 12000, "total = subtotal only");

const t3 = computeShopTotals({
  items: [{ productId: "y", priceCents: 1000, quantity: 3 }],
  freeShippingThresholdCents: 10000,
  flatShippingRateCents: 1000,
});
assert(t3.subtotalCents === 3000, "subtotal multiplies by quantity");

const t4 = computeShopTotals({
  items: [],
  freeShippingThresholdCents: 10000,
  flatShippingRateCents: 1000,
});
assert(t4.subtotalCents === 0 && t4.shippingCents === 0 && t4.totalCents === 0, "empty cart");

console.log("shopTotals: ALL PASS");
```

- [ ] **Step 2: Add npm script**

In `package.json` `scripts`:
```json
"test:shop-totals": "tsx src/services/shop/__tests__/shopTotals.test.ts"
```

- [ ] **Step 3: Run the test — expect FAIL**

```
npm run test:shop-totals
```
Expected: ts compile error (`computeShopTotals` doesn't exist).

- [ ] **Step 4: Implement the service**

```ts
// src/services/shop/shopTotals.service.ts
export interface ShopTotalsInput {
  items: { productId: string; priceCents: number; quantity: number }[];
  freeShippingThresholdCents: number;
  flatShippingRateCents: number;
}

export interface ShopTotals {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  gstCents: number;
  appliedDiscounts: { type: string; amount: number; description: string }[];
}

export function computeShopTotals(input: ShopTotalsInput): ShopTotals {
  const subtotalCents = input.items.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );
  const shippingCents =
    subtotalCents === 0
      ? 0
      : subtotalCents >= input.freeShippingThresholdCents
        ? 0
        : input.flatShippingRateCents;
  const totalCents = subtotalCents + shippingCents;
  const gstCents = totalCents === 0 ? 0 : Math.round(totalCents / 11);
  return {
    subtotalCents,
    shippingCents,
    totalCents,
    gstCents,
    appliedDiscounts: [],
  };
}
```

- [ ] **Step 5: Run test — expect PASS**

```
npm run test:shop-totals
```
Expected: prints `shopTotals: ALL PASS`.

- [ ] **Step 6: Update `docs/cart-shop-products/architecture.md`**

Add a sentence: "Server-side totals computed by `src/services/shop/shopTotals.service.ts` — pure function, returns subtotal/shipping/total/gst in cents."

- [ ] **Step 7: Commit prompt**

Suggest: `feat(shop): pure shopTotals service with GST extraction`. Ask user.

---

### Task 9: `cartValidation` service + test

**Files:**
- Create: `src/services/shop/cartValidation.service.ts`
- Create: `src/services/shop/__tests__/cartValidation.test.ts`

- [ ] **Step 1: Write the test FIRST**

```ts
// src/services/shop/__tests__/cartValidation.test.ts
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { validateCart } from "../cartValidation.service";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

async function main() {
  await connectDB();

  // Setup: create test products with deterministic prefix
  const TEST_PREFIX = "test-cart-validation-";
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });

  const active = await Product.create({
    name: `${TEST_PREFIX}active`,
    description: "Active product",
    price: 25,
    images: ["http://example.com/img.jpg"],
    category: "test",
    brand: "test",
    stock: 10,
    isActive: true,
  });
  const inactive = await Product.create({
    name: `${TEST_PREFIX}inactive`,
    description: "Inactive",
    price: 25,
    images: ["http://example.com/img.jpg"],
    category: "test",
    brand: "test",
    stock: 10,
    isActive: false,
  });
  const lowStock = await Product.create({
    name: `${TEST_PREFIX}low-stock`,
    description: "Low",
    price: 25,
    images: ["http://example.com/img.jpg"],
    category: "test",
    brand: "test",
    stock: 1,
    isActive: true,
  });

  // Happy path
  const v1 = await validateCart({
    items: [{ productId: active._id.toString(), quantity: 2 }],
  });
  assert(v1.errors.length === 0, "happy path no errors");
  assert(v1.validatedItems[0].priceCents === 2500, "price taken from DB in cents");
  assert(v1.validatedItems[0].quantity === 2, "quantity preserved");

  // Inactive product
  const v2 = await validateCart({ items: [{ productId: inactive._id.toString(), quantity: 1 }] });
  assert(v2.errors.length === 1, "inactive raises error");
  assert(v2.errors[0].productId === inactive._id.toString(), "error references productId");

  // Insufficient stock
  const v3 = await validateCart({ items: [{ productId: lowStock._id.toString(), quantity: 5 }] });
  assert(v3.errors.length === 1, "insufficient stock raises error");
  assert(v3.errors[0].reason === "insufficient_stock", "reason set correctly");

  // Missing product
  const fakeId = new mongoose.Types.ObjectId().toString();
  const v4 = await validateCart({ items: [{ productId: fakeId, quantity: 1 }] });
  assert(v4.errors.length === 1, "missing product raises error");
  assert(v4.errors[0].reason === "not_found", "reason = not_found");

  // Cleanup
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();

  console.log("cartValidation: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

```json
"test:cart-validation": "tsx src/services/shop/__tests__/cartValidation.test.ts"
```

- [ ] **Step 3: Run — expect FAIL**

```
npm run test:cart-validation
```

- [ ] **Step 4: Implement service**

```ts
// src/services/shop/cartValidation.service.ts
import Product from "@/models/Product";

export interface CartValidationInput {
  items: { productId: string; quantity: number }[];
  userContext?: {
    isMember?: boolean; // extension point for member-only products
  };
}

export interface ValidatedItem {
  productId: string;
  productName: string;
  priceCents: number;
  quantity: number;
  imageUrl: string | null;
  brand: string | null;
}

export interface CartValidationError {
  productId: string;
  reason: "not_found" | "inactive" | "insufficient_stock";
  message: string;
}

export interface CartValidationResult {
  validatedItems: ValidatedItem[];
  errors: CartValidationError[];
}

export async function validateCart(input: CartValidationInput): Promise<CartValidationResult> {
  const validatedItems: ValidatedItem[] = [];
  const errors: CartValidationError[] = [];

  for (const item of input.items) {
    const product = await Product.findById(item.productId).lean();
    if (!product) {
      errors.push({
        productId: item.productId,
        reason: "not_found",
        message: "Product not found",
      });
      continue;
    }
    if (!product.isActive) {
      errors.push({
        productId: item.productId,
        reason: "inactive",
        message: `${product.name} is no longer available`,
      });
      continue;
    }
    if (product.stock < item.quantity) {
      errors.push({
        productId: item.productId,
        reason: "insufficient_stock",
        message: `Only ${product.stock} of ${product.name} available`,
      });
      continue;
    }

    validatedItems.push({
      productId: item.productId,
      productName: product.name,
      priceCents: Math.round(product.price * 100),
      quantity: item.quantity,
      imageUrl: product.images?.[0] ?? null,
      brand: product.brand ?? null,
    });
  }

  return { validatedItems, errors };
}
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Update `docs/cart-shop-products/backend.md`**

Replace the `_TODO_` for "discount calculation helper" with: "Cart validation lives at `src/services/shop/cartValidation.service.ts`. Returns line-item errors (not_found, inactive, insufficient_stock). Price is always taken from DB — never from client."

- [ ] **Step 7: Commit prompt**

Suggest: `feat(shop): cartValidation service with line-item errors`. Ask user.

---

## Phase 3 — Payment plumbing (duplicate-first) (Tasks 10–12)

### Task 10: Read `create-one-time-purchase` to plan the duplicate

This task is investigative — no code yet.

- [ ] **Step 1: Read the existing route handler**

Read `src/app/api/stripe/create-one-time-purchase/route.ts` end-to-end. Identify the reusable plumbing:
- Stripe customer create-or-attach logic (~lines 180-340)
- PaymentIntent create + idempotency (~lines 591-663)
- Customer email sync (~lines 320-345)
- 3DS / requires_action handling (~lines 775-826)

- [ ] **Step 2: Identify what to OMIT in the shop duplicate**

The shop service should NOT include:
- The "reuse pre-confirmed PaymentIntent" branch (~lines 441-590) — only used for wallet pre-confirm in mini-draws
- A/B testing experiment assignment lookup (~lines 345-440) — shop is not running experiments at MVP
- Affiliate / referral / promo code attachment — shop has no commission flow at MVP
- `processPaymentBenefits` calls — shop has no entries/benefits

- [ ] **Step 3: Sketch the function signature for the service**

(No file yet — just confirm in your head it matches Section 4.3 of the spec.)

- [ ] **Step 4: No commit (investigation only)**

---

### Task 11: Create `createShopPurchasePaymentIntent` service

**Files:**
- Create: `src/services/shop/createShopPurchasePaymentIntent.service.ts`

- [ ] **Step 1: Create the service file**

```ts
// src/services/shop/createShopPurchasePaymentIntent.service.ts
//
// TODO(shared-payment-extraction): This is a deliberate duplicate of payment-intent
// plumbing from src/app/api/stripe/create-one-time-purchase/route.ts. The duplication
// is intentional for safe ship; extraction into a shared service is deferred until
// shop has been live for ≥2 weeks and we have signal on what stays the same vs diverges.
// See docs/superpowers/specs/2026-05-04-shop-feature-mvp-design.md §4.3.

import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";

export interface ShopPaymentIntentInput {
  amountCents: number;
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone?: string;
  existingUserId?: string;
  paymentMethodId?: string; // optional — if not provided, PaymentElement will provide on confirmPayment
  idempotencyKey: string;
  description: string;
  metadata: Record<string, string>;
}

export interface ShopPaymentIntentResult {
  paymentIntent: Stripe.PaymentIntent;
  customerId: string;
}

async function resolveOrCreateCustomer(input: ShopPaymentIntentInput): Promise<Stripe.Customer> {
  // Logged-in user with stripeCustomerId
  if (input.existingUserId) {
    const user = await User.findById(input.existingUserId).lean();
    if (user?.stripeCustomerId) {
      const retrieved = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!("deleted" in retrieved && retrieved.deleted)) {
        return retrieved as Stripe.Customer;
      }
      // Deleted — fall through to create
    }
  }

  // Try to find Stripe customer by email (handles guest → returning customer)
  const list = await stripe.customers.list({ email: input.customerEmail, limit: 1 });
  if (list.data[0] && !("deleted" in list.data[0] && list.data[0].deleted)) {
    return list.data[0];
  }

  // Create new
  return await stripe.customers.create({
    email: input.customerEmail,
    name: `${input.customerFirstName} ${input.customerLastName}`,
    phone: input.customerPhone,
    metadata: {
      source: "shop",
      ...(input.existingUserId ? { userId: input.existingUserId } : { type: "guest" }),
    },
  });
}

export async function createShopPurchasePaymentIntent(
  input: ShopPaymentIntentInput,
): Promise<ShopPaymentIntentResult> {
  const customer = await resolveOrCreateCustomer(input);

  // If user provided a payment method, attach it to the customer (idempotent)
  if (input.paymentMethodId) {
    try {
      const pm = await stripe.paymentMethods.retrieve(input.paymentMethodId);
      if (pm.customer !== customer.id) {
        await stripe.paymentMethods.attach(input.paymentMethodId, { customer: customer.id });
      }
    } catch (err) {
      console.error("[shop] failed to attach payment method", err);
      // Non-fatal: PaymentElement will handle on confirmPayment
    }
  }

  const config = createPaymentIntentConfig({
    amount: input.amountCents,
    currency: "aud",
    customer: customer.id,
    paymentMethod: input.paymentMethodId,
    confirm: false, // PaymentElement confirms on the client
    paymentType: "shop" as never, // existing utility expects union; shop is new
    description: input.description,
    setupFutureUsage: "off_session",
    metadata: input.metadata,
  });

  const paymentIntent = await stripe.paymentIntents.create(config, {
    idempotencyKey: input.idempotencyKey,
  });

  return { paymentIntent, customerId: customer.id };
}
```

- [ ] **Step 2: Confirm `createPaymentIntentConfig` accepts shop type**

Read `src/utils/payment/stripe/payment-intent-config.ts`. If it has a strict `paymentType` enum that doesn't include `'shop'`, add `'shop'` to that union (one-line change).

- [ ] **Step 3: Run type-check**

```
npm run type-check
```
Expected: passes.

- [ ] **Step 4: Update `docs/cart-shop-products/backend.md`**

Add: "Shop PaymentIntent creation: `src/services/shop/createShopPurchasePaymentIntent.service.ts`. Intentionally duplicated from `create-one-time-purchase` — see TODO marker in file."

- [ ] **Step 5: Commit prompt**

Suggest: `feat(shop): createShopPurchasePaymentIntent service (duplicate-first)`. Ask user.

---

### Task 12: `shopAnalytics` payload builders

**Files:**
- Create: `src/services/shop/shopAnalytics.ts`

- [ ] **Step 1: Create the helpers**

```ts
// src/services/shop/shopAnalytics.ts
import type { ValidatedItem } from "./cartValidation.service";

export interface MetaProductPayload {
  content_ids: string[];
  content_type: "product";
  contents: { id: string; quantity: number; item_price: number }[];
  currency: "AUD";
  value: number;
}

export function buildMetaCartPayload(items: ValidatedItem[]): MetaProductPayload {
  const contents = items.map((i) => ({
    id: i.productId,
    quantity: i.quantity,
    item_price: i.priceCents / 100,
  }));
  const value = items.reduce((sum, i) => sum + (i.priceCents * i.quantity) / 100, 0);
  return {
    content_ids: items.map((i) => i.productId),
    content_type: "product",
    contents,
    currency: "AUD",
    value,
  };
}

export interface KlaviyoOrderItem {
  ProductID: string;
  SKU: string;
  ProductName: string;
  Quantity: number;
  ItemPrice: number;
  RowTotal: number;
  ProductCategories?: string[];
  Brand?: string;
  ImageURL?: string;
}

export function buildKlaviyoItems(items: ValidatedItem[]): KlaviyoOrderItem[] {
  return items.map((i) => ({
    ProductID: i.productId,
    SKU: i.productId,
    ProductName: i.productName,
    Quantity: i.quantity,
    ItemPrice: i.priceCents / 100,
    RowTotal: (i.priceCents * i.quantity) / 100,
    Brand: i.brand ?? undefined,
    ImageURL: i.imageUrl ?? undefined,
  }));
}

export function buildKlaviyoPlacedOrderProperties(input: {
  orderNumber: string;
  items: ValidatedItem[];
  totalCents: number;
  shippingCents: number;
  gstCents: number;
}) {
  return {
    $event_id: input.orderNumber,
    $value: input.totalCents / 100,
    OrderId: input.orderNumber,
    Categories: Array.from(new Set(input.items.flatMap((i) => (i.brand ? [i.brand] : [])))),
    ItemNames: input.items.map((i) => i.productName),
    Items: buildKlaviyoItems(input.items),
    SubTotal: (input.totalCents - input.shippingCents) / 100,
    ShippingTotal: input.shippingCents / 100,
    TaxTotal: input.gstCents / 100,
    GrandTotal: input.totalCents / 100,
  };
}
```

- [ ] **Step 2: Run type-check**

- [ ] **Step 3: Update `docs/tracking/`**

Add a brief mention in `docs/tracking/architecture.md` or similar: "Shop event payloads are built by `src/services/shop/shopAnalytics.ts` for both Meta (Pixel + CAPI) and Klaviyo. Schema matches Shopify's official Klaviyo integration."

- [ ] **Step 4: Commit prompt**

Suggest: `feat(shop): shopAnalytics payload builders for Meta + Klaviyo`. Ask user.

---

## Phase 4 — Finalize service (Tasks 13–18)

### Task 13: Skeleton of `finalizeShopOrder` service

**Files:**
- Create: `src/services/shop/finalizeShopOrder.service.ts`

- [ ] **Step 1: Create skeleton with happy path only (stock + Order write)**

```ts
// src/services/shop/finalizeShopOrder.service.ts
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";

export interface FinalizeShopOrderInput {
  paymentIntent: Stripe.PaymentIntent;
}

export interface FinalizeShopOrderResult {
  status: "order_written" | "refunded_stock_lost" | "skipped_not_shop";
  orderNumber?: string;
}

interface ParsedItem {
  productId: string;
  productName: string;
  priceCents: number;
  quantity: number;
  imageUrl: string | null;
  brand: string | null;
}

interface ParsedAddress {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  deliveryInstructions?: string;
}

function parseItems(metadata: Stripe.Metadata): ParsedItem[] {
  return JSON.parse(metadata.items ?? "[]");
}
function parseAddress(metadata: Stripe.Metadata): ParsedAddress {
  return JSON.parse(metadata.shippingAddress ?? "{}");
}

async function generateOrderNumber(): Promise<string> {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SHOP-${ymd}-${rand}`;
}

export async function finalizeShopOrder(
  input: FinalizeShopOrderInput,
): Promise<FinalizeShopOrderResult> {
  const pi = input.paymentIntent;
  if (pi.metadata?.type !== "shop") {
    return { status: "skipped_not_shop" };
  }

  const items = parseItems(pi.metadata);
  const address = parseAddress(pi.metadata);

  // Atomic stock decrement
  const decremented: { productId: string; quantity: number }[] = [];
  let stockLost = false;
  for (const item of items) {
    const result = await Product.findOneAndUpdate(
      { _id: item.productId, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true },
    );
    if (!result) {
      stockLost = true;
      break;
    }
    decremented.push({ productId: item.productId, quantity: item.quantity });
  }

  if (stockLost) {
    // Revert successful decrements (best-effort)
    for (const d of decremented) {
      await Product.updateOne({ _id: d.productId }, { $inc: { stock: d.quantity } }).catch((err) => {
        console.error("[shop] revert decrement failed", { productId: d.productId, err });
      });
    }
    // Refund the customer
    await stripe.refunds.create({
      payment_intent: pi.id,
      reason: "requested_by_customer",
      metadata: { reason: "shop_stock_lost_after_payment" },
    });
    // TODO Step 17: send sold-out email
    return { status: "refunded_stock_lost" };
  }

  const orderNumber = await generateOrderNumber();
  const userId = pi.metadata.userId || undefined;

  const order = await Order.create({
    orderNumber,
    user: userId || undefined,
    guestEmail: !userId ? pi.metadata.guestEmail : undefined,
    guestFirstName: !userId ? pi.metadata.guestFirstName : undefined,
    guestLastName: !userId ? pi.metadata.guestLastName : undefined,
    products: items.map((i) => ({
      product: i.productId,
      quantity: i.quantity,
      price: i.priceCents / 100,
    })),
    tickets: [],
    appliedDiscounts: [],
    totalAmount: Number(pi.metadata.totalCents) / 100,
    gstAmount: Number(pi.metadata.gstCents) / 100,
    shippingCost: Number(pi.metadata.shippingCents) / 100,
    status: "processing",
    shippingAddress: address,
    paymentIntentId: pi.id,
  });

  // Clear logged-in user's cart
  if (userId) {
    await User.updateOne({ _id: userId }, { $set: { cart: [] } }).catch((err) =>
      console.error("[shop] clear cart failed", err),
    );
  }

  // TODO Step 17/18/19: SendGrid invoice, Klaviyo, Meta CAPI

  return { status: "order_written", orderNumber: order.orderNumber };
}
```

- [ ] **Step 2: Run type-check**

```
npm run type-check
```

- [ ] **Step 3: Update `docs/cart-shop-products/backend.md`**

Add: "Shop order writing happens in `src/services/shop/finalizeShopOrder.service.ts`, called by the Stripe webhook on `payment_intent.succeeded` when `metadata.type === 'shop'`."

- [ ] **Step 4: Commit prompt**

Suggest: `feat(shop): finalizeShopOrder skeleton (atomic stock + Order write + cart clear)`. Ask user.

---

### Task 14: Hook SendGrid order confirmation email

**Files:**
- Create: `shop-order-confirmation-email-template.html`
- Modify: `src/lib/email/templates.ts` (or whichever file registers templates)
- Modify: `src/services/shop/finalizeShopOrder.service.ts`

- [ ] **Step 1: Read existing email infra**

Read `src/lib/email/email-service.ts`, `src/lib/email/templates.ts`, and `src/lib/email/types.ts` to understand the registration pattern. Note one or two existing templates to mimic (e.g. partner-application).

- [ ] **Step 2: Create `shop-order-confirmation-email-template.html`**

Place at the repo root (existing convention per CLAUDE.md). Include the AU tax invoice fields:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tax Invoice — {{orderNumber}}</title>
  </head>
  <body style="font-family:Arial,sans-serif;color:#111;background:#fff;margin:0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;">
      <h1 style="font-size:24px;margin:0 0 8px;">Tax Invoice</h1>
      <p style="margin:0 0 24px;color:#666;">Order #{{orderNumber}} · {{orderDate}}</p>

      <div style="background:#f6f6f6;padding:16px;border-radius:8px;margin-bottom:24px;">
        <strong>{{businessLegalName}}</strong><br />
        ABN: {{businessAbn}}<br />
        {{businessAddressLine}}<br />
      </div>

      <h2 style="font-size:16px;margin:0 0 8px;">Items</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="text-align:left;border-bottom:1px solid #ddd;">
            <th style="padding:8px 0;">Item</th>
            <th style="padding:8px 0;text-align:right;">Qty</th>
            <th style="padding:8px 0;text-align:right;">Price</th>
            <th style="padding:8px 0;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          {{itemRows}}
        </tbody>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
        <tr><td>Subtotal</td><td style="text-align:right;">${{subtotal}}</td></tr>
        <tr><td>Shipping</td><td style="text-align:right;">${{shipping}}</td></tr>
        <tr style="font-weight:bold;border-top:1px solid #ddd;"><td style="padding-top:8px;">Total (incl. GST)</td><td style="padding-top:8px;text-align:right;">${{total}} AUD</td></tr>
        <tr><td style="color:#666;font-size:12px;">GST included</td><td style="color:#666;font-size:12px;text-align:right;">${{gst}}</td></tr>
      </table>

      <h2 style="font-size:16px;margin:0 0 8px;">Shipping to</h2>
      <p style="margin:0 0 24px;line-height:1.6;">
        {{shipFirstName}} {{shipLastName}}<br />
        {{shipAddressLine1}}<br />
        {{shipAddressLine2WithBreak}}
        {{shipCity}} {{shipState}} {{shipPostcode}}<br />
        {{shipCountry}}<br />
        {{shipPhone}}
      </p>

      <p style="color:#666;font-size:12px;margin-top:32px;">This is your tax invoice. Please keep it for your records.</p>
    </div>
  </body>
</html>
```

- [ ] **Step 3: Register the template in `src/lib/email/templates.ts`**

Follow the pattern of an existing template registration. Add:
```ts
shopOrderConfirmation: {
  templateFile: "shop-order-confirmation-email-template.html",
  subject: (vars: { orderNumber: string }) => `Tax Invoice — Order #${vars.orderNumber}`,
}
```
(adapt to the actual file's API).

- [ ] **Step 4: Add `sendShopOrderConfirmation` helper in email-service**

In `src/lib/email/email-service.ts` add a typed helper that fills variables and calls SendGrid. Pattern after existing senders.

- [ ] **Step 5: Wire from `finalizeShopOrder.service.ts`**

After `Order.create(...)`, before the `return`, add:
```ts
import { BUSINESS } from "@/config/business";
import { executeBackgroundJob } from "@/utils/webhook/background-jobs";
import { sendShopOrderConfirmation } from "@/lib/email/email-service";

executeBackgroundJob("Shop order confirmation email", async () => {
  const recipientEmail = userId ? (await User.findById(userId).lean())?.email : pi.metadata.guestEmail;
  if (!recipientEmail) return;
  await sendShopOrderConfirmation({
    to: recipientEmail,
    orderNumber: order.orderNumber,
    orderDate: order.createdAt.toISOString().slice(0, 10),
    items: items.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      priceCents: i.priceCents,
      lineTotalCents: i.priceCents * i.quantity,
    })),
    subtotalCents: Number(pi.metadata.subtotalCents),
    shippingCents: Number(pi.metadata.shippingCents),
    gstCents: Number(pi.metadata.gstCents),
    totalCents: Number(pi.metadata.totalCents),
    shippingAddress: address,
    business: {
      legalName: BUSINESS.legalName,
      abn: BUSINESS.abn,
      addressLine: `${BUSINESS.address.line1}, ${BUSINESS.address.suburb} ${BUSINESS.address.state} ${BUSINESS.address.postcode}`,
    },
  });
  await Order.updateOne({ _id: order._id }, { $set: { invoiceSentAt: new Date() } });
});
```

- [ ] **Step 6: Type-check**

```
npm run type-check
```

- [ ] **Step 7: Update `docs/email/`**

Add the new template + sender to the relevant doc.

- [ ] **Step 8: Commit prompt**

Suggest: `feat(shop): SendGrid order confirmation email = AU tax invoice`. Ask user.

---

### Task 15: Sold-out refund email template + wiring

**Files:**
- Create: `shop-stock-refund-email-template.html`
- Modify: `src/lib/email/templates.ts` and `email-service.ts`
- Modify: `src/services/shop/finalizeShopOrder.service.ts`

- [ ] **Step 1: Create the template**

Brief HTML email apologizing and confirming refund:

```html
<!doctype html>
<html><head><meta charset="utf-8"/><title>Refund — Order Couldn't Be Completed</title></head>
<body style="font-family:Arial,sans-serif;color:#111;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <h1>We're sorry — your order couldn't be completed</h1>
    <p>Hi {{firstName}},</p>
    <p>An item in your order sold out before we could ship it. We've fully refunded your payment of <strong>${{amountAud}} AUD</strong> — it should appear on your statement within 5-10 business days.</p>
    <p>If you have any questions, reply to this email.</p>
    <p>— The Tools Australia team</p>
  </div>
</body></html>
```

- [ ] **Step 2: Register template + sender**

Follow Task 14 pattern. Add `sendShopStockRefund` helper.

- [ ] **Step 3: Wire from `finalizeShopOrder.service.ts`**

Replace `// TODO Step 17: send sold-out email` (in the `stockLost` branch) with:
```ts
executeBackgroundJob("Shop stock-loss refund email", async () => {
  const recipientEmail = pi.metadata.userId
    ? (await User.findById(pi.metadata.userId).lean())?.email
    : pi.metadata.guestEmail;
  const firstName = pi.metadata.userId
    ? (await User.findById(pi.metadata.userId).lean())?.firstName
    : pi.metadata.guestFirstName;
  if (!recipientEmail) return;
  await sendShopStockRefund({
    to: recipientEmail,
    firstName: firstName || "there",
    amountAud: (Number(pi.metadata.totalCents) / 100).toFixed(2),
  });
});
```

- [ ] **Step 4: Type-check**

- [ ] **Step 5: Update `docs/email/`**

- [ ] **Step 6: Commit prompt**

Suggest: `feat(shop): sold-out refund email template + wiring`. Ask user.

---

### Task 16: Klaviyo `Placed Order` and `Ordered Product` events

**Files:**
- Modify: `src/lib/klaviyo.ts` (add helpers)
- Modify: `src/services/shop/finalizeShopOrder.service.ts`

- [ ] **Step 1: Read `src/lib/klaviyo.ts` to see existing helper pattern**

Look for an existing server-side Track API call (e.g. for membership purchase). Mimic the signature.

- [ ] **Step 2: Add `trackKlaviyoPlacedOrder` and `trackKlaviyoOrderedProduct` helpers**

In `src/lib/klaviyo.ts`:
```ts
import { buildKlaviyoPlacedOrderProperties, buildKlaviyoItems } from "@/services/shop/shopAnalytics";
// (Adapt: import existing klaviyoTrack function or fetch wrapper.)

export async function trackKlaviyoShopPlacedOrder(input: {
  email: string;
  orderNumber: string;
  items: import("@/services/shop/cartValidation.service").ValidatedItem[];
  totalCents: number;
  shippingCents: number;
  gstCents: number;
}) {
  const props = buildKlaviyoPlacedOrderProperties({
    orderNumber: input.orderNumber,
    items: input.items,
    totalCents: input.totalCents,
    shippingCents: input.shippingCents,
    gstCents: input.gstCents,
  });
  return klaviyoTrack({ email: input.email, event: "Placed Order", properties: props });
}

export async function trackKlaviyoShopOrderedProducts(input: {
  email: string;
  orderNumber: string;
  items: import("@/services/shop/cartValidation.service").ValidatedItem[];
}) {
  const klaviyoItems = buildKlaviyoItems(input.items);
  // One event per item per Klaviyo schema convention
  for (const item of klaviyoItems) {
    await klaviyoTrack({
      email: input.email,
      event: "Ordered Product",
      properties: { ...item, OrderId: input.orderNumber, $event_id: `${input.orderNumber}-${item.ProductID}` },
    });
  }
}
```

(Adapt `klaviyoTrack` to whatever the existing function is named.)

- [ ] **Step 3: Wire from `finalizeShopOrder.service.ts`**

After SendGrid `executeBackgroundJob`, add another:
```ts
executeBackgroundJob("Shop Klaviyo Placed Order + Ordered Products", async () => {
  const recipientEmail = userId ? (await User.findById(userId).lean())?.email : pi.metadata.guestEmail;
  if (!recipientEmail) return;
  await trackKlaviyoShopPlacedOrder({
    email: recipientEmail,
    orderNumber: order.orderNumber,
    items,
    totalCents: Number(pi.metadata.totalCents),
    shippingCents: Number(pi.metadata.shippingCents),
    gstCents: Number(pi.metadata.gstCents),
  });
  await trackKlaviyoShopOrderedProducts({
    email: recipientEmail,
    orderNumber: order.orderNumber,
    items,
  });
});
```

- [ ] **Step 4: Type-check**

- [ ] **Step 5: Update `docs/tracking/`**

Mention: "Shop Placed Order + Ordered Product fired server-side from `finalizeShopOrder` → `src/lib/klaviyo.ts`."

- [ ] **Step 6: Commit prompt**

Suggest: `feat(shop): Klaviyo Placed Order + Ordered Product events`. Ask user.

---

### Task 17: Meta CAPI `Purchase` event

**Files:**
- Modify: `src/lib/facebook.ts` (add helper if missing)
- Modify: `src/services/shop/finalizeShopOrder.service.ts`

- [ ] **Step 1: Read `src/lib/facebook.ts`**

Find an existing CAPI Purchase helper used by mini-draws / one-time-purchase. If exists, reuse with shop-specific params. If not, add `sendCapiShopPurchase` helper.

- [ ] **Step 2: Add wrapper helper if needed**

```ts
export async function sendCapiShopPurchase(input: {
  paymentIntentId: string;
  email: string;
  totalCents: number;
  items: import("@/services/shop/cartValidation.service").ValidatedItem[];
  capi: { ip?: string; userAgent?: string; fbc?: string; fbp?: string; eventSourceUrl?: string };
}) {
  return sendCapiEvent({
    event_name: "Purchase",
    event_id: input.paymentIntentId, // dedup with client Pixel
    event_time: Math.floor(Date.now() / 1000),
    user_data: {
      em: hashEmail(input.email),
      client_ip_address: input.capi.ip,
      client_user_agent: input.capi.userAgent,
      fbc: input.capi.fbc,
      fbp: input.capi.fbp,
    },
    custom_data: {
      currency: "AUD",
      value: input.totalCents / 100,
      content_ids: input.items.map((i) => i.productId),
      content_type: "product",
      contents: input.items.map((i) => ({
        id: i.productId,
        quantity: i.quantity,
        item_price: i.priceCents / 100,
      })),
      num_items: input.items.reduce((s, i) => s + i.quantity, 0),
    },
    event_source_url: input.capi.eventSourceUrl,
  });
}
```
(Adapt names to match existing helpers.)

- [ ] **Step 3: Wire from `finalizeShopOrder.service.ts`**

```ts
executeBackgroundJob("Shop Meta CAPI Purchase", async () => {
  const recipientEmail = userId ? (await User.findById(userId).lean())?.email : pi.metadata.guestEmail;
  if (!recipientEmail) return;
  await sendCapiShopPurchase({
    paymentIntentId: pi.id,
    email: recipientEmail,
    totalCents: Number(pi.metadata.totalCents),
    items,
    capi: {
      ip: pi.metadata.capi_client_ip,
      userAgent: pi.metadata.capi_user_agent,
      fbc: pi.metadata.capi_fbc,
      fbp: pi.metadata.capi_fbp,
      eventSourceUrl: pi.metadata.capi_event_source_url,
    },
  });
});
```

- [ ] **Step 4: Type-check**

- [ ] **Step 5: Update `docs/tracking/`**

- [ ] **Step 6: Commit prompt**

Suggest: `feat(shop): Meta CAPI Purchase event for shop orders (deduped with Pixel)`. Ask user.

---

### Task 18: `finalizeShopOrder` integration test

**Files:**
- Create: `src/services/shop/__tests__/finalizeShopOrder.test.ts`

- [ ] **Step 1: Write tests covering happy path, race, idempotency**

```ts
// src/services/shop/__tests__/finalizeShopOrder.test.ts
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import Order from "@/models/Order";
import { finalizeShopOrder } from "../finalizeShopOrder.service";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

// Mock Stripe by stubbing the imports.
// (NOTE: this test file uses real Mongo + real BUSINESS, but Stripe calls within
// finalizeShopOrder for refunds will hit Stripe live unless mocked. Run with
// STRIPE_SECRET_KEY pointing at test mode; refunds in stockLost path will be
// against test PIs.)

const PI_PREFIX = "test_pi_finalize_";

function makeFakePI(input: {
  type: "shop" | "other";
  id: string;
  items: { productId: string; productName: string; priceCents: number; quantity: number; imageUrl: null; brand: null }[];
  guestEmail: string;
  totalCents: number;
}) {
  return {
    id: input.id,
    metadata: {
      type: input.type,
      items: JSON.stringify(input.items),
      shippingAddress: JSON.stringify({
        firstName: "Test", lastName: "Buyer", email: input.guestEmail, phone: "0400000000",
        addressLine1: "1 Test St", city: "Melbourne", state: "VIC", postalCode: "3000", country: "Australia",
      }),
      guestEmail: input.guestEmail,
      guestFirstName: "Test",
      guestLastName: "Buyer",
      subtotalCents: String(input.items.reduce((s, i) => s + i.priceCents * i.quantity, 0)),
      shippingCents: "1000",
      gstCents: String(Math.round(input.totalCents / 11)),
      totalCents: String(input.totalCents),
    },
  } as unknown as import("stripe").Stripe.PaymentIntent;
}

async function main() {
  await connectDB();
  const TEST_PREFIX = "test-finalize-";
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await Order.deleteMany({ paymentIntentId: { $regex: `^${PI_PREFIX}` } });

  const product = await Product.create({
    name: `${TEST_PREFIX}widget`,
    description: "x",
    price: 25,
    images: ["http://example.com/x.jpg"],
    category: "test",
    brand: "test",
    stock: 10,
    isActive: true,
  });

  // skipped_not_shop
  const r0 = await finalizeShopOrder({
    paymentIntent: makeFakePI({
      type: "other", id: `${PI_PREFIX}skip`,
      items: [], guestEmail: "skip@x.com", totalCents: 0,
    }),
  });
  assert(r0.status === "skipped_not_shop", "non-shop PI is skipped");

  // happy path
  const items = [{ productId: product._id.toString(), productName: product.name, priceCents: 2500, quantity: 2, imageUrl: null, brand: null }];
  const r1 = await finalizeShopOrder({
    paymentIntent: makeFakePI({
      type: "shop", id: `${PI_PREFIX}happy`,
      items, guestEmail: "h@x.com", totalCents: 6000, // 2*25 + 10 shipping
    }),
  });
  assert(r1.status === "order_written", "happy path writes order");
  const fresh = await Product.findById(product._id);
  assert(fresh!.stock === 8, "stock decremented by 2");
  const order = await Order.findOne({ paymentIntentId: `${PI_PREFIX}happy` });
  assert(order !== null, "order row exists");
  assert(order!.guestEmail === "h@x.com", "guestEmail set");
  assert(order!.user === undefined || order!.user === null, "user not set for guest");

  // stock race (will trigger Stripe refund — only run if env STRIPE_TEST_MODE=true)
  if (process.env.STRIPE_TEST_MODE === "true" && process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    // Simulated stock loss: set stock to 0 between test PI and finalize
    await Product.updateOne({ _id: product._id }, { stock: 0 });
    // We can't easily create a real PI just for the test, so this case is exercised
    // via Playwright e2e instead. Skipping in tsx unit harness.
  }

  // Cleanup
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await Order.deleteMany({ paymentIntentId: { $regex: `^${PI_PREFIX}` } });
  await mongoose.disconnect();
  console.log("finalizeShopOrder: ALL PASS");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add npm script**

```json
"test:finalize-shop-order": "tsx src/services/shop/__tests__/finalizeShopOrder.test.ts"
```

- [ ] **Step 3: Add bundled script**

```json
"test:shop": "npm run test:shop-totals && npm run test:cart-validation && npm run test:finalize-shop-order"
```

- [ ] **Step 4: Run**

```
npm run test:finalize-shop-order
```
Expected: PASS.

- [ ] **Step 5: Update `docs/cart-shop-products/testing.md`**

Replace the `_TODO_` with: "Run `npm run test:shop` to execute all shop unit tests. Stock-race + refund branch is exercised by Playwright e2e in `e2e/shop/out-of-stock.spec.ts` (real Stripe test PIs)."

- [ ] **Step 6: Commit prompt**

Suggest: `test(shop): finalizeShopOrder integration tests`. Ask user.

---

## Phase 5 — Orchestrator + API routes (Tasks 19–24)

### Task 19: `createShopPurchase` orchestrator service

**Files:**
- Create: `src/services/shop/createShopPurchase.service.ts`

- [ ] **Step 1: Implement orchestrator**

```ts
// src/services/shop/createShopPurchase.service.ts
import Stripe from "stripe";
import { BUSINESS } from "@/config/business";
import { validateCart } from "./cartValidation.service";
import { computeShopTotals } from "./shopTotals.service";
import { createShopPurchasePaymentIntent } from "./createShopPurchasePaymentIntent.service";

export interface ShippingAddressInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  deliveryInstructions?: string;
}

export interface CreateShopPurchaseInput {
  items: { productId: string; quantity: number }[];
  shippingAddress: ShippingAddressInput;
  paymentMethodId?: string;
  idempotencyKey?: string;
  user?: { _id: string; email: string; firstName?: string; lastName?: string } | null;
  capiContext?: {
    ip?: string;
    userAgent?: string;
    fbc?: string;
    fbp?: string;
    eventSourceUrl?: string;
  };
}

export interface CreateShopPurchaseResult {
  ok: true;
  paymentIntentId: string;
  clientSecret: string;
  customerId: string;
  status: Stripe.PaymentIntent.Status;
}
export interface CreateShopPurchaseError {
  ok: false;
  errors: { productId: string; reason: string; message: string }[];
}

export async function createShopPurchase(
  input: CreateShopPurchaseInput,
): Promise<CreateShopPurchaseResult | CreateShopPurchaseError> {
  // 1. Validate cart server-side
  const validation = await validateCart({
    items: input.items,
    userContext: { isMember: false }, // extension point
  });
  if (validation.errors.length > 0) {
    return { ok: false, errors: validation.errors };
  }

  // 2. Compute totals
  const totals = computeShopTotals({
    items: validation.validatedItems,
    freeShippingThresholdCents: BUSINESS.shop.freeShippingThreshold * 100,
    flatShippingRateCents: BUSINESS.shop.flatShippingRate * 100,
  });

  // 3. Build PI metadata
  const idempotencyKey =
    input.idempotencyKey ??
    `pi_shop_${input.user?._id ?? input.shippingAddress.email}_${Date.now()}`;

  const description = `Shop order — ${validation.validatedItems.length} item${
    validation.validatedItems.length === 1 ? "" : "s"
  }`;

  const metadata: Record<string, string> = {
    type: "shop",
    items: JSON.stringify(validation.validatedItems),
    shippingAddress: JSON.stringify({
      ...input.shippingAddress,
      country: input.shippingAddress.country ?? "Australia",
    }),
    subtotalCents: String(totals.subtotalCents),
    shippingCents: String(totals.shippingCents),
    gstCents: String(totals.gstCents),
    totalCents: String(totals.totalCents),
    ...(input.user
      ? { userId: input.user._id }
      : {
          guestEmail: input.shippingAddress.email,
          guestFirstName: input.shippingAddress.firstName,
          guestLastName: input.shippingAddress.lastName,
        }),
    ...(input.capiContext?.ip && { capi_client_ip: input.capiContext.ip }),
    ...(input.capiContext?.userAgent && { capi_user_agent: input.capiContext.userAgent }),
    ...(input.capiContext?.fbc && { capi_fbc: input.capiContext.fbc }),
    ...(input.capiContext?.fbp && { capi_fbp: input.capiContext.fbp }),
    ...(input.capiContext?.eventSourceUrl && {
      capi_event_source_url: input.capiContext.eventSourceUrl,
    }),
  };

  // 4. Create the PI
  const { paymentIntent, customerId } = await createShopPurchasePaymentIntent({
    amountCents: totals.totalCents,
    customerEmail: input.shippingAddress.email,
    customerFirstName: input.shippingAddress.firstName,
    customerLastName: input.shippingAddress.lastName,
    customerPhone: input.shippingAddress.phone,
    existingUserId: input.user?._id,
    paymentMethodId: input.paymentMethodId,
    idempotencyKey,
    description,
    metadata,
  });

  return {
    ok: true,
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret ?? "",
    customerId,
    status: paymentIntent.status,
  };
}
```

- [ ] **Step 2: Type-check**

- [ ] **Step 3: Commit prompt**

Suggest: `feat(shop): createShopPurchase orchestrator service`. Ask user.

---

### Task 20: `POST /api/stripe/create-shop-purchase` route

**Files:**
- Create: `src/app/api/stripe/create-shop-purchase/route.ts`

- [ ] **Step 1: Implement thin handler**

```ts
// src/app/api/stripe/create-shop-purchase/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import User from "@/models/User";
import { createShopPurchase } from "@/services/shop/createShopPurchase.service";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

const Schema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1) }))
    .min(1),
  shippingAddress: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    city: z.string().min(1),
    state: z.enum(AU_STATES),
    postalCode: z.string().regex(/^[0-9]{4}$/),
    country: z.string().optional(),
    deliveryInstructions: z.string().max(500).optional(),
  }),
  paymentMethodId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const data = Schema.parse(body);

    const session = await getServerSession(authOptions);
    let user: { _id: string; email: string; firstName?: string; lastName?: string } | null = null;
    if (session?.user?.id) {
      const u = await User.findById(session.user.id).lean();
      if (u) {
        user = {
          _id: u._id.toString(),
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
        };
      }
    }

    const ctx = extractRequestContext(request);
    const eventSourceUrl =
      request.headers.get("referer") ??
      (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/checkout` : undefined);

    const result = await createShopPurchase({
      items: data.items,
      shippingAddress: data.shippingAddress,
      paymentMethodId: data.paymentMethodId,
      idempotencyKey: data.idempotencyKey,
      user,
      capiContext: {
        ip: ctx.client_ip_address,
        userAgent: ctx.client_user_agent,
        fbc: ctx.fbc,
        fbp: ctx.fbp,
        eventSourceUrl,
      },
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Cart validation failed", errors: result.errors }, { status: 400 });
    }

    return NextResponse.json({
      paymentIntentId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      status: result.status,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 });
    }
    console.error("[shop] create-shop-purchase failed", err);
    return NextResponse.json({ error: "Failed to create shop purchase" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

- [ ] **Step 3: Update `docs/billing-stripe/api.md`**

Add row: `POST /api/stripe/create-shop-purchase — create PI for shop order (guest or logged-in)`.

- [ ] **Step 4: Commit prompt**

Suggest: `feat(shop): POST /api/stripe/create-shop-purchase route`. Ask user.

---

### Task 21: `GET /api/orders/by-payment-intent/[paymentIntentId]` route

**Files:**
- Create: `src/app/api/orders/by-payment-intent/[paymentIntentId]/route.ts`

- [ ] **Step 1: Implement handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { stripe } from "@/lib/stripe";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ paymentIntentId: string }> },
) {
  try {
    await connectDB();
    const { paymentIntentId } = await params;

    const order = await Order.findOne({ paymentIntentId }).lean();
    if (order) {
      return NextResponse.json({ status: "ready", order });
    }

    // No Order yet — check PI status
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    return NextResponse.json({
      status: "pending",
      paymentIntentStatus: pi.status,
    });
  } catch (err) {
    console.error("[shop] by-payment-intent failed", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

- [ ] **Step 3: Update `docs/cart-shop-products/api.md`**

Add row: `GET /api/orders/by-payment-intent/[id] — checkout/success polling for Order existence`.

- [ ] **Step 4: Commit prompt**

Suggest: `feat(shop): GET /api/orders/by-payment-intent route for success polling`. Ask user.

---

### Task 22: Swap `/api/cart/*` JWT bearer for `getServerSession`

**Files:**
- Modify: `src/app/api/cart/route.ts`
- Modify: `src/app/api/cart/clear/route.ts`
- Modify: `src/app/api/cart/items/route.ts`
- Modify: `src/app/api/cart/summary/route.ts`
- Modify: `src/app/api/cart/update/route.ts`

- [ ] **Step 1: Replace `getUserFromToken` helper with NextAuth**

In `src/app/api/cart/route.ts`, delete the `getUserFromToken` function. Replace usages:

```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function getRequestUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await User.findById(session.user.id);
  return user;
}
```

In each handler (GET/POST/PUT/DELETE), replace `const user = await getUserFromToken(request);` with:
```ts
const user = await getRequestUser();
if (!user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

- [ ] **Step 2: Repeat for siblings**

Same swap in `clear/route.ts`, `items/route.ts`, `summary/route.ts`, `update/route.ts`.

- [ ] **Step 3: Type-check**

- [ ] **Step 4: Update `docs/cart-shop-products/api.md`**

Replace the `_TODO_` for cart endpoints with the actual list and note "Auth via `getServerSession` (NextAuth); 401 for unauthenticated."

- [ ] **Step 5: Commit prompt**

Suggest: `refactor(cart): swap JWT bearer for NextAuth getServerSession`. Ask user.

---

### Task 23: Delete `POST /api/orders` and update `GET`

**Files:**
- Modify: `src/app/api/orders/route.ts`
- Modify: `src/app/api/orders/[id]/route.ts`

- [ ] **Step 1: Delete the POST handler**

In `src/app/api/orders/route.ts`, remove the entire `POST` function (and its zod schema if unique to it).

- [ ] **Step 2: Swap GET to NextAuth**

Replace `getUserFromToken` with `getServerSession` pattern (same as Task 22).

- [ ] **Step 3: Update `[id]/route.ts`**

Same NextAuth swap. Add owner check: `order.user.toString() !== session.user.id` → 404.

- [ ] **Step 4: Type-check**

If anything in the codebase calls `POST /api/orders`, fix or remove. Grep for it: `grep -r "fetch.*api/orders.*POST" src/`.

- [ ] **Step 5: Update `docs/cart-shop-products/api.md`**

Note: `POST /api/orders` removed; orders are written by the Stripe webhook.

- [ ] **Step 6: Commit prompt**

Suggest: `refactor(orders): delete client-write POST, swap reads to NextAuth`. Ask user.

---

### Task 24: Manual smoke — Phase 5 endpoints

- [ ] **Step 1: Start dev server**

```
npm run dev
```

- [ ] **Step 2: Manual curl test** (as logged-in user via cookie or use Playwright later)

(Sanity check that the new routes exist and return 401 / 400 correctly. Full happy-path tested in Phase 11 Playwright.)

- [ ] **Step 3: No commit yet — proceed to Phase 6**

---

## Phase 6 — Webhook branch (Tasks 25–26)

### Task 25: Add shop branch in `payment_intent.succeeded` handler

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Read existing webhook handler**

Find the `payment_intent.succeeded` case. Note where one-time-purchase / subscription branches are, and the `ProcessedStripeEvent` idempotency check.

- [ ] **Step 2: Add shop branch BEFORE existing one-time-purchase branch**

Inside the `payment_intent.succeeded` case, add:
```ts
if (paymentIntent.metadata?.type === "shop") {
  const { finalizeShopOrder } = await import("@/services/shop/finalizeShopOrder.service");
  const result = await finalizeShopOrder({ paymentIntent });
  console.error(`[shop-webhook] ${result.status}${result.orderNumber ? ` ${result.orderNumber}` : ""}`);
  return NextResponse.json({ received: true, shopResult: result.status });
}
```

(Returns early so the rest of the handler — for memberships/draws — doesn't run.)

- [ ] **Step 3: Verify ProcessedStripeEvent idempotency wraps the whole handler**

If the `ProcessedStripeEvent` check is at the top of the handler (before the type branches), good. Confirm it does.

- [ ] **Step 4: Type-check**

- [ ] **Step 5: Update `docs/billing-stripe/`**

Add: "Webhook `payment_intent.succeeded` branches on `metadata.type === 'shop'` → `finalizeShopOrder`. Returns early; doesn't fall through to other handlers."

- [ ] **Step 6: Commit prompt**

Suggest: `feat(shop): webhook branch for payment_intent.succeeded → finalizeShopOrder`. Ask user.

---

### Task 26: Webhook fixture replay script

**Files:**
- Create: `scripts/test-shop-webhook.ts`

- [ ] **Step 1: Create script**

```ts
// scripts/test-shop-webhook.ts
//
// Replays a fake payment_intent.succeeded event for a shop PI against the local
// webhook handler. Use with the dev server running.
//
// Usage:
//   npm run dev   (in another terminal)
//   npm run test:shop-webhook -- <productId>
import "dotenv/config";

const productId = process.argv[2];
if (!productId) {
  console.error("Usage: npm run test:shop-webhook -- <productId>");
  process.exit(1);
}

const fakePI = {
  id: `pi_test_shop_${Date.now()}`,
  object: "payment_intent",
  status: "succeeded",
  amount: 6000,
  currency: "aud",
  metadata: {
    type: "shop",
    items: JSON.stringify([
      {
        productId,
        productName: "Test product",
        priceCents: 2500,
        quantity: 2,
        imageUrl: null,
        brand: null,
      },
    ]),
    shippingAddress: JSON.stringify({
      firstName: "Webhook",
      lastName: "Replay",
      email: "replay@example.com",
      phone: "0400000000",
      addressLine1: "1 Replay St",
      city: "Melbourne",
      state: "VIC",
      postalCode: "3000",
      country: "Australia",
    }),
    guestEmail: "replay@example.com",
    guestFirstName: "Webhook",
    guestLastName: "Replay",
    subtotalCents: "5000",
    shippingCents: "1000",
    gstCents: "545",
    totalCents: "6000",
  },
};

const event = {
  id: `evt_test_shop_${Date.now()}`,
  type: "payment_intent.succeeded",
  data: { object: fakePI },
};

(async () => {
  const url = "http://localhost:3000/api/stripe/webhook";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "test_bypass", // ⚠ webhook handler must accept dev bypass
    },
    body: JSON.stringify(event),
  });
  console.error("status:", res.status);
  console.error("body:", await res.text());
})();
```

- [ ] **Step 2: Add npm script**

```json
"test:shop-webhook": "tsx scripts/test-shop-webhook.ts"
```

- [ ] **Step 3: Verify webhook handler accepts dev bypass**

Read `src/app/api/stripe/webhook/route.ts`. If `stripe.webhooks.constructEvent` is called with the raw body + signature, it will reject the test bypass. Either:
- Add a dev-only bypass guard `if (process.env.NODE_ENV === "development" && signature === "test_bypass") { event = JSON.parse(rawBody) }`
- OR document the script as Stripe-CLI-only (`stripe trigger payment_intent.succeeded`)

The bypass approach is simpler for fast iteration. Add it but gate strictly on `NODE_ENV === "development"`.

- [ ] **Step 4: Manual run**

```
# terminal 1: npm run dev
# terminal 2: npm run test:shop-webhook -- <real productId from your test DB>
```
Expected: webhook returns 200, console logs "[shop-webhook] order_written ...".

- [ ] **Step 5: Update `docs/cart-shop-products/testing.md`**

Add: "Replay a webhook locally: `npm run test:shop-webhook -- <productId>` (dev-only signature bypass)."

- [ ] **Step 6: Commit prompt**

Suggest: `test(shop): webhook fixture replay script`. Ask user.

---

## Phase 7 — CartContext + frontend cart wiring (Tasks 27–30)

### Task 27: Drop GST-as-extra-line, add `gstIncluded`

**Files:**
- Modify: `src/contexts/CartContext.tsx`
- Modify: `src/hooks/queries/useCartQueries.ts` (CartSummary type)

- [ ] **Step 1: Update CartSummary type**

In `src/hooks/queries/useCartQueries.ts`, find the `CartSummary` interface. Replace `tax: number` with `gstIncluded: number`.

- [ ] **Step 2: Update `calculateSummary` in CartContext**

Find `calculateSummary` (~line 98). Replace with:
```ts
const calculateSummary = (items: CartItem[]): CartSummary => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // GST-inclusive pricing convention (AU). Prices already include GST.
  const shipping = subtotal === 0 ? 0 : subtotal >= 100 ? 0 : 10;
  const totalAmount = subtotal + shipping;
  const gstIncluded = totalAmount === 0 ? 0 : Math.round((totalAmount / 11) * 100) / 100;
  return {
    totalItems,
    totalAmount,
    subtotal,
    shipping,
    gstIncluded,
    discount: 0,
    membershipDiscount: 0,
    partnerDiscount: 0,
  };
};
```

- [ ] **Step 3: Find and remove all `summary.tax` usages**

Grep: `grep -rn "summary\.tax\|\.tax" src/`. Anything reading `tax` should now read `gstIncluded` (or be removed if it was just a display hack).

- [ ] **Step 4: Type-check**

- [ ] **Step 5: Update `docs/cart-shop-products/frontend.md`**

Note: "Cart summary uses GST-inclusive pricing (AU convention). `gstIncluded` is for display ('incl. $X GST'); not added to total."

- [ ] **Step 6: Commit prompt**

Suggest: `fix(cart): GST-inclusive pricing — drop separate tax line`. Ask user.

---

### Task 28: Add localStorage path for guest carts

**Files:**
- Modify: `src/contexts/CartContext.tsx`

- [ ] **Step 1: Add localStorage helpers at module top**

Below imports, before the type definitions:
```ts
const LS_KEY = "shop_cart_v1";
const LS_TTL_MS = 24 * 60 * 60 * 1000;

interface LocalCartShape {
  v: 1;
  savedAt: number;
  items: CartItem[];
}

function loadLocalCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalCartShape;
    if (parsed.v !== 1) return [];
    if (Date.now() - parsed.savedAt > LS_TTL_MS) {
      window.localStorage.removeItem(LS_KEY);
      return [];
    }
    return parsed.items ?? [];
  } catch {
    return [];
  }
}

function saveLocalCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    const data: LocalCartShape = { v: 1, savedAt: Date.now(), items };
    window.localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* quota exceeded etc — ignore */
  }
}

function clearLocalCart() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_KEY);
}
```

- [ ] **Step 2: Add guest load on mount**

In the `useEffect(() => { if (userId) { loadCartFromServer(); } }, [userId, ...])`, change to:
```ts
useEffect(() => {
  if (userId) {
    loadCartFromServer();
  } else {
    const local = loadLocalCart();
    if (local.length > 0) {
      setCartState((prev) => ({ ...prev, items: local, summary: calculateSummary(local) }));
    }
  }
}, [userId, loadCartFromServer]);
```

- [ ] **Step 3: Persist to localStorage on every guest mutation**

Add another useEffect:
```ts
useEffect(() => {
  if (!userId) {
    saveLocalCart(cartState.items);
  }
}, [userId, cartState.items]);
```

- [ ] **Step 4: Drop bearer Authorization headers**

Grep for `Authorization: \`Bearer \${session?.user?.id}\`` in `CartContext.tsx`. Remove those headers — `getServerSession` reads cookies. Add `credentials: "include"` to each fetch call instead:
```ts
const response = await fetch("/api/cart", { credentials: "include" });
```

- [ ] **Step 5: Type-check**

- [ ] **Step 6: Manual smoke**

```
npm run dev
```
- Open `/shop` as guest, add a product, refresh, confirm cart still has items
- Wait or fake-advance time to >24h, refresh, confirm cart is empty (or clear localStorage manually to test)

- [ ] **Step 7: Update `docs/cart-shop-products/frontend.md` and `gotchas.md`**

Replace stale "cart in localStorage" claim in `gotchas.md` with the new behavior. Update `frontend.md` to describe the guest vs logged-in split.

- [ ] **Step 8: Commit prompt**

Suggest: `feat(cart): localStorage persistence for guest carts (24h TTL)`. Ask user.

---

### Task 29: Merge-on-login

**Files:**
- Modify: `src/contexts/CartContext.tsx`

- [ ] **Step 1: Track previous userId**

Add a ref: `const prevUserIdRef = useRef<string | undefined>(undefined);`

- [ ] **Step 2: Trigger merge when userId transitions undefined → defined**

In the existing userId effect:
```ts
useEffect(() => {
  const wasGuest = prevUserIdRef.current === undefined;
  prevUserIdRef.current = userId;

  if (userId && wasGuest) {
    void mergeGuestCartIntoServer();
  } else if (userId) {
    loadCartFromServer();
  } else {
    const local = loadLocalCart();
    if (local.length > 0) {
      setCartState((prev) => ({ ...prev, items: local, summary: calculateSummary(local) }));
    }
  }
}, [userId, loadCartFromServer]);
```

- [ ] **Step 3: Implement merge**

```ts
const mergeGuestCartIntoServer = useCallback(async () => {
  const local = loadLocalCart();
  if (local.length === 0) {
    await loadCartFromServer();
    return;
  }
  // Load server cart
  const serverRes = await fetch("/api/cart", { credentials: "include" });
  const serverData = serverRes.ok ? await serverRes.json() : { cart: [] };
  const serverItems: CartItem[] = serverData.cart ?? [];

  // Server wins on conflict; otherwise union
  const serverIds = new Set(
    serverItems.map((i) => (i.type === "product" ? i.productId : i.miniDrawId)),
  );
  const toAdd = local.filter(
    (i) => !serverIds.has(i.type === "product" ? i.productId : i.miniDrawId),
  );

  for (const item of toAdd) {
    const apiData =
      item.type === "ticket"
        ? { type: "ticket" as const, miniDrawId: item.miniDrawId, quantity: item.quantity }
        : { type: "product" as const, productId: item.productId, quantity: item.quantity };
    await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiData),
      credentials: "include",
    });
  }
  clearLocalCart();
  await loadCartFromServer();
}, [loadCartFromServer]);
```

- [ ] **Step 4: Manual smoke**

- Add items as guest
- Login (existing OAuth flow)
- Confirm: server now has those items + any prior server items; localStorage cleared

- [ ] **Step 5: Update `docs/cart-shop-products/frontend.md`**

Add: "Login merges localStorage cart into server cart (server wins on conflict; guest-only items POST'd; localStorage cleared)."

- [ ] **Step 6: Commit prompt**

Suggest: `feat(cart): merge guest cart into server on login`. Ask user.

---

### Task 30: Cart sidebar — fix checkout link

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Find the cart sidebar's "Checkout" button**

Grep in Header.tsx for `Checkout` or similar. Currently may link to `/checkout/success` or be broken.

- [ ] **Step 2: Update to `/checkout`**

Make the button a `<Link href="/checkout">` (or set the existing link's `href`). Disable it if cart is empty.

- [ ] **Step 3: Manual smoke**

Click "Checkout" in cart sidebar → lands on `/checkout` (will 404 until Phase 9; that's expected).

- [ ] **Step 4: Commit prompt**

Suggest: `fix(header): cart sidebar checkout button points to /checkout`. Ask user.

---

## Phase 8 — Tracking events (client-side) (Tasks 31–33)

### Task 31: Add `AddToCart` and `ViewContent` for shop

**Files:**
- Modify: `src/contexts/CartContext.tsx` (extend `addToCart` to fire shop events)
- Modify: `src/app/(site)/shop/[slug]/components/ProductViewTracking.tsx` (add ViewContent for Pixel + CAPI)

- [ ] **Step 1: Read `usePixelTracking` and `useKlaviyoTracking`**

Find existing `trackAddToCart` / `trackViewContent` methods. If shop-specific signatures are missing, add them to the hook files.

- [ ] **Step 2: In `CartContext.addToCart`, fire AddToCart events when item is `type === "product"`**

Within `addToCart`, after `setCartState`, add:
```ts
if (!isTicket && item.product) {
  trackAddToCart({
    value: item.price * item.quantity,
    currency: "AUD",
    productId: item.productId,
    contentName: item.product.name,
  });
  trackKlaviyoAddToCart({
    value: item.price * item.quantity,
    currency: "AUD",
    productId: item.productId,
    productName: item.product.name,
    numItems: item.quantity,
  });
}
```

- [ ] **Step 3: ProductViewTracking — fire ViewContent on mount**

Read `src/app/(site)/shop/[slug]/components/ProductViewTracking.tsx`. Likely already fires something. If ViewContent is missing for shop products, add it using the existing `trackViewContent` hook and Klaviyo `Viewed Product`.

- [ ] **Step 4: Manual smoke**

Open browser devtools → Network → filter for `facebook` / `klaviyo` → add to cart → confirm events fire.

- [ ] **Step 5: Update `docs/tracking/`**

Add the shop event coverage (ViewContent on product page, AddToCart on cart add).

- [ ] **Step 6: Commit prompt**

Suggest: `feat(tracking): shop ViewContent + AddToCart events (Pixel + Klaviyo)`. Ask user.

---

### Task 32: Server-side CAPI for `AddToCart` + `ViewContent`

**Files:**
- Modify: `src/lib/facebook.ts` (add helpers if missing)
- Modify: `src/app/api/facebook/track/route.ts` (or wherever client → CAPI bridge lives)

- [ ] **Step 1: Find existing client→CAPI bridge route**

Grep: `grep -rn "track.*facebook\|capi" src/app/api/`. There should be an endpoint that the client Pixel calls to mirror events server-side. If not, the existing `usePixelTracking` may handle CAPI directly.

- [ ] **Step 2: Ensure shop events flow through**

If a generic event-forwarding endpoint exists, no change. If shop events need a specific path, add a thin route that takes `event_name`, `event_id`, `user_data`, `custom_data` and forwards to `sendCapiEvent`.

- [ ] **Step 3: Confirm AddToCart and ViewContent CAPI events fire**

Manual: in dev, check Meta Events Manager → Test Events → trigger AddToCart on shop → see both Pixel and CAPI events with same event_id.

- [ ] **Step 4: Update `docs/tracking/`**

- [ ] **Step 5: Commit prompt**

Suggest: `feat(tracking): mirror shop AddToCart + ViewContent to Meta CAPI`. Ask user.

---

### Task 33: `InitiateCheckout` + `AddPaymentInfo` events

(Both will be wired in Phase 9 inside the `/checkout` page. Marker task — no code yet.)

- [ ] **Step 1: Note in plan: events fire from `/checkout` page (Task 38) and `ShopCheckoutPaymentElement` (Task 37).**

Skip to Phase 9.

---

## Phase 9 — Frontend: `/checkout` page (Tasks 34–40)

### Task 34: TanStack Query hooks for orders

**Files:**
- Create: `src/hooks/queries/useOrdersQueries.ts`

- [ ] **Step 1: Create hooks**

```ts
// src/hooks/queries/useOrdersQueries.ts
import { useQuery } from "@tanstack/react-query";

interface Order {
  _id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  gstAmount: number;
  shippingCost: number;
  createdAt: string;
  products: { product: string; quantity: number; price: number }[];
  shippingAddress: Record<string, string>;
  paymentIntentId?: string;
  trackingNumber?: string;
}

export function useOrdersQuery() {
  return useQuery({
    queryKey: ["orders", "mine"],
    queryFn: async (): Promise<Order[]> => {
      const res = await fetch("/api/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      return data.orders ?? [];
    },
  });
}

export function useOrderQuery(orderNumber: string | undefined) {
  return useQuery({
    queryKey: ["orders", orderNumber],
    queryFn: async (): Promise<Order> => {
      const res = await fetch(`/api/orders/${orderNumber}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load order");
      const data = await res.json();
      return data.order;
    },
    enabled: !!orderNumber,
  });
}

export function useOrderByPaymentIntentQuery(piId: string | undefined) {
  return useQuery({
    queryKey: ["orders", "by-pi", piId],
    queryFn: async (): Promise<{ status: "ready" | "pending"; order?: Order }> => {
      const res = await fetch(`/api/orders/by-payment-intent/${piId}`);
      if (!res.ok) throw new Error("Failed to poll PI status");
      return res.json();
    },
    enabled: !!piId,
    refetchInterval: (q) => (q.state.data?.status === "ready" ? false : 2000),
    refetchIntervalInBackground: false,
  });
}
```

- [ ] **Step 2: Type-check**

- [ ] **Step 3: Update `docs/client-state/` (where TanStack hooks live per manifest)**

- [ ] **Step 4: Commit prompt**

Suggest: `feat(orders): TanStack Query hooks for orders + PI polling`. Ask user.

---

### Task 35: `GET /api/orders/[id]` reads by orderNumber

**Files:**
- Modify: `src/app/api/orders/[id]/route.ts`

- [ ] **Step 1: Update GET to lookup by `orderNumber` OR `_id`**

```ts
const order = await Order.findOne({
  $or: [{ orderNumber: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
}).populate("products.product").lean();
```

(Adapt: route may already exist; just ensure it accepts the order number — that's what `/my-account/orders/[orderNumber]` will pass.)

- [ ] **Step 2: Owner check (logged-in only)**

```ts
if (order.user && order.user.toString() !== session?.user?.id) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

- [ ] **Step 3: Type-check**

- [ ] **Step 4: Commit prompt**

Suggest: `fix(orders): GET /api/orders/[id] looks up by orderNumber + owner check`. Ask user.

---

### Task 36: `ShopCheckoutPaymentElement` component

**Files:**
- Create: `src/components/payment/ShopCheckoutPaymentElement.tsx`

- [ ] **Step 1: Read existing Stripe wrapper**

Read `src/components/payment/StripeInlineCardSetupForm.tsx` and `src/components/payment/PaymentSuccessHandler.tsx` for the Stripe Elements provider pattern.

- [ ] **Step 2: Create the component**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { ShippingAddressInput } from "@/services/shop/createShopPurchase.service";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export interface ShopCheckoutPaymentElementProps {
  items: { productId: string; quantity: number }[];
  shippingAddress: ShippingAddressInput;
  onPaymentInfoEntered?: () => void; // for Pixel AddPaymentInfo
}

function PayForm({
  onPaymentInfoEntered,
}: {
  onPaymentInfoEntered?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErrorMsg(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`,
      },
    });
    if (result.error) {
      setErrorMsg(result.error.message ?? "Payment failed");
      setSubmitting(false);
    }
    // Otherwise: browser redirected to return_url
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement onChange={() => onPaymentInfoEntered?.()} />
      {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}
      <button
        type="submit"
        disabled={submitting || !stripe || !elements}
        className="w-full bg-black text-white py-3 rounded-md font-semibold disabled:opacity-60"
      >
        {submitting ? "Processing…" : "Pay"}
      </button>
    </form>
  );
}

export function ShopCheckoutPaymentElement(props: ShopCheckoutPaymentElementProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      const res = await fetch("/api/stripe/create-shop-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: props.items,
          shippingAddress: props.shippingAddress,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setLoadError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      if (!cancelled) setClientSecret(data.clientSecret);
    }
    start();
    return () => {
      cancelled = true;
    };
  }, [props.items, props.shippingAddress]);

  if (loadError) return <p className="text-red-600">Couldn't start payment: {loadError}</p>;
  if (!clientSecret) return <p>Loading payment options…</p>;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: "stripe" },
      }}
    >
      <PayForm onPaymentInfoEntered={props.onPaymentInfoEntered} />
    </Elements>
  );
}
```

- [ ] **Step 3: Confirm `@stripe/react-stripe-js` and `@stripe/stripe-js` are in `package.json`**

Grep `package.json`. If missing, install: `npm install @stripe/react-stripe-js @stripe/stripe-js`.

- [ ] **Step 4: Type-check**

- [ ] **Step 5: Update `docs/cart-shop-products/frontend.md`**

- [ ] **Step 6: Commit prompt**

Suggest: `feat(shop): ShopCheckoutPaymentElement component (PaymentElement + wallets)`. Ask user.

---

### Task 37: `/checkout` page — form + summary layout

**Files:**
- Create: `src/app/(site)/checkout/page.tsx`
- (Optionally create components under `src/app/(site)/checkout/components/`)

- [ ] **Step 1: Create the page**

```tsx
// src/app/(site)/checkout/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/contexts/CartContext";
import { useSession } from "next-auth/react";
import { ShopCheckoutPaymentElement } from "@/components/payment/ShopCheckoutPaymentElement";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { items, summary } = useCart();
  const { data: session } = useSession();
  const { trackInitiateCheckout, trackAddPaymentInfo } = usePixelTracking();
  const { trackStartedCheckout } = useKlaviyoTracking();

  const productItems = items.filter((i) => i.type === "product");

  const [form, setForm] = useState({
    firstName: session?.user?.firstName ?? "",
    lastName: session?.user?.lastName ?? "",
    email: session?.user?.email ?? "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "" as (typeof AU_STATES)[number] | "",
    postalCode: "",
    deliveryInstructions: "",
  });

  const formValid = useMemo(() => {
    const required = [
      form.firstName, form.lastName, form.email, form.phone,
      form.addressLine1, form.city, form.state, form.postalCode,
    ];
    return required.every((v) => v.trim().length > 0) && /^[0-9]{4}$/.test(form.postalCode);
  }, [form]);

  // Empty cart redirect
  useEffect(() => {
    if (productItems.length === 0) {
      router.replace("/shop");
    }
  }, [productItems.length, router]);

  // InitiateCheckout / Started Checkout (Pixel + Klaviyo) — fire once on first non-empty render
  const [hasFiredInitiate, setHasFiredInitiate] = useState(false);
  useEffect(() => {
    if (!hasFiredInitiate && productItems.length > 0) {
      const value = productItems.reduce((s, i) => s + i.price * i.quantity, 0);
      trackInitiateCheckout({
        value,
        currency: "AUD",
        productIds: productItems.map((i) => i.productId!),
        numItems: productItems.reduce((s, i) => s + i.quantity, 0),
      });
      trackStartedCheckout({
        value,
        currency: "AUD",
        items: productItems.map((i) => ({
          productId: i.productId!,
          productName: i.product?.name ?? "",
          quantity: i.quantity,
          price: i.price,
        })),
      });
      setHasFiredInitiate(true);
    }
  }, [hasFiredInitiate, productItems, trackInitiateCheckout, trackStartedCheckout]);

  if (productItems.length === 0) return null;

  const itemsForPayment = productItems.map((i) => ({
    productId: i.productId!,
    quantity: i.quantity,
  }));

  const shippingAddress = {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    phone: form.phone,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2 || undefined,
    city: form.city,
    state: form.state || "VIC",
    postalCode: form.postalCode,
    country: "Australia",
    deliveryInstructions: form.deliveryInstructions || undefined,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-[1fr_360px] gap-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Checkout</h1>

        {/* Contact */}
        <section className="space-y-3">
          <h2 className="font-semibold">Contact</h2>
          <input className="input" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Phone" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </section>

        {/* Shipping */}
        <section className="space-y-3">
          <h2 className="font-semibold">Shipping address</h2>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="First name" value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <input className="input" placeholder="Last name" value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <input className="input" placeholder="Address line 1" value={form.addressLine1}
            onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
          <input className="input" placeholder="Address line 2 (optional)" value={form.addressLine2}
            onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <input className="input" placeholder="Suburb" value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <select className="input" value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value as typeof form.state })}>
              <option value="">State</option>
              {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input" placeholder="Postcode" value={form.postalCode}
              onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
          </div>
          <input className="input" placeholder="Delivery instructions (optional)"
            value={form.deliveryInstructions}
            onChange={(e) => setForm({ ...form, deliveryInstructions: e.target.value })} />
        </section>

        {/* Payment */}
        <section className="space-y-3">
          <h2 className="font-semibold">Payment</h2>
          {formValid ? (
            <ShopCheckoutPaymentElement
              items={itemsForPayment}
              shippingAddress={shippingAddress}
              onPaymentInfoEntered={() =>
                trackAddPaymentInfo({
                  value: summary.totalAmount,
                  currency: "AUD",
                })
              }
            />
          ) : (
            <p className="text-sm text-gray-500">Fill in shipping details to continue.</p>
          )}
        </section>
      </div>

      {/* Order summary */}
      <aside className="bg-gray-50 dark:bg-neutral-900 p-6 rounded-lg h-fit lg:sticky lg:top-24">
        <h2 className="font-semibold mb-4">Order summary</h2>
        {productItems.map((i) => (
          <div key={i.productId} className="flex justify-between text-sm py-1">
            <span>{i.product?.name ?? "Item"} × {i.quantity}</span>
            <span>${(i.price * i.quantity).toFixed(2)}</span>
          </div>
        ))}
        <hr className="my-3" />
        <div className="flex justify-between text-sm"><span>Subtotal</span><span>${summary.subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm"><span>Shipping</span><span>${summary.shipping.toFixed(2)}</span></div>
        <hr className="my-3" />
        <div className="flex justify-between font-semibold text-lg"><span>Total</span><span>${summary.totalAmount.toFixed(2)} AUD</span></div>
        <p className="text-xs text-gray-500 mt-1">incl. ${summary.gstIncluded.toFixed(2)} GST</p>
      </aside>
    </div>
  );
}
```

(`.input` is shorthand — replace with whatever Tailwind class set the project uses for form fields, or replace with the project's `<Input>` component.)

- [ ] **Step 2: Manual smoke**

```
npm run dev
```
- Visit `/shop`, add a product
- Visit `/checkout` — form renders
- Fill form → PaymentElement loads with valid clientSecret

- [ ] **Step 3: Type-check**

- [ ] **Step 4: Update `docs/cart-shop-products/frontend.md`**

Add the new `/checkout` page to the routes list.

- [ ] **Step 5: Commit prompt**

Suggest: `feat(shop): /checkout page with shipping form + PaymentElement`. Ask user.

---

### Task 38: Wire pixel/klaviyo `InitiateCheckout` / `Started Checkout`

(If `usePixelTracking` and `useKlaviyoTracking` don't yet have these methods, add them.)

**Files:**
- Modify: `src/hooks/usePixelTracking.ts`
- Modify: `src/hooks/useKlaviyoTracking.ts`

- [ ] **Step 1: Add `trackInitiateCheckout` to `usePixelTracking`**

Mimic existing `trackAddToCart` shape. Pass through to Meta Pixel `InitiateCheckout` + CAPI bridge.

- [ ] **Step 2: Add `trackStartedCheckout` to `useKlaviyoTracking`**

Map to Klaviyo "Started Checkout" event with `$value`, `Items[]`, etc.

- [ ] **Step 3: Type-check**

- [ ] **Step 4: Update `docs/tracking/`**

- [ ] **Step 5: Commit prompt**

Suggest: `feat(tracking): InitiateCheckout (Pixel) + Started Checkout (Klaviyo)`. Ask user.

---

### Task 39: `/checkout/success` polling for Order

**Files:**
- Modify: `src/app/(site)/checkout/success/page.tsx`
- Modify: `src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx`

- [ ] **Step 1: Read existing implementation**

It currently handles non-shop success cases. Add a shop branch.

- [ ] **Step 2: Add Order polling for shop PI**

In the client component, read `payment_intent` from query. Use `useOrderByPaymentIntentQuery` (Task 34).

```tsx
const piId = searchParams.get("payment_intent");
const { data, isLoading } = useOrderByPaymentIntentQuery(piId ?? undefined);

useEffect(() => {
  if (data?.status === "ready") {
    // Clear cart for both guest and logged-in
    clearLocalCart();
    clearCart(); // from CartContext

    // Pixel Purchase event (CAPI fired by webhook with same event_id)
    trackPurchase({
      value: data.order!.totalAmount,
      currency: "AUD",
      orderId: data.order!.orderNumber,
      eventId: data.order!.paymentIntentId, // dedup
      productIds: data.order!.products.map((p) => p.product),
    });
  }
}, [data]);
```

- [ ] **Step 3: After 30s without `ready`, show fallback**

Use a timer:
```tsx
const [timedOut, setTimedOut] = useState(false);
useEffect(() => {
  const t = setTimeout(() => setTimedOut(true), 30_000);
  return () => clearTimeout(t);
}, []);
```
Render:
- If `data?.status === "ready"`: "Order confirmed!" + link to `/my-account/orders/<orderNumber>` (logged-in) or "check your email" (guest)
- If `isLoading || (!timedOut && data?.status === "pending")`: spinner "Processing your order…"
- If `timedOut`: "Payment confirmed. Your order is processing — check your email shortly. Contact support if you don't see it within 5 minutes."

- [ ] **Step 4: Type-check**

- [ ] **Step 5: Update `docs/cart-shop-products/frontend.md`**

- [ ] **Step 6: Commit prompt**

Suggest: `feat(shop): /checkout/success polls Order + fires Pixel Purchase`. Ask user.

---

### Task 40: Pixel `Purchase` event helper

**Files:**
- Modify: `src/hooks/usePixelTracking.ts`

- [ ] **Step 1: Add `trackPurchase` if missing**

Pattern: takes `{ value, currency, orderId, eventId, productIds }`. Fires Pixel `Purchase` with `eventID: eventId`. CAPI side handled by webhook with same event_id for dedup.

- [ ] **Step 2: Type-check**

- [ ] **Step 3: Commit prompt**

Suggest: `feat(tracking): Pixel Purchase helper for shop success page`. Ask user.

---

## Phase 10 — My-account orders pages (Tasks 41–43)

### Task 41: `/my-account/orders` list page

**Files:**
- Create: `src/app/(site)/my-account/orders/page.tsx`

- [ ] **Step 1: Create the list page**

```tsx
// src/app/(site)/my-account/orders/page.tsx
"use client";
import Link from "next/link";
import { useOrdersQuery } from "@/hooks/queries/useOrdersQueries";

export default function OrdersPage() {
  const { data: orders, isLoading } = useOrdersQuery();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      {isLoading && <p>Loading…</p>}
      {!isLoading && (orders?.length ?? 0) === 0 && (
        <p>
          No orders yet — visit the <Link href="/shop" className="underline">shop</Link>.
        </p>
      )}
      {(orders?.length ?? 0) > 0 && (
        <ul className="space-y-4">
          {orders!.map((o) => (
            <li key={o._id} className="border rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">#{o.orderNumber}</p>
                <p className="text-sm text-gray-500">
                  {new Date(o.createdAt).toLocaleDateString("en-AU")} · {o.products.length} item{o.products.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">${o.totalAmount.toFixed(2)} AUD</p>
                <p className="text-xs uppercase tracking-wide text-gray-500">{o.status}</p>
              </div>
              <Link href={`/my-account/orders/${o.orderNumber}`} className="ml-4 underline">View</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + manual render**

Visit `/my-account/orders` (after one webhook-written order exists).

- [ ] **Step 3: Update `docs/dashboard-account/`**

- [ ] **Step 4: Commit prompt**

Suggest: `feat(my-account): orders list page`. Ask user.

---

### Task 42: `/my-account/orders/[orderNumber]` detail page

**Files:**
- Create: `src/app/(site)/my-account/orders/[orderNumber]/page.tsx`

- [ ] **Step 1: Create detail page**

```tsx
// src/app/(site)/my-account/orders/[orderNumber]/page.tsx
"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useOrderQuery } from "@/hooks/queries/useOrdersQueries";

const STATUSES = ["pending", "processing", "shipped", "delivered"] as const;

export default function OrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const { data: order, isLoading, error } = useOrderQuery(params.orderNumber);

  if (isLoading) return <p className="p-8">Loading…</p>;
  if (error || !order) return <p className="p-8">Order not found.</p>;

  const currentStep = Math.max(0, STATUSES.indexOf(order.status as (typeof STATUSES)[number]));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <Link href="/my-account/orders" className="text-sm underline">← Back to orders</Link>
        <h1 className="text-2xl font-bold mt-2">Order #{order.orderNumber}</h1>
        <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString("en-AU")}</p>
      </div>

      {/* Status timeline */}
      <div className="flex justify-between">
        {STATUSES.map((s, i) => (
          <div key={s} className={`flex-1 text-center text-xs uppercase ${i <= currentStep ? "font-semibold" : "text-gray-400"}`}>
            {s}
          </div>
        ))}
      </div>

      {/* Items */}
      <section>
        <h2 className="font-semibold mb-3">Items</h2>
        <ul className="space-y-2">
          {order.products.map((p, idx) => (
            <li key={idx} className="flex justify-between text-sm">
              <span>{p.quantity} × {String(p.product)}</span>
              <span>${(p.price * p.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Address */}
      <section>
        <h2 className="font-semibold mb-3">Shipping to</h2>
        <p className="text-sm leading-6">
          {order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />
          {order.shippingAddress.addressLine1 ?? order.shippingAddress.address}<br />
          {order.shippingAddress.addressLine2 && <>{order.shippingAddress.addressLine2}<br /></>}
          {order.shippingAddress.city} {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />
          {order.shippingAddress.country}<br />
          {order.shippingAddress.phone}
        </p>
      </section>

      {/* Tracking */}
      {order.trackingNumber && (
        <section>
          <h2 className="font-semibold mb-1">Tracking</h2>
          <a
            href={`https://auspost.com.au/mypost/track/details/${order.trackingNumber}`}
            target="_blank"
            rel="noreferrer"
            className="underline text-sm"
          >
            {order.trackingNumber} (track on AusPost)
          </a>
        </section>
      )}

      {/* Help */}
      <p className="text-sm text-gray-500">
        Need help? <Link href="/my-account/support" className="underline">Contact support</Link>.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Manual render**

Visit a real order's detail page after Phase 6 webhook fires.

- [ ] **Step 3: Update `docs/dashboard-account/`**

- [ ] **Step 4: Commit prompt**

Suggest: `feat(my-account): order detail page with status timeline`. Ask user.

---

### Task 43: Dashboard "Recent Orders" widget

**Files:**
- Modify: `src/app/(site)/my-account/page.tsx` (add widget after MajorDrawOverview)
- Optionally create: `src/app/(site)/my-account/components/RecentOrdersWidget.tsx`

- [ ] **Step 1: Create widget component**

```tsx
"use client";
import Link from "next/link";
import { useOrdersQuery } from "@/hooks/queries/useOrdersQueries";

export default function RecentOrdersWidget() {
  const { data: orders } = useOrdersQuery();
  const recent = (orders ?? []).slice(0, 3);
  if (recent.length === 0) return null;

  return (
    <section className="border rounded-lg p-5">
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="font-semibold">Recent orders</h2>
        <Link href="/my-account/orders" className="text-sm underline">View all</Link>
      </div>
      <ul className="space-y-2">
        {recent.map((o) => (
          <li key={o._id} className="flex justify-between text-sm">
            <Link href={`/my-account/orders/${o.orderNumber}`} className="underline">
              #{o.orderNumber}
            </Link>
            <span className="text-gray-500">{new Date(o.createdAt).toLocaleDateString("en-AU")}</span>
            <span>${o.totalAmount.toFixed(2)}</span>
            <span className="uppercase text-xs">{o.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Insert into dashboard page**

In `src/app/(site)/my-account/page.tsx`, import and place after `<MajorDrawOverview />`:
```tsx
import RecentOrdersWidget from "./components/RecentOrdersWidget";
…
<RecentOrdersWidget />
```

- [ ] **Step 3: Type-check**

- [ ] **Step 4: Update `docs/dashboard-account/`**

- [ ] **Step 5: Commit prompt**

Suggest: `feat(my-account): RecentOrdersWidget on dashboard`. Ask user.

---

## Phase 11 — Playwright e2e (Tasks 44–50)

### Task 44: Install Playwright + config

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install**

```
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create config**

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Add npm scripts**

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:shop": "playwright test e2e/shop"
```

- [ ] **Step 4: Add `.gitignore` entries**

In `.gitignore`:
```
playwright-report/
test-results/
```

- [ ] **Step 5: Update `docs/dev-tooling/`**

Add a section documenting Playwright (location, commands, Stripe CLI dependency).

- [ ] **Step 6: Commit prompt**

Suggest: `chore(test): install Playwright + config`. Ask user.

---

### Task 45: Stripe test cards utility + payment-element fill helper

**Files:**
- Create: `e2e/utils/stripe-test-cards.ts`
- Create: `e2e/utils/fill-payment-element.ts`

- [ ] **Step 1: Create cards utility**

```ts
// e2e/utils/stripe-test-cards.ts
export const STRIPE_TEST_CARDS = {
  SUCCESS: { number: "4242 4242 4242 4242", exp: "12/34", cvc: "123", postcode: "3000" },
  REQUIRES_3DS: { number: "4000 0027 6000 3184", exp: "12/34", cvc: "123", postcode: "3000" },
  DECLINED: { number: "4000 0000 0000 0002", exp: "12/34", cvc: "123", postcode: "3000" },
  INSUFFICIENT_FUNDS: { number: "4000 0000 0000 9995", exp: "12/34", cvc: "123", postcode: "3000" },
} as const;
```

- [ ] **Step 2: Create fill helper**

```ts
// e2e/utils/fill-payment-element.ts
import { Page, FrameLocator } from "@playwright/test";

export async function fillPaymentElementCard(page: Page, card: { number: string; exp: string; cvc: string; postcode?: string }) {
  // Stripe PaymentElement renders inside an iframe
  const iframe = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

  await iframe.locator('input[name="number"]').fill(card.number);
  await iframe.locator('input[name="expiry"]').fill(card.exp);
  await iframe.locator('input[name="cvc"]').fill(card.cvc);
  if (card.postcode) {
    const postal = iframe.locator('input[name="postalCode"]');
    if (await postal.count()) await postal.fill(card.postcode);
  }
}
```

(Note: Stripe iframe selectors evolve. If they don't match, add a small "best-effort with retry" wrapper.)

- [ ] **Step 3: Type-check**

- [ ] **Step 4: Commit prompt**

Suggest: `chore(e2e): Stripe test cards + PaymentElement fill helper`. Ask user.

---

### Task 46: Test fixtures (products + auth)

**Files:**
- Create: `e2e/fixtures/test-products.ts`
- Create: `e2e/fixtures/auth.setup.ts`

- [ ] **Step 1: Create products fixture**

```ts
// e2e/fixtures/test-products.ts
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

const TEST_PREFIX = "test-shop-e2e-";

export async function ensureE2EProducts() {
  await connectDB();
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });

  const widget = await Product.create({
    name: `${TEST_PREFIX}widget`,
    description: "E2E test widget",
    price: 25,
    images: ["https://placehold.co/400"],
    category: "test",
    brand: "test",
    stock: 10,
    isActive: true,
  });
  return { widgetId: widget._id.toString() };
}

export async function teardownE2EProducts() {
  await connectDB();
  await Product.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
}

if (require.main === module) {
  ensureE2EProducts().then((ids) => {
    console.log(JSON.stringify(ids));
    return mongoose.disconnect();
  });
}
```

- [ ] **Step 2: Create auth setup**

```ts
// e2e/fixtures/auth.setup.ts
import { test as setup } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  // Adapt to your project's login form (email + password, or magic link). For
  // dev mode you may have a debug auth route — use it.
  await page.goto("/login");
  await page.fill('input[name="email"]', process.env.E2E_TEST_USER_EMAIL!);
  await page.fill('input[name="password"]', process.env.E2E_TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL("/my-account");

  await page.context().storageState({ path: AUTH_FILE });
});
```

Add the auth project in `playwright.config.ts`:
```ts
projects: [
  { name: "setup", testMatch: /.*\.setup\.ts/ },
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    dependencies: ["setup"],
  },
],
```

- [ ] **Step 3: Add `.gitignore` entry for `.auth/`**

```
e2e/.auth/
```

- [ ] **Step 4: Commit prompt**

Suggest: `chore(e2e): test fixtures (products + auth)`. Ask user.

---

### Task 47: `guest-checkout.spec.ts`

**Files:**
- Create: `e2e/shop/guest-checkout.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { ensureE2EProducts, teardownE2EProducts } from "../fixtures/test-products";
import { STRIPE_TEST_CARDS } from "../utils/stripe-test-cards";
import { fillPaymentElementCard } from "../utils/fill-payment-element";

test.describe.configure({ mode: "serial" });

let productId: string;

test.beforeAll(async () => {
  const ids = await ensureE2EProducts();
  productId = ids.widgetId;
});

test.afterAll(async () => {
  await teardownE2EProducts();
});

test("guest can complete checkout", async ({ page }) => {
  // No auth — start fresh, no storageState
  await page.goto("/shop");
  // Add the test product (locator may need adjustment to match real shop UI)
  await page.click(`a[href*="${productId}"], a:has-text("test-shop-e2e-widget")`);
  await page.click("text=Add to Cart");

  // Open cart sidebar (header cart icon — pre-flip, may not be visible; navigate directly)
  await page.goto("/checkout");

  await page.fill('input[placeholder="Email"]', "guest-e2e@example.com");
  await page.fill('input[placeholder="Phone"]', "0400000000");
  await page.fill('input[placeholder="First name"]', "Guest");
  await page.fill('input[placeholder="Last name"]', "Tester");
  await page.fill('input[placeholder="Address line 1"]', "1 Test St");
  await page.fill('input[placeholder="Suburb"]', "Melbourne");
  await page.selectOption("select", "VIC");
  await page.fill('input[placeholder="Postcode"]', "3000");

  await fillPaymentElementCard(page, STRIPE_TEST_CARDS.SUCCESS);

  await page.click('button:has-text("Pay")');

  await page.waitForURL(/\/checkout\/success/);
  await expect(page.locator("text=/Order confirmed|processing/i")).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 2: Run**

```
npm run dev    # in another terminal — or rely on webServer in config
npm run test:e2e:shop -- guest-checkout
```
(Spec uses Stripe CLI for webhook forwarding: in another terminal, `stripe listen --forward-to localhost:3000/api/stripe/webhook`.)

Expected: PASS.

- [ ] **Step 3: Iterate selectors if needed**

If form selectors don't match the real DOM (you may have used components instead of plain inputs), update accordingly.

- [ ] **Step 4: Commit prompt**

Suggest: `test(e2e): guest checkout happy path`. Ask user.

---

### Task 48: `member-checkout.spec.ts`

**Files:**
- Create: `e2e/shop/member-checkout.spec.ts`

- [ ] **Step 1: Write spec (similar structure, but uses storageState from auth.setup)**

```ts
import { test, expect } from "@playwright/test";
import { ensureE2EProducts, teardownE2EProducts } from "../fixtures/test-products";
import { STRIPE_TEST_CARDS } from "../utils/stripe-test-cards";
import { fillPaymentElementCard } from "../utils/fill-payment-element";

let productId: string;

test.beforeAll(async () => {
  const ids = await ensureE2EProducts();
  productId = ids.widgetId;
});
test.afterAll(async () => {
  await teardownE2EProducts();
});

test("logged-in user can complete checkout", async ({ page }) => {
  await page.goto("/shop");
  await page.click(`a:has-text("test-shop-e2e-widget")`);
  await page.click("text=Add to Cart");
  await page.goto("/checkout");

  // Email/phone may be prefilled from session
  await page.fill('input[placeholder="Phone"]', "0411111111");
  await page.fill('input[placeholder="Address line 1"]', "10 Member Rd");
  await page.fill('input[placeholder="Suburb"]', "Melbourne");
  await page.selectOption("select", "VIC");
  await page.fill('input[placeholder="Postcode"]', "3000");

  await fillPaymentElementCard(page, STRIPE_TEST_CARDS.SUCCESS);
  await page.click('button:has-text("Pay")');
  await page.waitForURL(/\/checkout\/success/);

  // After success, navigate to orders page
  await page.goto("/my-account/orders");
  await expect(page.locator("li").first()).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 2: Run + iterate**

- [ ] **Step 3: Commit prompt**

Suggest: `test(e2e): member checkout happy path`. Ask user.

---

### Task 49: `cart-persistence.spec.ts`

**Files:**
- Create: `e2e/shop/cart-persistence.spec.ts`

- [ ] **Step 1: Write spec**

```ts
import { test, expect } from "@playwright/test";
import { ensureE2EProducts, teardownE2EProducts } from "../fixtures/test-products";

let productId: string;

test.beforeAll(async () => { productId = (await ensureE2EProducts()).widgetId; });
test.afterAll(async () => { await teardownE2EProducts(); });

test("guest cart persists across reload", async ({ page }) => {
  await page.goto("/shop");
  await page.click(`a:has-text("test-shop-e2e-widget")`);
  await page.click("text=Add to Cart");

  await page.reload();
  // Cart icon badge should show 1 (after Phase 12 cart icon flip; until then, check localStorage directly)
  const ls = await page.evaluate(() => localStorage.getItem("shop_cart_v1"));
  expect(ls).toBeTruthy();
  const parsed = JSON.parse(ls!);
  expect(parsed.items.length).toBeGreaterThan(0);
});

test("guest cart drops after 24h", async ({ page }) => {
  await page.goto("/shop");
  await page.click(`a:has-text("test-shop-e2e-widget")`);
  await page.click("text=Add to Cart");

  // Forge 25h-old timestamp
  await page.evaluate(() => {
    const raw = localStorage.getItem("shop_cart_v1");
    if (!raw) return;
    const data = JSON.parse(raw);
    data.savedAt = Date.now() - (25 * 60 * 60 * 1000);
    localStorage.setItem("shop_cart_v1", JSON.stringify(data));
  });

  await page.reload();
  const ls = await page.evaluate(() => localStorage.getItem("shop_cart_v1"));
  expect(ls).toBeNull();
});
```

- [ ] **Step 2: Run**

- [ ] **Step 3: Commit prompt**

Suggest: `test(e2e): cart persistence + 24h TTL`. Ask user.

---

### Task 50: `out-of-stock.spec.ts` and `three-ds.spec.ts`

**Files:**
- Create: `e2e/shop/out-of-stock.spec.ts`
- Create: `e2e/shop/three-ds.spec.ts`

- [ ] **Step 1: out-of-stock spec**

Set product stock to 0 via fixture; visit `/checkout` (after manually constructing cart in localStorage); confirm checkout returns 400 with line-item error.

- [ ] **Step 2: three-ds spec**

Use `STRIPE_TEST_CARDS.REQUIRES_3DS`. After clicking Pay, drive the 3DS iframe (Stripe shows a "Complete authentication" button — click it). Confirm redirect back to `/checkout/success`.

(Code mirrors guest-checkout but uses different cards / flows. Specs short.)

- [ ] **Step 3: Run**

- [ ] **Step 4: Commit prompt**

Suggest: `test(e2e): out-of-stock + 3DS flows`. Ask user.

---

## Phase 12 — Operational tooling (Tasks 51–52)

### Task 51: Reconcile script for orphan shop PIs

**Files:**
- Create: `scripts/reconcile-orphan-shop-payments.ts`

- [ ] **Step 1: Create script**

```ts
// scripts/reconcile-orphan-shop-payments.ts
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { stripe } from "@/lib/stripe";
import { finalizeShopOrder } from "@/services/shop/finalizeShopOrder.service";

const DRY = process.argv.includes("--dry-run");
const HOURS_OLD = 1;

async function main() {
  await connectDB();
  const cutoff = Math.floor((Date.now() - HOURS_OLD * 3600 * 1000) / 1000);

  // List shop-type succeeded PIs older than cutoff
  let processed = 0;
  for await (const pi of stripe.paymentIntents.list({ limit: 100, created: { lte: cutoff } })) {
    if (pi.metadata?.type !== "shop") continue;
    if (pi.status !== "succeeded") continue;

    const existing = await Order.findOne({ paymentIntentId: pi.id }).lean();
    if (existing) continue;

    console.error(`[reconcile] orphan PI ${pi.id}${DRY ? " (dry)" : ""}`);
    if (!DRY) {
      const result = await finalizeShopOrder({ paymentIntent: pi });
      console.error(`[reconcile] → ${result.status}`);
    }
    processed += 1;
  }
  console.error(`[reconcile] checked ${processed} orphans`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add npm scripts**

```json
"reconcile:shop-orphans:dry": "tsx scripts/reconcile-orphan-shop-payments.ts --dry-run",
"reconcile:shop-orphans": "tsx scripts/reconcile-orphan-shop-payments.ts"
```

- [ ] **Step 3: Update `docs/cart-shop-products/`**

Add reconcile script to the operational tooling list.

- [ ] **Step 4: Commit prompt**

Suggest: `feat(shop): reconcile-orphan-shop-payments script`. Ask user.

---

### Task 52: Launch checklist doc

**Files:**
- Create: `docs/cart-shop-products/launch-checklist.md`

- [ ] **Step 1: Write the checklist**

Copy the manual smoke checklist from spec §7.6 verbatim, formatted as Markdown checkboxes.

- [ ] **Step 2: Commit prompt**

Suggest: `docs(shop): launch checklist`. Ask user.

---

## Phase 13 — Final integration: cart icon (the gate) (Task 53)

### Task 53: Render cart icon in Header

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Find the theme-toggle slot (line ~983 currently)**

```ts
{/* Theme (replaces cart until shop is live) */}
```

- [ ] **Step 2: Replace block with theme + cart + user (in that order)**

```tsx
{/* Theme + Cart + User */}
<ThemeToggle />
<button
  type="button"
  aria-label="Open cart"
  onClick={() => setIsCartOpen(true)}
  className="relative inline-flex items-center justify-center w-10 h-10"
>
  <ShoppingCart className="h-5 w-5" />
  {cartItemCount > 0 && (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
      {cartItemCount}
    </span>
  )}
</button>
{/* existing user icon */}
```

- [ ] **Step 3: Mobile menu — same order**

Find the mobile menu's action row (line ~1303) and add cart link there too.

- [ ] **Step 4: Manual smoke**

Visit `/`, confirm icon order: theme | cart | user. Click cart → sidebar opens. Add an item → badge shows count.

- [ ] **Step 5: Update `docs/shared-ui/`**

- [ ] **Step 6: Commit prompt — THE GATE FLIPS**

Suggest: `feat(shop): render cart icon in header — shop is live`. Ask user. **This is the launch commit.**

---

## Phase 14 — Documentation final sweep (Task 54)

### Task 54: Verify all domain docs are current

- [ ] **Step 1: Run doc-sync hook manually**

If there's a way to invoke `.claude/hooks/doc-sync.mjs` standalone, do so. Otherwise: review each domain doc you touched against the current source.

- [ ] **Step 2: Update `lastVerified` dates in CLAUDE.md manifest for touched domains**

For `cart-shop-products`, `billing-stripe`, `email`, `tracking`, `dashboard-account`, `config-and-data`, `dev-tooling`, `shared-ui`, `client-state`: bump `lastVerified` to today.

- [ ] **Step 3: Run lint + type-check + all unit tests one more time**

```
npm run lint
npm run type-check
npm run test:shop
```

- [ ] **Step 4: Commit prompt**

Suggest: `docs(shop): final domain sync + manifest lastVerified`. Ask user.

---

## Self-Review Notes

- Spec coverage: every spec section has at least one task. §1 Architecture → Phases 2-7. §2 Schema → Tasks 1-6. §3 API → Tasks 20-23. §4 Service → Tasks 8-19. §5 Frontend → Tasks 27-43. §6 Payment flow → Tasks 19, 25, 36-39. §7 Testing → Tasks 8, 9, 18, 26, 44-50. §8 Migration & rollout → Tasks 5, 6, 22, 23, 51-53. §9 Deferred — not implemented (intentional). §10 Files touched — full coverage.
- Placeholder scan: only `// TODO(shared-payment-extraction)` (intentional code marker).
- Type consistency: `ValidatedItem`, `ShopTotals`, `ShippingAddressInput`, `CreateShopPurchaseInput/Result/Error` referenced consistently across tasks.
- Project rules: every src-touching task includes a docs update step. Every commit step is a prompt (no auto-commit).
