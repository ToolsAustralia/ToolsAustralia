# Stripe: Collection pause and recovery

## Why `pause_collection` exists

On a failed **renewal** (`subscription_cycle`), the app may set Stripe `pause_collection` with `behavior: keep_as_draft` so Stripe does not keep finalizing a new invoice every period while the subscription is still `past_due`. That prevents stacked charges and duplicate renewal benefits. See `pauseAfterRenewalFailure` in [`src/services/subscription/SubscriptionCollectionPauseService.ts`](../src/services/subscription/SubscriptionCollectionPauseService.ts), policy helpers in [`src/services/subscription/pauseCollectionPolicy.ts`](../src/services/subscription/pauseCollectionPolicy.ts), and the `invoice.payment_failed` handler in [`src/app/api/stripe/webhook/route.ts`](../src/app/api/stripe/webhook/route.ts).

## Invariant after recovery

When a member successfully pays the recovery/renewal invoice, **`pause_collection` must be cleared** so the next billing cycle creates and charges a normal invoice. Clearing is done with `resumeAfterSuccessfulRenewalPayment` in the same service file (idempotent: safe to call when not paused).

Recovery paths covered in code:

- `invoice.payment_succeeded` webhook (membership) — `resumeAfterSuccessfulRenewalPayment` runs **before** `processPaymentBenefits` when the invoice is already paid, so a slow or partially failing benefits path (or Stripe CLI / proxy **timeouts** while waiting for the HTTP response) does not leave `pause_collection` uncleared. Policy uses `shouldClearPauseCollectionAfterPaidInvoice`, recurring-affiliate eligibility, and **any subscription** that still has `pause_collection` set.
- Admin past-due charge — [`src/server/admin/chargePastDueShared.ts`](../src/server/admin/chargePastDueShared.ts) after a successful `invoices.pay`.
- User retry — [`src/app/api/stripe/renew-subscription/route.ts`](../src/app/api/stripe/renew-subscription/route.ts) after a successful `invoices.pay`.

## “Missing” invoice while paused

With `keep_as_draft`, newer cycle invoices can stay **draft** until collection resumes. Any tool that only lists **open** invoices (for example, some admin previews) may not show a draft. Check the subscription in the Stripe Dashboard: **Invoices** on the customer or subscription, including **draft** and **open**.

Failed-payment flows prefer an **open**, chargeable subscription invoice over relying only on `latest_invoice` (which may be a newer draft). See [`src/utils/payment/failed-invoice-selection.ts`](../src/utils/payment/failed-invoice-selection.ts) and [`src/utils/payment/failed-invoice-handler.ts`](../src/utils/payment/failed-invoice-handler.ts).

## Stripe API: do not `expand` `latest_payment_intent` on Invoices

On current Stripe API versions (e.g. `2025-05-28.basil`), including `latest_payment_intent` in `expand` when retrieving an **Invoice** returns `This property cannot be expanded (latest_payment_intent)`. Use `expand: ['payment_intent']` only; the invoice JSON may still include `latest_payment_intent` as an id, or retrieve the PaymentIntent by id.

## Audit: active in DB but collection still paused

Script (dry-run by default; outputs CSV to stdout):

```bash
npx tsx scripts/list-active-paused-subscriptions.ts --limit=200
```

Optional: clear in Stripe from the script (use after reviewing dry-run; requires explicit flags):

```bash
npx tsx scripts/list-active-paused-subscriptions.ts --live --resume --limit=50
```

Requires `MONGODB_URI` and `STRIPE_SECRET_KEY` in `.env.local`.

## Automated tests (policy + invoice selection)

```bash
npm run test:stripe-collection-pause
```

## Manual fix in Stripe Dashboard

1. Open the **Customer** → **Subscription**.
2. If **Pause collection** is on, use **Resume collection** (or update subscription to clear `pause_collection`).
3. Confirm the correct invoice is **open** or **paid**; finalize draft invoices only when appropriate for your recovery case.

## Logging and support

- Admin charge rows store payment success in `InvoiceChargeLog`; if resume fails, `result.pauseCollectionResumeError` may be set and `resumeCollectionError` is returned in the API row when applicable.
- Do not log full payment method or card data; subscription and invoice IDs are enough for support.
