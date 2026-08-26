# Shop Catalogue (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed real branded apparel into `/shop` so it renders a live catalogue with size and colour selection instead of the "Coming Soon" panel.

**Architecture:** Extend the existing `Product` model with a `variants[]` array rather than creating a parallel merch model — the repo already owns `shop` / `Product` / `Order` vocabulary and the `cart-shop-products` domain. Pure variant logic lives in `src/utils/shop/` and is unit-tested; the admin CRUD follows the Milestone Rewards route shape exactly (Zod at module scope → `requirePermission` for reads, `requirePermissionWithAudit` for writes → service → `{ success, data }`).

**Tech Stack:** Next.js 15 App Router · Mongoose 8 · Zod · TanStack Query · standalone `tsx` test scripts (there is no jest/vitest in this repo).

**Spec:** [2026-08-17-shop-catalogue-and-checkout-design.md](../specs/2026-08-17-shop-catalogue-and-checkout-design.md)

## Global Constraints

- **Vocabulary is fixed.** `shop`, `Product`, `Order`, `variant`. Never introduce "merch" or "merchandise" as a model, route, permission or field name.
- **Permissions already exist** — `shop.view` / `shop.edit` / `shop.delete` in `src/lib/permissions.ts`. Do not add new permission areas.
- **`includedEntries` defaults to `0`.** It is the kill switch for the entries spec. Phase 1 stores and edits it; nothing grants from it yet.
- **Print-to-order means `trackInventory: false`.** Do not add stock-reservation logic.
- **Rule 11 (LEGAL):** no customer-facing string may price entries per unit or use odds/chance/lottery/raffle framing. Phase 1 renders no entry copy at all — that lands with the entries spec.
- **Rule 2:** editing `src/models/Product.ts` or `src/app/api/**` requires updating `docs/cart-shop-products/` in the same task.
- **Every new test file needs a matching `test:*` script in `package.json`** or it is undiscoverable.
- `/shop` and `/shop/[slug]` are `force-dynamic` (nonce-CSP route class). **Never add `generateStaticParams`.**

---

### Task 1: Product schema — variants and merch fields

**Files:**
- Modify: `CLAUDE.md` (Domain Manifest — **do this first**)
- Modify: `src/models/Product.ts`
- Create: `src/utils/shop/variants.ts`
- Test: `src/utils/shop/__tests__/variants.test.ts`
- Modify: `package.json` (add `test:shop-variants`)
- Modify: `docs/cart-shop-products/models.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProductVariantLike`, `VariantHostLike`, `findVariantBySku(variants, sku)`, `variantLabel(variant)`, `isVariantPurchasable(host, variant)`, `activeVariants(host)`.

- [ ] **Step 0: Claim the new paths in the Domain Manifest**

`src/utils/shop/**` matches no domain today, so the doc-sync Stop hook will block this task's
commit as an orphan file. In `CLAUDE.md`'s Domain Manifest, add both paths to
`cart-shop-products.paths` now — `src/services/shop/**` is claimed here too so Task 2 does not
hit the same wall:

```
        "src/services/shop/**",
        "src/utils/shop/**",
```

- [ ] **Step 1: Write the failing test**

