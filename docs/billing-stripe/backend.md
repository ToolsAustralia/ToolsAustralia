# Billing-Stripe — Backend

## SDK clients

| File | Purpose |
|---|---|
| [src/lib/stripe.ts](../../src/lib/stripe.ts) | Server-side Stripe SDK instance. Uses `STRIPE_SECRET_KEY`. Single source for `stripe.subscriptions.*`, `stripe.invoices.*`, `stripe.paymentIntents.*` etc. |
| [src/lib/stripe-client.ts](../../src/lib/stripe-client.ts) | Browser-side `loadStripe()` wrapper. Uses `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Consumed by `<Elements>` providers in the [payment](../payment/) domain. |

`mongoose` is `serverExternalPackages` per `next.config.ts` — don't try to import the Stripe server SDK into client components either; the publishable-key client is the only browser-safe path.

## Webhook handler

[src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts) — single ingestion route for all Stripe events.

Responsibilities:
1. Verify Stripe signature (raw body required — `export const runtime = 'nodejs'`).
2. Dedupe by `event.id` against `ProcessedStripeEvent`.
3. Switch on `event.type` and dispatch to the appropriate handler.
4. Persist a `ProcessedStripeEvent` row before returning 200.

CSP note: this route gets a special header set in [src/middleware.ts](../../src/middleware.ts) (no COEP) so server-to-server POSTs from Stripe work. See [security-csp](../security-csp/).

## Anchor-billing helper

[src/utils/billing/anchor-billing.ts](../../src/utils/billing/anchor-billing.ts) — `getSubscriptionCreateParamsForAnchor(joinDate)` returns the Stripe `subscriptions.create()` params for users joining 25th/26th/27th to anchor renewal to the 24th.

Returns:
- `trial_end: <next 24th at midnight AEST>`
- `proration_behavior: "none"`
- `add_invoice_items: [{ price: <packagePriceId>, quantity: 1 }]` so the user pays full price immediately

See [subscription/rules.md](../subscription/rules.md#r11-new-25th26th27th-joiners-anchor-to-the-24th) for the full rule.

## Charge past-due (admin tool)

[src/server/admin/chargePastDueShared.ts](../../src/server/admin/chargePastDueShared.ts) (cross-references the [admin](../admin/) domain) — the operational tool to bulk-retry past-due invoices.

Full reference: see [gotchas.md](./gotchas.md#charge-past-due-runbook) (migrated from `docs/CHARGE_PAST_DUE_CUSTOMERS.md`).

Audit trail: every attempt → `InvoiceChargeLog` row. See [models.md](./models.md#invoicechargelog).

## Refund reversal

Code in [src/utils/payment/](../../src/utils/payment/) (cross-references [payment](../payment/) domain):
- `payment-processing.ts` — `grantBenefits`, `processPaymentBenefits`, the ledger writer
- `refund-processing.ts` — `processRefundReversal`, the entry point
- `refund-ledger-reversal.ts` — `reverseLedgerBenefits`, the orchestrator
- `reversers/` — per-grant-type reverser modules

Webhook entry points: `charge.refunded`, `charge.dispute.closed` (lost), `charge.dispute.funds_withdrawn`.

Admin entry: `POST /api/admin/users/[id]/payment-events/[eventId]/reverse` calls `replayRefundReversalForBenefitsGrantedEvent`.

## Route handlers (~25 routes)

Listed in [api.md](./api.md). Each handler must:
1. Validate input via Zod (helpers in `src/lib/zod/`).
2. Authenticate via session (NextAuth) — admin routes need explicit `role === "admin"` check; middleware does not gate `/api/**`.
3. Delegate to a helper or service. **No Stripe API calls in `route.ts`** beyond the simplest paths — wrap in a service or `utils/billing|payment/` helper.

## Upsell Stripe descriptions

Each upsell record in [src/data/upsellPackages.ts](../../src/data/upsellPackages.ts) carries a `stripeDescription` field. This is passed as the `description` field when creating a PaymentIntent for an upsell purchase, so Stripe Dashboard, receipts, and webhook payloads show a distinct label per upsell category.

**No new Stripe Products are created in code for upsells.** Descriptions pass through at payment-intent creation time only; the upsell record has no `stripeProductId`. This is the same pattern as all one-time packs and mini packs (only membership *subscriptions* store Stripe Product IDs in code at [src/data/membershipPackages.ts](../../src/data/membershipPackages.ts)).

Suffix convention (from spec §3.4):

| Suffix | Context |
|---|---|
| *(none — base name only)* | Regular pack purchase |
| ` — Membership Bonus` | Membership upsell |
| ` — Upsell` | One-time / Additional upsell |
| ` — Mini Draw` | Mini-scoped Additional pack purchase |
| ` — Mini Draw Upsell` | Mini-scoped Additional pack upsell |

Finance and analytics can use these suffixes to partition upsell revenue from base-pack revenue in Stripe exports without touching product IDs.

## Idempotency

All Stripe-mutating calls in this domain use **stable idempotency keys** (per route, per resource). Examples:
- Charge past-due: `admin-charge-${invoiceId}` (NEVER `Date.now()`)
- Subscription create: derived from `User._id` + package + intent

See [rules.md](./rules.md#idempotency) for the full rule.
