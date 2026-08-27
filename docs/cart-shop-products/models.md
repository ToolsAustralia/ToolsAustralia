# Cart-Shop-Products — Models

| Model | Path | Purpose |
|---|---|---|
| `Product` | [src/models/Product.ts](../../src/models/Product.ts) | Shop catalog |
| `Order` | [src/models/Order.ts](../../src/models/Order.ts) | Completed purchases |

## `Product`

| Field | Type | Notes |
|---|---|---|
| `name` | String, required | ≤200 chars |
| `description` | String, required | ≤2000 chars |
| `price` | Number, required | Dollars, **not** cents. Min 0 |
| `images` | String[] | URLs |
| `category`, `brand` | String, required | |
| `stock` | Number, default 0 | Only meaningful when `trackInventory` is true — see below |
| `rating` | Number 0–5, default 0 | |
| `reviews[]` | Subdoc | `{ userId (ref User, **required**), rating 1–5, comment ≤500, createdAt }` |
| `features` | String[] | |
| `specifications` | Map of String | Free-text. Weight lives here as e.g. `"2.3kg"` — unusable for rate calculation |
| `isActive` | Boolean, default true | Also the shop's kill switch: with no active products `/shop` renders its "Coming Soon" empty state |
| `isFeatured` | Boolean, default false | |
| `tags` | String[], lowercased | |
| **`variants[]`** | Subdoc | `{ sku (required), size, colour, gtin, isActive (default true) }`. Apparel is size × colour, so this is the purchasable unit |
| **`includedEntries`** | Number, default **0** | Free entries included with the item. Authored per product and deliberately **independent of `price`** — publishing a dollar-to-entry ratio is prohibited (CLAUDE.md rule 11). **Nothing grants from this yet** |
| **`printArtwork[]`** | Subdoc | `{ url (required), placement (required), type: "printing" \| "mockup" }`. `placement` is a print-provider id — `"1"` Front, `"2"` Back, `"3"` Left Chest |
| **`trackInventory`** | Boolean, default **true** | `false` for print-to-order items, where `stock` is meaningless |
| **`originLocation`** | String, optional | Reserved. Merch ships from the printer, not our VIC store — the multi-origin hook |

**Indexes:** text on `{name, description, brand}`; single-field on `category`, `brand`,
`price`, `rating`, `tags`; compound `{isActive, isFeatured}`.

> The text index is **not** used by `GET /api/products`, which does a case-insensitive
> `$regex` `$or` across name/description/brand/category instead.

### Variant helpers

Pure logic lives in [src/utils/shop/variants.ts](../../src/utils/shop/variants.ts) — kept free
of Mongoose types so it is unit-testable and importable from client components. `IProduct`
satisfies `VariantHostLike` structurally.

| Function | Behaviour |
|---|---|
| `findVariantBySku(variants, sku)` | Exact match, **not** case-insensitive. `null` when absent |
| `variantLabel(variant)` | `"Black · L"`; drops missing parts without a stray separator; falls back to the `sku` |
| `activeVariants(host)` | Filters out `isActive: false` variants |
| `isVariantPurchasable(host, variant)` | False if the product or variant is inactive. When `trackInventory` is false it is **always** purchasable (print-to-order); otherwise requires `stock > 0` |

Tests: `npm run test:shop-variants`.

> **Correction to [rules.md](rules.md) R4**, which states inventory is not modelled: `stock`
> has always existed on `Product`. What was missing is whether it should be *honoured* — that is
> now `trackInventory`.

## `Order`

Zero documents are ever written to this collection today. See [api.md](api.md) and
[gotchas.md](gotchas.md) — the order-write path described in [backend.md](backend.md) does not
exist in code.

| Field | Type | Notes |
|---|---|---|
| `orderNumber` | String, **required**, unique | The dead writer never sets it, which is one of two reasons that route throws |
| `user` | ObjectId ref User, required | |
| `products[]` | Subdoc | `{ product (ObjectId ref Product, required), quantity ≥1, price ≥0 }`. **The field is `product`, not `productId`** — both read routes populate the wrong path |
| `tickets[]` | Subdoc | `{ miniDrawId, quantity, price }` |
| `membership` | Subdoc | `{ packageId, price }` |
| `totalAmount` | Number, required | Single total; no subtotal/GST/shipping breakdown |
| `appliedDiscounts[]` | Subdoc | `type: "membership" \| "partner" \| "rewards"`. Nothing writes it; the member shop discount belongs here |
| `status` | Enum | `pending \| processing \| shipped \| delivered \| cancelled \| completed`. The webhook's failure path writes `"failed"`, which is **not** in this enum |
| `shippingAddress` | Subdoc, optional | Every subfield optional. `country` defaults to `"Australia"`. No billing address, no phone |
| `paymentIntentId` | String, sparse index | Bare id; no charge id, no payment-method snapshot, no `paymentStatus` |
| `trackingNumber` | String, optional | |
| `notes` | String ≤500 | |