Create `src/utils/shop/__tests__/variants.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  findVariantBySku,
  variantLabel,
  isVariantPurchasable,
  activeVariants,
  type ProductVariantLike,
  type VariantHostLike,
} from "@/utils/shop/variants";

let failures = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
};

const v = (over: Partial<ProductVariantLike> = {}): ProductVariantLike => ({
  sku: "TA-HOOD-BLK-L",
  size: "L",
  colour: "Black",
  gtin: "00123456789012",
  isActive: true,
  ...over,
});

const host = (over: Partial<VariantHostLike> = {}): VariantHostLike => ({
  isActive: true,
  trackInventory: false,
  stock: 0,
  variants: [v()],
  ...over,
});

test("findVariantBySku returns the matching variant", () => {
  const a = v({ sku: "A" });
  const b = v({ sku: "B" });
  assert.equal(findVariantBySku([a, b], "B"), b);
});

test("findVariantBySku returns null for an unknown sku", () => {
  assert.equal(findVariantBySku([v()], "NOPE"), null);
});

test("findVariantBySku is exact, not case-insensitive", () => {
  assert.equal(findVariantBySku([v({ sku: "A" })], "a"), null);
});

test("variantLabel joins colour and size", () => {
  assert.equal(variantLabel(v({ colour: "Black", size: "L" })), "Black · L");
});

test("variantLabel omits missing parts without a stray separator", () => {
  assert.equal(variantLabel(v({ colour: "Black", size: undefined })), "Black");
  assert.equal(variantLabel(v({ colour: undefined, size: "L" })), "L");
});

test("variantLabel falls back to the sku when nothing else is set", () => {
  assert.equal(variantLabel(v({ colour: undefined, size: undefined, sku: "X1" })), "X1");
});

test("activeVariants drops inactive variants", () => {
  const on = v({ sku: "ON" });
  const off = v({ sku: "OFF", isActive: false });
  assert.deepEqual(activeVariants(host({ variants: [on, off] })), [on]);
});

test("print-to-order variant is purchasable at zero stock", () => {
  assert.equal(isVariantPurchasable(host({ trackInventory: false, stock: 0 }), v()), true);
});

test("stock-tracked variant is NOT purchasable at zero stock", () => {
  assert.equal(isVariantPurchasable(host({ trackInventory: true, stock: 0 }), v()), false);
});

test("stock-tracked variant is purchasable with stock", () => {
  assert.equal(isVariantPurchasable(host({ trackInventory: true, stock: 3 }), v()), true);
});

test("inactive variant is never purchasable", () => {
  assert.equal(isVariantPurchasable(host(), v({ isActive: false })), false);
});

test("inactive product makes every variant unpurchasable", () => {
  assert.equal(isVariantPurchasable(host({ isActive: false }), v()), false);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx tsx src/utils/shop/__tests__/variants.test.ts`
Expected: FAIL — `Cannot find module '@/utils/shop/variants'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/shop/variants.ts`:

```ts
/**
 * Pure variant helpers for the shop catalogue.
 *
 * Kept free of Mongoose types so they can be unit-tested and imported from
 * client components. The `*Like` shapes are the minimum each function needs —
 * an IProduct satisfies VariantHostLike structurally.
 */

export interface ProductVariantLike {
  sku: string;
  size?: string;
  colour?: string;
  /** Supplier blank identifier. Null until the print provider gives us one. */
  gtin?: string;
  isActive: boolean;
}

export interface VariantHostLike {
  isActive: boolean;
  /** false for print-to-order items, where stock is meaningless. */
  trackInventory: boolean;
  stock: number;
  variants: ProductVariantLike[];
}

export function findVariantBySku<T extends ProductVariantLike>(
  variants: readonly T[],
  sku: string
): T | null {
  return variants.find((v) => v.sku === sku) ?? null;
}

export function variantLabel(variant: ProductVariantLike): string {
  const parts = [variant.colour, variant.size].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  return parts.length > 0 ? parts.join(" · ") : variant.sku;
}

export function activeVariants<T extends ProductVariantLike>(host: {
  variants: readonly T[];
}): T[] {
  return host.variants.filter((v) => v.isActive);
}

export function isVariantPurchasable(
  host: VariantHostLike,
  variant: ProductVariantLike
): boolean {
  if (!host.isActive) return false;
  if (!variant.isActive) return false;
  // Print-to-order: the printer makes it on demand, so stock never gates it.
  if (!host.trackInventory) return true;
  return host.stock > 0;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx tsx src/utils/shop/__tests__/variants.test.ts`
Expected: PASS — 12 ✓ lines then `All tests passed`.

- [ ] **Step 5: Add the schema fields**

In `src/models/Product.ts`, add to the `IProduct` interface after `tags: string[];`:

```ts
  variants: {
    sku: string;
    size?: string;
    colour?: string;
    gtin?: string;
    isActive: boolean;
  }[];
  /** Free entries included with this item. 0 = none. Nothing grants from it yet. */
  includedEntries: number;
  printArtwork: {
    url: string;
    /** Print-provider placement id — "1" Front, "2" Back, "3" Left Chest. */
    placement: string;
    type: "printing" | "mockup";
  }[];
  /** false for print-to-order items. Existing stocked products keep true. */
  trackInventory: boolean;
  /** Reserved: which origin ships this. Merch ships from the printer, not our VIC store. */
  originLocation?: string;
```

