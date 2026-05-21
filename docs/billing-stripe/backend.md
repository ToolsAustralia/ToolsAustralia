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
| ` — Membership Upsell` | Membership upsell |
| ` — Upsell` | One-time / Additional upsell |
| ` — Mini Draw` | Mini-scoped Additional pack purchase |
| ` — Mini Draw Upsell` | Mini-scoped Additional pack upsell |

Finance and analytics can use these suffixes to partition upsell revenue from base-pack revenue in Stripe exports without touching product IDs.

## Subscription lifecycle descriptions

The membership flows set a Stripe `description` so renewals and tier changes are self-describing in the transactions tab without inspecting metadata. These are per-site inline templates (no shared helper — five sites; four set the **subscription** `description`, the automatic-renewal path sets the **Charge** + PaymentIntent `description` from a webhook):

| Flow | Where | Description template | Example |
|---|---|---|---|
| Initial join | [create-subscription/route.ts](../../src/app/api/stripe/create-subscription/route.ts) (subscription `description`) | `${package.name}` | `Tradie` |
| Manual re-subscribe | [renew-subscription/route.ts](../../src/app/api/stripe/renew-subscription/route.ts) (subscription `description`) | `${targetPackage.name} Renewal` | `Boss Renewal` |
| **Automatic recurring renewal** | [stripe-webhook-handlers/index.ts](../../src/services/stripe-webhook-handlers/index.ts) — `handleInvoicePaymentSucceeded`, `billing_reason === "subscription_cycle"`, updates **both** the PaymentIntent and the **Charge** `description` | `${subscription.metadata.packageName} Renewal` | `Tradie Renewal` |
| Upgrade | [upgrade-subscription-payment/route.ts](../../src/app/api/stripe/upgrade-subscription-payment/route.ts) (subscription `description`) | `${currentPackage.name} to ${newPackage.name} Upgrade` | `Tradie to Foreman Upgrade` |
| Downgrade | [downgrade-subscription/route.ts](../../src/app/api/stripe/downgrade-subscription/route.ts) (subscription `description`) | `${currentPackage.name} to ${newPackage.name} Downgrade` | `Boss to Foreman Downgrade` |

**Two distinct renewal paths.** `renew-subscription/route.ts` is a *user-triggered* re-subscribe after lapse/cancel (auth-gated, calls `subscriptions.create`). True monthly recurring renewals never hit that route — Stripe's billing engine auto-charges the existing subscription and fires `invoice.payment_succeeded` with `billing_reason: "subscription_cycle"`. `handleInvoicePaymentSucceeded` then relabels that cycle's charge.

**Why the transactions list, not the PaymentIntent, is the target.** The Stripe Payments / transactions list renders the **Charge** `description`. An auto-cycle Charge inherits `subscription.description` (e.g. `"Tradie"`, set once at join by create-subscription and never changed) at creation, and the webhook fires *after* the Charge has settled — so updating only the PaymentIntent leaves the row showing the stale join label. The handler updates **both** the PaymentIntent and, decisively, the **Charge** via `stripe.charges.update`.

**Basil API caveat (critical).** On API version `2025-08-27.basil` (see [src/lib/stripe.ts](../../src/lib/stripe.ts)) invoices no longer expose top-level `invoice.payment_intent` / `invoice.charge` — the PI/Charge live under `invoice.payments.data[].payment`. The renewal-relabel block therefore: (1) retrieves the invoice with `payments.data.payment` expanded, (2) resolves the PI id via the shared `paymentIntentIdsOnInvoice` helper (Basil-aware, also handles legacy keys), (3) retrieves that PI with `latest_charge` expanded to get the settled Charge id, (4) updates both. A prior implementation gated on `invoice.payment_intent` was silently **dead code** on Basil — any change here must resolve via `payments[]`, never the removed top-level keys.

`packageName` comes from `subscription.metadata.packageName` (written as the tier `name` by every create-subscription path — verified), falling back to `"Subscription"` only if a subscription lacks that metadata. Known minor edge: for a renewal that failed then succeeded, the helper's first PI may be an earlier attempt; the common single-payment cycle is correct. Relabeling applies only to cycles processed *after* this code is live — already-settled rows are not retroactively changed.

Tier names (`Tradie` / `Foreman` / `Boss`) come from `name` in [src/data/membershipPackages.ts](../../src/data/membershipPackages.ts). These are subscription-level / PaymentIntent / Charge `description` values, **not** a `statement_descriptor` (bank statement) and **not** the recurring invoice line item — the invoice line text still derives from the Stripe Product configured in the dashboard. **The Stripe Payments / transactions list renders the *Charge* `description`, not the PaymentIntent's.** An auto-cycle charge inherits `subscription.description` (e.g. `"Tradie"`, set once at join) at creation, and the webhook runs after the charge settles — so the webhook must call `stripe.charges.update` directly (it does); updating only the PaymentIntent would leave the transactions row showing the stale join label.

## Idempotency

All Stripe-mutating calls in this domain use **stable idempotency keys** (per route, per resource). Examples:
- Charge past-due: `admin-charge-${invoiceId}` (NEVER `Date.now()`)
- Subscription create: derived from `User._id` + package + intent

See [rules.md](./rules.md#idempotency) for the full rule.
