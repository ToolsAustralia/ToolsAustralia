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

There is still **no `POST /api/products`** — the only creation paths are the bulk
`import` route and `duplicate/[id]`.

## Cross-domain checkout

Checkout itself goes through [billing-stripe](../billing-stripe/api.md) routes:
- `POST /api/stripe/create-payment-intent` → start payment
- Webhook → `Order` row + `BenefitsGranted`
