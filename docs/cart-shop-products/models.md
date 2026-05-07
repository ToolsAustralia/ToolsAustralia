# Cart-Shop-Products — Models

| Model | Path | Purpose |
|---|---|---|
| `Product` | [src/models/Product.ts](../../src/models/Product.ts) | Shop catalog |
| `Order` | [src/models/Order.ts](../../src/models/Order.ts) | Completed purchases (member or guest) |

## `Order`

A completed purchase — products, draw tickets, or membership upgrades. Either user-owned **or** guest (mutually exclusive — see invariant below).

### Identity & ownership

| Field | Type | Notes |
|---|---|---|
| `orderNumber` | `string` (unique) | Human-readable order id. Auto-indexed via `unique: true`. |
| `user` | `ObjectId(User)` (optional) | Set for member orders. **Mutually exclusive** with guest fields. |
| `guestEmail` | `string` (lowercase, trim) | Set for guest orders. |
| `guestFirstName` | `string` | Set for guest orders. |
| `guestLastName` | `string` | Set for guest orders. |

**Invariant** (enforced by `pre("validate")` hook): exactly one of `user` or `(guestEmail + guestFirstName + guestLastName)` must be present.

### Line items

`products[]`, `tickets[]`, and optional `membership` describe what was bought. Each carries its own price snapshot at purchase time.

### Money

| Field | Type | Notes |
|---|---|---|
| `totalAmount` | `number` (≥ 0) | Total charged in AUD. |
| `appliedDiscounts[]` | `{ type, amount, description }[]` | `type ∈ {membership, partner, rewards}`. |
| `gstAmount` | `number` (≥ 0, default 0) | GST included in `totalAmount` (Aus 1/11). For tax invoice. |
| `shippingCost` | `number` (≥ 0, default 0) | Flat shipping charged at checkout. |
| `invoiceSentAt` | `Date?` | When SendGrid tax invoice was emailed (set by webhook handler). |

### Status & shipping

`status ∈ {pending, processing, shipped, delivered, cancelled, completed}` (default `pending`).

`shippingAddress` — all subfields optional to support members vs guests vs draw-only orders:

| Field | Type | Notes |
|---|---|---|
| `firstName`, `lastName` | `string` | |
| `email`, `phone` | `string` | Lowercase email, trimmed. |
| `addressLine1` | `string` | Primary line. |
| `address` | `string` | Legacy field; read-only fallback during migration. |
| `addressLine2` | `string` | Optional second line. |
| `city` | `string` | Labeled "Suburb" in UI. |
| `state` | enum | One of `NSW, VIC, QLD, WA, SA, TAS, ACT, NT` (uppercase). |
| `postalCode` | `string` | 4-digit AU postcode (regex-validated). |
| `country` | `string` | Defaults to `Australia`. |
| `deliveryInstructions` | `string` (≤ 500) | Optional notes for courier. |

### Payment & operational

| Field | Type | Notes |
|---|---|---|
| `paymentIntentId` | `string?` | Stripe PI id. **Sparse + unique** index — webhook lookups + idempotency. |
| `trackingNumber` | `string?` | Carrier tracking. |
| `notes` | `string?` (≤ 500) | Internal notes. |

### Indexes

- `orderNumber` — unique (auto).
- `user` — for member order history.
- `status` — for admin filters.
- `createdAt` desc — for list views.
- `paymentIntentId` — sparse + **unique** (webhook idempotency + duplicate-charge guard).
- `(guestEmail, createdAt desc)` — sparse, for guest order lookups.

### Migration notes

- `user` was `required: true` historically. Existing rows still have `user`; the schema change is additive.
- `gstAmount`/`shippingCost` default to 0 on new rows; existing rows are backfilled by [scripts/migrations/add-shop-order-fields.ts](../../scripts/migrations/add-shop-order-fields.ts).
- `shippingAddress.address` (legacy) is preserved alongside the new `addressLine1`/`addressLine2` for read-only fallback. New writes should use the structured fields.