And to `ProductSchema`, after the `tags` block:

```ts
  variants: [{
    sku: { type: String, required: true, trim: true },
    size: { type: String, trim: true },
    colour: { type: String, trim: true },
    gtin: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  }],
  includedEntries: {
    type: Number,
    default: 0,
    min: [0, 'Included entries cannot be negative'],
  },
  printArtwork: [{
    url: { type: String, required: true, trim: true },
    placement: { type: String, required: true, trim: true },
    type: { type: String, enum: ['printing', 'mockup'], required: true },
  }],
  trackInventory: {
    type: Boolean,
    default: true,
  },
  originLocation: {
    type: String,
    trim: true,
  },
```

- [ ] **Step 6: Wire the test script**

In `package.json`, beside the other `test:*` entries, add:

```json
"test:shop-variants": "tsx src/utils/shop/__tests__/variants.test.ts",
```

- [ ] **Step 7: Verify the whole thing compiles and passes**

Run: `npm run test:shop-variants && npx tsc --noEmit`
Expected: `All tests passed`, then tsc exits 0.

- [ ] **Step 8: Update the domain doc**

In `docs/cart-shop-products/models.md`, replace the `_TODO: pull schemas_` stub for `Product` with the real field list including the five new fields, and note that `rules.md` R4's claim that inventory is not modelled is wrong — `stock` has always existed, and `trackInventory` now says whether it is honoured.

- [ ] **Step 9: Commit**

```bash
git add src/models/Product.ts src/utils/shop package.json docs/cart-shop-products/models.md
git commit -m "feat(shop): add product variants, included entries and print artwork"
```

---

### Task 2: Admin catalogue API

**Files:**
- Create: `src/services/shop/ProductAdminService.ts`
- Create: `src/app/api/admin/products/route.ts`
- Create: `src/app/api/admin/products/[id]/route.ts`
- Modify: `docs/cart-shop-products/api.md`

**Interfaces:**
- Consumes: `IProduct` from Task 1. `src/services/shop/**` was already claimed in the manifest by Task 1 Step 0.
- Produces: `ProductAdminService.list()`, `.create(input)`, `.update(id, input)`, `.setActive(id, isActive)`, `.remove(id)`.

- [ ] **Step 1: Write the service**

Create `src/services/shop/ProductAdminService.ts`:

```ts
import Product, { type IProduct } from "@/models/Product";

export interface ProductVariantInput {
  sku: string;
  size?: string;
  colour?: string;
  gtin?: string;
  isActive?: boolean;
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  brand: string;
  variants: ProductVariantInput[];
  includedEntries?: number;
  trackInventory?: boolean;
  stock?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  tags?: string[];
}

export const ProductAdminService = {
  async list(): Promise<IProduct[]> {
    return Product.find({}).sort({ createdAt: -1 }).limit(200);
  },

  async create(input: ProductInput): Promise<IProduct> {
    return Product.create(input);
  },

  async update(id: string, input: Partial<ProductInput>): Promise<IProduct | null> {
    return Product.findByIdAndUpdate(id, input, { new: true, runValidators: true });
  },

  async setActive(id: string, isActive: boolean): Promise<IProduct | null> {
    return Product.findByIdAndUpdate(id, { isActive }, { new: true });
  },

  async remove(id: string): Promise<boolean> {
    const res = await Product.findByIdAndDelete(id);
    return res !== null;
  },
};
```

- [ ] **Step 2: Write the list + create route**

