---
name: adding-stripe-endpoint
description: Use when adding any route under src/app/api/stripe/**, handling a new Stripe webhook event, or wiring a new Stripe API call (subscription, invoice, payment intent, setup intent). Triggers on phrases like "stripe webhook", "handle invoice.paid", "create subscription endpoint", "stripe api", "payment intent route".
---

# adding-stripe-endpoint

## When to use
Adding or modifying any route under `src/app/api/stripe/**`, **especially** new event-type branches inside `src/app/api/stripe/webhook/route.ts`. For non-Stripe routes use `adding-api-route` instead.

## Steps
1. Decide: is this a **client-initiated** Stripe call (e.g. `create-subscription`, `cancel-subscription`) or a **webhook event handler**?
2. **Client-initiated** route: create `src/app/api/stripe/<verb-noun>/route.ts`. Auth via `requireAuthenticatedUser()`, `await connectDB()`, then call `stripe` from `@/lib/stripe`. Delegate state-mutating logic to `src/services/subscription/` or `src/utils/payment/`. Return `{ success, data }` shape.
3. **Webhook event** branch: extend the `switch (event.type)` block in `src/app/api/stripe/webhook/route.ts`. Before doing anything stateful, call `await isEventProcessed(paymentIntentId)` (or check `ProcessedStripeEvent` for non-payment events) and short-circuit on duplicates. End the branch with `await ackProcessedStripeEventOnce(event)`.
4. If your handler does background work after responding (Klaviyo events, pixel tracking, partner-discount queue updates), wrap it with `executeBackgroundJob()` from `@/utils/webhook/background-jobs` so the webhook returns 200 fast.
5. If you add a new webhook route path (rare — almost always extend the existing one), add it to `next.config.ts` `headers()` with `webhookHeaders` so COEP doesn't block Stripe's POST.
6. Update `docs/billing-stripe/` (and `docs/subscription/` if subscription state changes) — the manifest maps `src/app/api/stripe/**` to `billing-stripe`.

## Conventions
- Webhook signature is verified with `stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)`. Never bypass it. If `STRIPE_WEBHOOK_SECRET` is missing return 500, do not process the event.
- **Idempotency is non-negotiable.** Stripe retries; double-processing creates double entries / double charges. Use `ProcessedStripeEvent` (TTL collection) for event-id dedup and `PaymentEvent`/`isPaymentProcessed` for payment-intent dedup.
- Subscription state mutations go through services in `src/services/subscription/` — never touch `User.subscription` from a webhook branch directly. Pause/resume specifically lives in `SubscriptionCollectionPauseService`.
- Stripe rate limits: long-running scripts use `DELAY_BETWEEN_UPDATES_MS` + 429 `Retry-After` retry (see `scripts/migrate-anchor-billing-24.ts`). Webhook handlers don't loop — if you find yourself looping inside one, it belongs in a service or background job.
- Logging in the webhook uses `webhookLog(level, message, data)` (env-aware) — do not switch to `console.log` (production strips it).
- Date-sensitive billing math uses `date-fns-tz` AEST. Anchor day rules live in `docs/BILLING_ANCHOR_24.md` — **read it** before changing renewal-date logic.

## Verification
```bash
npm run lint
npm run type-check
npm run test:stripe-collection-pause
npm run test:anchor-billing
npm run test:refund-reversal           # if touching refund flows
```
For webhook changes, also test locally with the Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) and confirm `ProcessedStripeEvent` rows appear. Do not commit; ask the user.
