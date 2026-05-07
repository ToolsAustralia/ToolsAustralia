# Cart-Shop-Products — API

All `/api/cart/**` routes are auth-gated via `getServerSession` (NextAuth) — return 401 for unauthenticated. (Migrated from a JWT-bearer scheme to NextAuth in the shop refactor.)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cart` | Read user cart (with populated product / mini-draw details). |
| POST | `/api/cart` | Add a `product` or `ticket` line item. |
| PUT | `/api/cart` | Update quantity (or remove via `quantity: 0`). |
| DELETE | `/api/cart` | Remove a single line item. |
| GET | `/api/cart/items` | Cart items in TanStack-friendly shape. |
| GET | `/api/cart/summary` | Subtotal/tax/shipping/total breakdown. |
| PUT | `/api/cart/update` | Update + return refreshed items + summary. |
| DELETE | `/api/cart/clear` | Empty the cart. |
| _TODO_ | `/api/products/**` | Product catalog reads |
| GET | `/api/orders/by-payment-intent/[paymentIntentId]` | `/checkout/success` polling: returns `{status: "ready", order}` once webhook has written the Order, otherwise `{status: "pending", paymentIntentStatus}` (looked up from Stripe). |
| GET | `/api/orders` | List the current user's orders. Auth: NextAuth session (401 otherwise). |
| GET | `/api/orders/[id]` | Read a single order owned by the current user. 404 for non-owners. |
| PUT | `/api/orders/[id]` | Update status / tracking / notes (owner-only — admin paths use a different surface). |

> **`POST /api/orders` was removed in the shop refactor.** Orders are written exclusively by the Stripe webhook (`finalizeShopOrder`) on `payment_intent.succeeded`. Client-side order creates are no longer permitted.

> _TODO: read [src/app/api/cart/](../../src/app/api/cart/), [src/app/api/products/](../../src/app/api/products/), and the remaining handlers under [src/app/api/orders/](../../src/app/api/orders/) and document each._

## Cross-domain checkout

Checkout itself goes through [billing-stripe](../billing-stripe/api.md) routes:
- `POST /api/stripe/create-payment-intent` → start payment
- Webhook → `Order` row + `BenefitsGranted`