Create `src/app/api/admin/products/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { ProductAdminService } from "@/services/shop/ProductAdminService";

const variantSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  size: z.string().trim().max(32).optional(),
  colour: z.string().trim().max(32).optional(),
  gtin: z.string().trim().max(32).optional(),
  isActive: z.boolean().optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  price: z.number().min(0),
  images: z.array(z.string().url()).min(1),
  category: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  variants: z.array(variantSchema).min(1),
  includedEntries: z.number().int().min(0).optional(),
  trackInventory: z.boolean().optional(),
  stock: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  tags: z.array(z.string().trim()).optional(),
});

export async function GET() {
  try {
    const guard = await requirePermission("shop.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const products = await ProductAdminService.list();
    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error("Error listing products:", error);
    return NextResponse.json({ success: false, error: "Failed to list products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("shop.edit", request, {
      resourceType: "product",
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    const body = await request.json();
    const input = productSchema.parse(body);

    await connectDB();
    const product = await ProductAdminService.create(input);

    await log(200);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating product:", error);
    return NextResponse.json({ success: false, error: "Failed to create product" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write the per-id route**

Create `src/app/api/admin/products/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { ProductAdminService } from "@/services/shop/ProductAdminService";

const variantSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  size: z.string().trim().max(32).optional(),
  colour: z.string().trim().max(32).optional(),
  gtin: z.string().trim().max(32).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  price: z.number().min(0).optional(),
  images: z.array(z.string().url()).min(1).optional(),
  category: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  variants: z.array(variantSchema).min(1).optional(),
  includedEntries: z.number().int().min(0).optional(),
  trackInventory: z.boolean().optional(),
  stock: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
  tags: z.array(z.string().trim()).optional(),
});

