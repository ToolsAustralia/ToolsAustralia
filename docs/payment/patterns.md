# Payment — Patterns

## P0. Lazy-load payment-bearing UI surfaces (2026-05-10)

`PaymentMethodsTab`, `PaymentMethodSelector`, and `SavedPaymentMethodsModal` bundle `@stripe/react-stripe-js`, the project's saved-card UI, and the Setup Intent flow. The convention from Phase 5A onwards is to import these via `next/dynamic({ ssr: false })` at non-modal callsites — see [billing-stripe/patterns.md#p0-lazy-load-stripe-bearing-modals-at-every-callsite-2026-05-10](../billing-stripe/patterns.md#p0-lazy-load-stripe-bearing-modals-at-every-callsite-2026-05-10) for the full pattern, the modal-in-modal exemption, and the type-extraction caveat.

In this domain specifically:
- `PaymentMethodSelector` is imported by `MembershipModal` and `StripePaymentModal/PaymentForm.tsx` — both modal-in-modal, so the inner imports stay static.
- `PaymentMethodsTab` is imported by `SettingsModal` (modal-in-modal, static) and `my-account/components/settings/PaymentTab.tsx` (non-modal, lazy in Phase 5A).
- `SavedPaymentMethodsModal` is imported by `PaymentMethodSelector` (modal-in-modal, static).

## P1. Reverser modules per grant type

Every grant type gets a focused module under `src/utils/payment/reversers/`. Each implements the same contract:

```ts
interface PaymentReverser<T> {
  shouldReverse(grant: T): boolean;
  reverse(grant: T, context: ReversalContext): Promise<ReversalResult>;
}
```

Orchestrator: `refund-ledger-reversal.ts` builds an ordered step list via `buildLedgerReversalSteps()` and runs each. Failures append to `RefundProcessed.data.reversalIssues[]` rather than aborting — the ledger is best-effort once committed.

## P2. PM id-only persistence

Store **only** Stripe `pm_xxx` strings on the User document. Never expanded PaymentMethod objects. When the UI needs card-brand + last4 for display, fetch on demand via `/api/stripe/payment-methods` (the route expands the PM and returns just the display-safe fields).

## P3. Default-billing-address as a constant, not a config

[src/lib/payment/defaultBillingAddress.ts](../../src/lib/payment/defaultBillingAddress.ts) exports the default address shape used in `<PaymentElement>`. Treat it as a constant — don't infer from user country or geo.

## P4. PI id parsing in one place

[src/lib/payment/payment-intent-id.ts](../../src/lib/payment/payment-intent-id.ts) is the only place that knows how to read/validate a Stripe PI id. Other code imports from here.

## P5. 3DS via the hook, never inline

`use3DSRedirectHandler` encapsulates the entire post-3DS flow (URL parsing, server verification, state reconciliation). Don't reimplement in components. Don't trust URL params for success — always poll server-side.

## P6. Failed-invoice selection helper, not `latest_invoice`

When retrying a failed renewal, don't use `subscription.latest_invoice` — it can be a newer **draft** under pause-collection. Use `failed-invoice-selection.ts` which lists open invoices and picks the right chargeable one. See [billing-stripe gotchas](../billing-stripe/gotchas.md).

## P7. `payment_method` always passed explicitly

When calling `stripe.invoices.pay()`, always pass `payment_method` explicitly:
```ts
stripe.invoices.pay(invoiceId, { payment_method: paymentMethodId }, { idempotencyKey: ... });
```
Without this, certain flows fail to actually attempt the charge. See [billing-stripe F3](../billing-stripe/rules.md#f3-pass-payment_method-explicitly-to-invoicespay).

## P8. Subscription state writes go through `subscription-state-manager.ts`

Don't reach into `User.subscription` from random code. The manager centralizes the writes (status, autoRenew, endDate, isActive) so all paths produce the same shape and order of updates.

## P9. Stripe-error classification at the helper boundary

Helpers wrap Stripe SDK calls and return classified results. Subscription error mapping lives in `subscription-error-handler.ts`. Apply the same shape for new payment helpers — don't let raw Stripe errors propagate to route handlers.

Confirm-time card declines are the exception that *does* reach the route `catch` (with `confirm: true`, `stripe.paymentIntents.create` / `invoices.pay` THROW instead of returning a failed intent). Route catch blocks use `isStripeCardError()` from `payment-error-detection.ts` to return the 400 `{ error: "Payment failed", code, decline_code }` shape — never a generic 500 — so the client can render decline guidance via `getCardDeclineGuidance()`. See [gotchas.md](./gotchas.md#confirm-time-card-declines-throw--routes-must-return-the-400-payment-failed-shape-fixed-2026-07).

## P10. Net-queries via `payment-event-net-queries.ts`

When computing aggregates like "net entries granted to this user," use the helpers in `payment-event-net-queries.ts` rather than ad-hoc `PaymentEvent.aggregate()` calls. Keeps the refund-vs-grant logic in one place.

## Cursor agent boundary

`.cursor/agents/stripe-billing.md` covers payment as well as billing-stripe and subscription. The orchestrator rule mandates QA review for any payment-touching change.
