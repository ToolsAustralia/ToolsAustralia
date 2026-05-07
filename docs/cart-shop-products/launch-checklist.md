# Shop — Launch Checklist

Pre-flight before flipping the cart icon (Task 53). Each item must be ticked off — the work is not complete just because the code compiles.

## Payments

- [ ] Apple Pay verified on real iPhone Safari
- [ ] Google Pay verified on real Android Chrome
- [ ] `apple-developer-merchantid-domain-association` file served at the right path AND verified in the Stripe Dashboard
- [ ] Live Stripe key + webhook endpoint configured in production
- [ ] At least one prod-mode **guest** + **logged-in** real-card transaction (refunded after)
- [ ] `/checkout/success` works on mobile Safari (3DS redirect path included)
- [ ] Reconcile script runs cleanly in dry-run: `npm run reconcile:shop-orphans:dry`

## Email

- [ ] SendGrid templates `shop-order-confirmation` and `shop-stock-refund` created/tested
- [ ] Tax invoice renders correctly across at least Gmail, Outlook, Apple Mail
- [ ] `from` address (`no-reply@toolsaustralia.com.au`) authenticated in SendGrid (SPF/DKIM)
- [ ] Sold-out refund email tested via the stock-race e2e or manually

## Tracking & analytics

- [ ] Klaviyo "Placed Order" event arriving in dashboard with full Items[] payload
- [ ] Klaviyo "Ordered Product" events arriving (one per line item)
- [ ] Meta Events Manager shows Purchase events with high match quality and dedup against Pixel `eventID = paymentIntentId`
- [ ] AddToCart + ViewContent events arriving on Pixel + Klaviyo
- [ ] InitiateCheckout firing on `/checkout` page

## Operations

- [ ] AusPost / fulfillment provider notified (manual order handling for MVP — no auto label generation)
- [ ] Admin team trained on `/my-account/orders/[orderNumber]` for reading customer orders
- [ ] On-call has access to: `npm run reconcile:shop-orphans`, Stripe Dashboard, MongoDB shop-orders queries

## Migrations

- [ ] `npm run migrate:shop-order-fields:dry` clean in production-like staging
- [ ] `npm run migrate:shop-order-fields` run in production (after dry-run review)

## Final gate

- [ ] All e2e specs green locally (`npm run test:e2e:shop`)
- [ ] All shop unit tests green (`npm run test:shop`)
- [ ] `npm run lint` and `npm run type-check` clean
- [ ] Cart icon flipped on (Task 53) — **this is the launch commit**

## Out of scope (don't block launch)

These are documented in the spec §7.7 as deliberately not tested:
- AU postcode → delivery zone validation
- Tax invoice rendering across every email client
- High-concurrency stock-race load test
- Stripe-side refund email (Stripe sends its own)
- Fractional cents