## `ShopEntryMultiplierConfig` (2026-08-20)

Singleton (`_id: "shop-entry-multiplier-config"`) holding the two admin-set ceilings that are
*not* product data:

| Field | Meaning |
| --- | --- |
| `cap: number \| null` | Shop-wide ceiling. `null` = inherit the one-time promo unchanged |
| `categoryCaps: Map<string, number>` | Per-category ceilings, keyed by `normaliseCategoryKey` (`trim().toLowerCase()`). Absent = fall through |
| `updatedBy` | Who last changed it |

A **Map**, not an array of `{category, cap}`: a map cannot hold two rows for the same key, so
"which one wins" is unaskable rather than answered. `null` is the no-ceiling value rather than
defaulting to 10, because "inherit" and "capped at the highest possible value" are different
statements and only the first stays correct if `PROMO_MULTIPLIERS` ever grows.

### New fields on `Product` and `Order`

| Field | Where | Why it lives there |
| --- | --- | --- |
| `entryMultiplierCap?: number \| null` | `Product` | The per-product tier. Authored beside `includedEntries`, which is already product-level and admin-editable |
| `entryMultiplierCap?: number \| null` | `Order.products[]` | Snapshotted at checkout. The webhook never loads products, so without this the tier would apply on the page and never reach the grant |
| `entryMultiplierApplied?: number` | `Order.products[]` | What the grant actually multiplied this line by. **Per line**, because a cart holding a capped tee beside an uncapped hoodie has no single multiplier |

The dividing rule: **product data is snapshotted onto the order line, config resolves live at
webhook time.** That is why the product ceiling is frozen at checkout while the category and
shop-wide ceilings are read fresh alongside the promo.

## Entry multiplier — the model as it stands (2026-08-20)

Supersedes the ceiling description above. Merchandise carries its **own** multiplier; it does not
inherit the one-time pack rate.

`ShopEntryMultiplierConfig` (singleton, `_id: "shop-entry-multiplier-config"`):

| Field | Meaning |
| --- | --- |
| `multiplier: number \| null` | Shop-wide rate. `null` = fall through to 1× |
| `categoryMultipliers: Map<string, number>` | Per-category rates, keyed by `normaliseCategoryKey`. Absent = fall through |

| Field | Where | Why it lives there |
| --- | --- | --- |
| `entryMultiplier?: number \| null` | `Product` | The per-product rate, beside `includedEntries` |
| `entryMultiplier?: number \| null` | `Order.products[]` | Snapshotted at checkout — the webhook never loads products |
| `entryMultiplierApplied?: number` | `Order.products[]` | What the grant actually multiplied this line by. **Per line**: two categories can carry different rates, so an order has no single multiplier |

`null` is deliberately distinct from `1`: null means nothing was configured at that tier, `1`
means somebody decided 1. They look identical to a customer and completely different to whoever
is debugging why a rate did nothing.

A **Map**, not an array of `{category, multiplier}`: a map cannot hold two rows for the same
category, so "which one wins" is unaskable rather than answered.

## ⚠️ `Order` is read by the admin Receipts ledger — changes here reach it

[docs/admin/receipts.md](../admin/receipts.md) unions `Order` into the admin **Receipts**
revenue ledger (`src/services/admin/receipts.ts`, `orderStages()`). It reads `createdAt`,
`status`, `totalAmount`, `paymentIntentId`, `orderNumber` and `user`. It currently returns
**0 rows** — the shop has not launched — and the mapping exists so Receipts works on launch
day instead of needing a rework.

**Two invariants that live in this domain but are depended on over there:**

1. **`Order` is always a shop-product order.** `createOrderSchema`
   ([src/app/api/orders/route.ts](../../src/app/api/orders/route.ts)) accepts only
   `products` / `shippingAddress` / `paymentIntentId`, and that route is the **only** writer
   of `Order`. This is what makes `Order.tickets[]` and `Order.membership` vestigial, and it
   is the entire reason unioning `Order` with `PaymentEvent` cannot double-count.
2. **`cancelled` means a voided sale.** Receipts excludes that status as money-not-received.

**If you add a second `Order` writer, start writing `tickets[]` / `membership`, or repurpose
the `cancelled` status, the Receipts ledger can double-count or mis-total revenue.** Work
through the launch checklist in
[admin/receipts.md § When the shop launches](../admin/receipts.md#when-the-shop-launches--update-this-feature)
in the same change.
