# Cart-Shop-Products — API

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/cart/**` | Server-side cart helpers |
| _TODO_ | `/api/products/**` | Product catalog reads |
| _TODO_ | `/api/orders/**` | User order history |

> _TODO: read [src/app/api/cart/](../../src/app/api/cart/), [src/app/api/products/](../../src/app/api/products/), and [src/app/api/orders/](../../src/app/api/orders/) and document each handler._

## Cross-domain checkout

Checkout itself goes through [billing-stripe](../billing-stripe/api.md) routes:
- `POST /api/stripe/create-payment-intent` → start payment
- Webhook → `Order` row + `BenefitsGranted`
