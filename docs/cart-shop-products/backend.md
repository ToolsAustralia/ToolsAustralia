# Cart-Shop-Products — Backend

## Routes

- `/api/cart/` — server-side cart helpers if any (likely just totals/validation)
- `/api/products/` — product list / detail reads
- `/api/orders/` — order list / detail reads

> _TODO: read each route handler and document._

## Order writes

Orders are written by the Stripe webhook (`payment_intent.succeeded`) for shop purchases — NOT by client-side calls. The success path:
1. Webhook receives PI succeeded event
2. Identify it as a shop purchase via metadata
3. Write `Order` row
4. `processPaymentBenefits` writes `BenefitsGranted` ledger row referencing the order

## Member discount calculation

Member-only pricing is computed server-side at checkout time, not client-side. The `MembershipPackage.shopDiscountPercent` field on the user's active package determines the discount.

> _TODO: locate the discount-calculation helper._