const toggleSchema = z.object({ isActive: z.boolean() });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requirePermissionWithAudit("shop.edit", request, {
      resourceType: "product",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    const input = updateSchema.parse(await request.json());
    await connectDB();
    const product = await ProductAdminService.update(id, input);
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating product:", error);
    return NextResponse.json({ success: false, error: "Failed to update product" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requirePermissionWithAudit("shop.edit", request, {
      resourceType: "product",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    const { isActive } = toggleSchema.parse(await request.json());
    await connectDB();
    const product = await ProductAdminService.setActive(id, isActive);
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error toggling product:", error);
    return NextResponse.json({ success: false, error: "Failed to toggle product" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requirePermissionWithAudit("shop.delete", request, {
      resourceType: "product",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();
    const removed = await ProductAdminService.remove(id);
    if (!removed) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json({ success: false, error: "Failed to delete product" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npx tsc --noEmit && npx eslint src/app/api/admin/products src/services/shop --ext .ts`
Expected: both exit 0.

- [ ] **Step 5: Verify the guards actually reject**

Start `npm run dev`, then with **no session cookie**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/products
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/products \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `401` for both. A `200` or `500` means the guard is not wired — stop and fix.

- [ ] **Step 6: Update the domain doc**

In `docs/cart-shop-products/api.md`, add an `/api/admin/products/**` section listing the four handlers with their `shop.*` permissions, and note that unlike the public `/api/products/**` family these are the only single-product create/update paths.

- [ ] **Step 7: Commit**

```bash
git add src/services/shop src/app/api/admin/products CLAUDE.md docs/cart-shop-products/api.md
git commit -m "feat(shop): admin product catalogue API behind shop.* permissions"
```

---

### Task 3: Admin catalogue UI

**Files:**
- Create: `src/components/admin/ProductManagement.tsx`
- Modify: `src/app/admin/component/adminTabs.ts`
- Modify: `src/app/admin/component/AdminPage.tsx`
- Modify: `docs/admin/frontend.md`

**Interfaces:**
- Consumes: `GET/POST /api/admin/products`, `PUT/PATCH/DELETE /api/admin/products/[id]` from Task 2.
- Produces: a `products` admin tab gated on `shop.view`.

- [ ] **Step 1: Read two existing panels before writing anything**

Read `src/components/admin/` and pick the closest existing `*Management.tsx` panel that does list + create-modal + toggle + delete. Match its data-fetching approach (TanStack Query vs `useEffect`), its table markup, its dark-mode tokens and its toast usage. **Do not invent a new panel style** — `.cursorrules` forbids introducing patterns alongside existing ones.

- [ ] **Step 2: Build the panel**

Create `src/components/admin/ProductManagement.tsx` following that panel. It must provide:

- A table of products: image thumbnail, name, brand, price, variant count, `includedEntries`, active toggle.
- A create/edit modal with fields for every `ProductInput` key from Task 2, including a repeatable variant row editor (sku / size / colour / gtin / isActive) and a `trackInventory` checkbox.
- `includedEntries` rendered **immediately beside `price`** in the form, so a repricing edit makes the entry count visible in the same glance. This is the drift mitigation named in the entries spec.
- Delete behind a confirm, calling `DELETE`, and shown only when `usePermissions().has("shop.delete")`.
- Image upload via the shared `src/components/modals/ui/ImageUpload.tsx`.

- [ ] **Step 3: Register the tab**

In `src/app/admin/component/adminTabs.ts`, add to the `operations` group's `tabs` array:

```ts
      { id: "products", label: "Products", icon: Package, requires: "shop.view" },
```

Import `Package` from `lucide-react` alongside the other icons at the top of the file.

- [ ] **Step 4: Render the tab**

In `src/app/admin/component/AdminPage.tsx`, beside the other `{selectedTab === "..." && <X />}` lines, add:

```tsx
{selectedTab === "products" && <ProductManagement />}
```

and add its subtitle string to the subtitle map in the same file.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Then `npm run dev`, sign in as an admin, open **Admin → Operations → Products**. Create a product with two variants. Confirm it appears in the table, the active toggle works, and the row survives a page refresh.

- [ ] **Step 6: Confirm permission gating hides, not 403s**

Per `docs/admin/rules.md` R6, staff without `shop.view` must not see the tab at all. Verify the tab is absent for a role lacking it rather than showing and then erroring.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/ProductManagement.tsx src/app/admin/component docs/admin/frontend.md
git commit -m "feat(shop): admin products tab for catalogue management"
```

---

### Task 4: Storefront variant selection

**Files:**
- Modify: `src/app/(site)/shop/[slug]/components/ProductInteractions.tsx`
- Modify: `src/components/features/ShopContent.tsx:121`
- Modify: `docs/cart-shop-products/frontend.md`

**Interfaces:**
- Consumes: `activeVariants`, `variantLabel`, `isVariantPurchasable` from Task 1; `useCart().addToCart` from `src/contexts/CartContext.tsx`.
- Produces: nothing downstream in this phase.

- [ ] **Step 1: Add the variant picker**

In `ProductInteractions.tsx`, before the add-to-cart button, render a selector over `activeVariants(product)` using `variantLabel(v)` as the option text. Hold the chosen `sku` in state, defaulting to the first purchasable variant. Disable the add-to-cart button while no variant is selected or `isVariantPurchasable(product, selected)` is false, with the reason shown as text rather than a silently dead button.

- [ ] **Step 2: Pass the sku through to the cart**

`addToCart` currently takes `{ productId, quantity, price, product }`. Add the selected `sku` to that payload and thread it through `CartContext` and `POST /api/cart` so the line item records which variant was chosen. Without this, an order cannot tell the printer which size to make.

- [ ] **Step 3: Fix the grid's dead add-to-cart**

`src/components/features/ShopContent.tsx:121` is a `console.log` TODO stub. Because merch requires a variant choice, the grid card must **navigate to the product page** rather than add to cart directly. Replace the stub with a router push to `/shop/${product.id}`.

- [ ] **Step 4: Verify end to end**

Run `npm run dev`. With the product created in Task 3: open `/shop`, confirm the catalogue renders instead of "Coming Soon", click through to the product, pick a variant, add to cart, and confirm the cart drawer shows it with the variant label. Refresh and confirm the cart survives.

- [ ] **Step 5: Confirm no CSP regression**

Confirm `/shop` and `/shop/[slug]` still export `dynamic = "force-dynamic"` and that no `generateStaticParams` was added. This exact mistake already shipped once on `/shop/brand/[brand]`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(site)/shop" src/components/features/ShopContent.tsx src/contexts/CartContext.tsx docs/cart-shop-products/frontend.md
git commit -m "feat(shop): variant selection on the product page"
```

---

## Definition of done for Phase 1

- [ ] `npm run test:shop-variants` passes
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `/shop` renders a real catalogue for a signed-in customer
- [ ] A product with size and colour variants can be created, edited, deactivated and deleted from the admin
- [ ] The chosen variant sku reaches the cart
- [ ] `includedEntries` is stored and editable, and **grants nothing** — no entry copy is rendered anywhere

**Not in this phase:** checkout, the Order write, GST changes, entry granting, supplier submission.
