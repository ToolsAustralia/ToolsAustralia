# Cart-Shop-Products — Backend

## Routes

- `/api/cart/` — server-side cart helpers if any (likely just totals/validation)
- `/api/products/` — product list / detail reads
- `/api/orders/` — order list / detail reads

> _TODO: read each route handler and document._

## Order writes

Orders are written by the Stripe webhook (`payment_intent.succeeded`) for shop purchases — NOT by client-side calls. The success path:
1. Webhook receives PI succeeded event
2. Identify it as a shop purchase via metadata (`metadata.type === "shop"`)
3. [src/services/shop/finalizeShopOrder.service.ts](../../src/services/shop/finalizeShopOrder.service.ts) runs: atomic per-line stock decrement → write `Order` row → clear logged-in user's cart
4. If any line item runs out between PI confirmation and finalize, all decrements are reverted and the PaymentIntent is fully refunded (`refunded_stock_lost`); customer gets a sold-out apology email

Returns `"order_written" | "refunded_stock_lost" | "skipped_not_shop"`. Webhook treats `skipped_not_shop` as a no-op so non-shop PIs (subscription, mini-draw, etc.) continue down their existing branches unchanged.

## Member discount calculation

Member-only pricing is computed server-side at checkout time, not client-side. The `MembershipPackage.shopDiscountPercent` field on the user's active package determines the discount.

## Cart validation

Cart validation lives at [src/services/shop/cartValidation.service.ts](../../src/services/shop/cartValidation.service.ts). Returns line-item errors (`not_found`, `inactive`, `insufficient_stock`). Price is always taken from the DB — never from the client. Test: `npm run test:cart-validation` (DB-backed; uses `test-cart-validation-` prefix and self-cleans).

## Shop PaymentIntent creation

Shop PaymentIntent creation: [src/services/shop/createShopPurchasePaymentIntent.service.ts](../../src/services/shop/createShopPurchasePaymentIntent.service.ts). Intentionally duplicated from `create-one-time-purchase` — see TODO marker in file. Resolves-or-creates the Stripe customer (lookup by `User.stripeCustomerId` for members, fallback to email lookup, otherwise create), optionally attaches a saved payment method, then creates the PaymentIntent via the shared `createPaymentIntentConfig` helper with `paymentType: "shop"` (return URL: `/checkout/success`). Confirmation happens client-side via PaymentElement.
