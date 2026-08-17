# Cart-Shop-Products — API

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/cart/**` | Server-side cart helpers |
| see below | `/api/products/**` | Product catalog |
| _TODO_ | `/api/orders/**` | User order history |

> _TODO: read [src/app/api/cart/](../../src/app/api/cart/) and [src/app/api/orders/](../../src/app/api/orders/) and document each handler._

## `/api/products/**` — auth model

**Every route in this family shipped with no auth and no CSRF.** That was inert only
because the catalog is empty; the moment products are seeded it becomes a one-request
catalog wipe (`DELETE /api/products/delete-all` ran `Product.deleteMany({})` for any
anonymous caller) and a stored-content injection vector on a public page. Gated
2026-08-17 behind the new `shop.*` permissions — see
[docs/admin/staff-permissions-mapping.md](../admin/staff-permissions-mapping.md) for the
full route → permission table.

**Public (storefront reads — keep them public):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/products` | Paginated list. Filters via case-insensitive `$regex` across name/description/brand/category — note this does **not** use the text index defined on the model |
| GET | `/api/products/[id]` | Product detail. `[slug]` on the page route is really the Mongo `_id` |
| GET | `/api/products/search` | Search |
| GET | `/api/products/categories` | Distinct category list |
| GET | `/api/products/featured` · `/bestsellers` · `/newarrivals` | Merchandising rails |
| GET | `/api/products/related/[id]` | Related products |
| GET | `/api/products/reviews/[id]` | Read reviews |
| GET | `/api/products/stock/[id]` | Stock read |

**Customer-authenticated:**

| Method | Path | Guard |
|---|---|---|
| POST | `/api/products/reviews/[id]` | `requireSameOrigin` + `requireAuthenticatedUserDoc`. **Author identity comes from the session** — the route previously accepted `userName` / `userEmail` in the body, so an anonymous caller could review as anyone. It also never set the schema-required `userId`, so it would have thrown a ValidationError on the first real call |

**Staff-gated** (`requirePermissionWithAudit`):

| Permission | Routes |
|---|---|
| `shop.view` | `analytics`, `export` |
| `shop.edit` | `import`, `duplicate/[id]`, `archive-all`, `archive/[id]`, `restore-all`, `restore/[id]`, `bulk` (PATCH), `stock/[id]` (PATCH) |
| `shop.delete` | `delete-all`, `delete-archived`, `delete-low-stock`, `delete-out-of-stock`, the ten `delete-by-*` routes, `bulk` (DELETE) |

Denied attempts by a signed-in staffer are written to `StaffActivity`. **Successful**
actions are not yet audited — the guard is used without its `log()` callback because
these routes have no admin UI to attribute the action to. Wire `await log(200)` when the
products admin surface is built and these handlers are rewritten.

There is still **no `POST /api/products`** — in this family the only creation paths are the
bulk `import` route and `duplicate/[id]`. Single-product create and update live under
`/api/admin/products/**` below.

## `/api/admin/products/**` — the admin catalog

Added 2026-08-17. Delegates to `ProductAdminService`
([src/services/shop/ProductAdminService.ts](../../src/services/shop/ProductAdminService.ts));
the route handlers stay thin — Zod at module scope, guard, `connectDB`, service, `{ success,
data }`.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/admin/products` | `shop.view` | List, newest first, capped at 200 |
| POST | `/api/admin/products` | `shop.edit` | Create a single product |
| PUT | `/api/admin/products/[id]` | `shop.edit` | Update fields |
| PATCH | `/api/admin/products/[id]` | `shop.edit` | Activate / deactivate only |
| DELETE | `/api/admin/products/[id]` | `shop.delete` | Hard delete |

All writes go through `requirePermissionWithAudit` **and call `log(200)`**, so successful
admin actions land in `StaffActivity` — unlike the older `/api/products/**` handlers, which
audit denials only.

**Verified unauthenticated** (2026-08-17, dev server): all five return `401`;
`DELETE /api/products/delete-all` also returns `401`; `GET /api/products` still returns `200`
as a public storefront read.

`PATCH` is deliberately narrow — it accepts `{ isActive }` and nothing else. Deactivating every
product is the shop's kill switch: `/shop` falls back to its "Coming Soon" empty state with no
deploy, because that panel is the grid's zero-result branch.

`variants[]` requires at least one entry on create. A product with no variant has nothing
purchasable, since the variant is the unit a customer selects and the printer makes.

## Cart line identity — `(productId, sku)` (2026-08-17)

A product cart line is keyed on **both** the product and the chosen variant. Two sizes of the
same hoodie are two lines.

Matching is **exact on both sides**: a request without a `sku` matches only a line without one
— i.e. a line added before variants existed — and never collapses into a variant line. This
holds in three places that must stay in step:

| Where | What |
|---|---|
| `findCartItem` in [/api/cart](../../src/app/api/cart/route.ts) | Server-side identity, used by POST and PUT |
| The `DELETE` filter in the same file | Removes the matching **line**, not every line for the product |
| The optimistic matchers in [CartContext](../../src/contexts/CartContext.tsx) | `addToCart`, `updateCartItem`, `removeFromCart` |

`removeFromCart(itemId, itemType?, sku?)` takes the sku as a third argument. Omitting it on a
variant product removes the *no-sku* line, which is almost certainly not what a caller wants —
pass the sku from the cart line being rendered.

**Two server-side rules `POST /api/cart` now enforces**, neither of which existed before:

1. **Stock is only checked when `trackInventory` is true.** Print-to-order products carry
   `stock: 0` forever, so the old unconditional check would have made every merch item
   permanently unaddable.
2. **A variant-bearing product must be added as a specific, existing, active variant.** The
   sku is validated against `product.variants` server-side — a client-supplied sku is never
   trusted. Missing sku → `400`; unknown sku → `404`; inactive variant → `400`.

## Cross-domain checkout

Checkout itself goes through [billing-stripe](../billing-stripe/api.md) routes:
- `POST /api/stripe/create-payment-intent` → start payment
- Webhook → `Order` row + `BenefitsGranted`
