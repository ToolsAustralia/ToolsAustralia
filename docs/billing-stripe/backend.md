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

**`chargedAt` threading for Meta event_time (2026-07-08).** `dispatchStripeEvent`'s `payment_intent.succeeded` case passes `event.created` into `handlePaymentSuccess(paymentIntent, eventCreatedUnixSeconds)`, which threads it to `handleOneTimeWebhook` / `handleUpsellWebhook` / `handleMiniDrawWebhook`. Each sets `paymentMetadata.chargedAt = (eventCreatedUnixSeconds ?? paymentIntent.created) * 1000` (ms) — the payment **success** moment, deliberately distinct from `created` (`paymentIntent.created * 1000` = PI *creation* time, which can precede payment on deferred confirms and also feeds campaign-window matching, so its semantics are unchanged). The membership `invoice.payment_succeeded` path sets `chargedAt` from the same `paid_at`-derived `paymentTimestamp` it already used for `created`. Sole consumer is the Facebook CAPI Purchase `event_time` in [payment-processing.ts](../../src/utils/payment/payment-processing.ts) (`chargedAt ?? created`, normalized + window-clamped) — see [payment/backend.md](../payment/backend.md) and [tracking/gotchas.md](../tracking/gotchas.md) → "Meta books Purchase at event_time". `event.created` is queue-lag-immune: the webhook queue stores the raw event, so delayed reprocessing still carries the original success time.

## Membership Streak writers (in the webhook — added 2026-07-07, P1)

`handleInvoicePaymentSucceeded` carries the two webhook writers of `User.subscription.streakMonths`/`streakGeneration` (the other live writers: the resubscribe/renew routes' `carryStreakAcrossSubscriptionReplace` spread, the refund decrement in `reverseMembershipLedger`, and the backfill script):

1. **Renewal increment** — beside the `upsertRenewalCycleFromPaidInvoice` call (strictly `billing_reason === "subscription_cycle"`). The upsert now returns `{ firstTimeSucceeded }` from the `MembershipRenewalCycle` **pre-image** (`new: false`): absent/`expected`/`failed` → this payment transitioned the cycle into paid → `$inc streakMonths` + mirror onto the in-memory doc. A queue redelivery sees `succeeded` → no-op. Past-due recovery pays the *same* cycle invoice → increments naturally, late. Decision helper: `isFirstTimePaidCycle` in [src/utils/subscription/streak.ts](../../src/utils/subscription/streak.ts).
2. **Start/reset** — after the `isUpgrade` detection in the `subscription_create` grant path. `decideStreakOnSubscriptionCreate` returns start (fresh join / out-of-grace resubscribe → `streakMonths: 0`, generation bump only when a prior streak existed), continue (grace-window resubscribe — no write), or none (upgrades, non-create invoices). Guarded by `subscription.lastStreakStartInvoiceId $ne invoiceId`.

The `$0`-trial guard returns before both writers for its invoices; upgrades never match either gate (Mode A = `subscription_update`, Mode B = excluded by `isUpgrade`). Drift repair: `npm run backfill:membership-streaks`. Tests: `npm run test:streak`. Invariants: [subscription/gotchas.md](../subscription/gotchas.md#membership-streak-counter--three-invariants-2026-07-07-p1).

**Route-side carry (2026-07-15):** `create-subscription-existing-user` and `renew-subscription` (both branches) replace the whole `user.subscription` subdoc and persist BEFORE this webhook runs — each now spreads `carryStreakAcrossSubscriptionReplace(prev)` into the replacement (in-route grace/reset decision from the OLD `endDate`; the webhook then sees the NEW endDate, computes "continue", and preserves what the route wrote). Previously both wiped banked streaks (review BLOCKER). Never add a subdoc-replacing route without this carry.

## `campaignCode` is initial-invoice only (2026-08-25)

In [stripe-webhook-handlers/index.ts](../../src/services/stripe-webhook-handlers/index.ts), the subscription-metadata
read of `campaignCode` is gated on `isInitialSubscriptionInvoice` (`billing_reason === "subscription_create"`) —
the same gate the adjacent A/B `experimentId`/`variantId` fields already carry, for the same reason.

`campaignCode` is written to **subscription** metadata at creation
([create-subscription](../../src/app/api/stripe/create-subscription/route.ts),
[create-subscription-existing-user](../../src/app/api/stripe/create-subscription-existing-user/route.ts) — both
`SubscriptionCreateParams`), so it persists for the life of the subscription. That was harmless while a grant was
one-shot (the issuance row is already redeemed), but once a per-customer code can be **re-armed**, a renewal invoice
months later would silently auto-redeem a freshly re-armed grant that the customer never applied. The
METHOD 2 (the invoice's own payment intent) carries the same gate as belt-and-braces. Tracing every
write site shows a renewal's payment intent is Stripe-generated and should hold no `campaignCode` of
ours — but Stripe's metadata-copying semantics are not something this repo can prove, and the cost of
being wrong is a silently auto-redeemed re-armed grant. The gate is free on the initial invoice.
**All four METHODs now carry the gate.** METHODs 3–4 (the charge's payment intent, and the invoice's
own metadata) were initially left ungated on the argument that they are `promoLinkCode`-led fallbacks
reading Stripe-generated objects. That is the same assumption METHOD 2's own rationale deliberately
refuses to rely on, and METHOD 4 sits **outside** the `!promoLinkCode` guard, so it ran on every
invoice including every renewal. Reachability is nil today — nothing writes `campaignCode` into
invoice metadata, only into subscription and payment-intent metadata — but "nothing writes it today"
is exactly the premise that stops being true first. All four are `isInitialSubscriptionInvoice &&`.

## `campaignCode` is re-validated server-side before it reaches metadata (2026-08-25)

All four routes that write `campaignCode` into Stripe metadata — `create-subscription`,
`create-subscription-existing-user`, `create-one-time-purchase` (two metadata sites) and
`create-one-time-purchase-existing-user` — now write a **verified** code:

```ts
const verifiedCampaignCode = await CampaignCodeValidationService.resolveCodeForCheckout({
  code: validatedData.campaignCode,
  userId: /* the id THIS route resolved: session, or an email lookup */,
  context: "create-subscription",
});
// …
...(verifiedCampaignCode && { campaignCode: verifiedCampaignCode }),
```

The body field is never written directly. `/api/codes/validate` answers a guest from the campaign
window alone, and a customer applying a code right after registering **is** a guest here, so
without this they would see APPLIED, pay, and receive nothing. Refusal drops the code and logs at
`console.error`; it never fails the purchase. Full rationale and the three load-bearing properties:
[rewards-redeemables rules.md R3c](../rewards-redeemables/rules.md).

In `create-one-time-purchase` the call is deliberately **hoisted above** the
`if (validatedData.paymentIntentId)` branch, because that route has two metadata sites (reuse-PI
and create-PI) in opposite branches and both must see the same verified value.

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
| **Automatic recurring renewal** (primary) | [stripe-webhook-handlers/index.ts](../../src/services/stripe-webhook-handlers/index.ts) — `handleInvoiceCreated`, `billing_reason === "subscription_cycle"`, stamps the **DRAFT invoice** `description` *before* finalize so the spawned PI + Charge inherit it | `${subscription.metadata.packageName} Renewal` | `Tradie Renewal` |
| **Automatic recurring renewal** (succeeded-path fallback) | same file — `handleInvoicePaymentSucceeded`, `billing_reason === "subscription_cycle"`, updates **both** the PaymentIntent and the **Charge** `description` after settlement | `${subscription.metadata.packageName} Renewal` | `Tradie Renewal` |
| Upgrade | [upgrade-subscription-payment/route.ts](../../src/app/api/stripe/upgrade-subscription-payment/route.ts) (subscription `description`) | `${currentPackage.name} to ${newPackage.name} Upgrade` | `Tradie to Foreman Upgrade` |
| Downgrade | [downgrade-subscription/route.ts](../../src/app/api/stripe/downgrade-subscription/route.ts) (subscription `description`) | `${currentPackage.name} to ${newPackage.name} Downgrade` | `Boss to Foreman Downgrade` |

**Two distinct renewal paths.** `renew-subscription/route.ts` is a *user-triggered* re-subscribe after lapse/cancel (auth-gated, calls `subscriptions.create`). True monthly recurring renewals never hit that route — Stripe's billing engine auto-charges the existing subscription and fires `invoice.payment_succeeded` with `billing_reason: "subscription_cycle"`. `handleInvoicePaymentSucceeded` then relabels that cycle's charge.

**Why two handlers stamp the renewal label (draft-stamp + succeeded-path fallback).** The succeeded-path relabel only runs on *successful* renewals, so a **failed** renewal's Charge kept the bare join-time `subscription.description` (e.g. `"Tradie"`) in the Stripe payments list. `handleInvoiceCreated` closes that gap: on `invoice.created` for `billing_reason === "subscription_cycle"` it stamps the **draft** invoice `description` (`stripe.invoices.update`) *before* Stripe finalizes and attempts payment, so the auto-spawned PaymentIntent + Charge inherit `"<Package> Renewal"` regardless of whether the charge later succeeds or fails. `packageName` is read from `subscription.metadata.packageName` (resolved via `resolveInvoiceSubscriptionId`, fallback `"Subscription"`). It is **strictly gated to `subscription_cycle`** so it never touches the join charge (`subscription_create`), upgrade/downgrade (`subscription_update`), or the $0 trial-update invoice. It is **non-blocking** (errors are logged via `webhookLog`, never thrown — the description is cosmetic) and **idempotent** (only writes when the existing description differs). The `handleInvoicePaymentSucceeded` PI+Charge relabel is **retained as a belt-and-suspenders fallback** for the succeeded case. **Caveat:** `handleInvoiceCreated` only fires once the Stripe webhook endpoint is subscribed to the `invoice.created` event — it is dormant until then (see [architecture.md](./architecture.md#webhook-flow)).

**Why the transactions list, not the PaymentIntent, is the target.** The Stripe Payments / transactions list renders the **Charge** `description`. An auto-cycle Charge inherits `subscription.description` (e.g. `"Tradie"`, set once at join by create-subscription and never changed) at creation, and the webhook fires *after* the Charge has settled — so updating only the PaymentIntent leaves the row showing the stale join label. The handler updates **both** the PaymentIntent and, decisively, the **Charge** via `stripe.charges.update`.

**Basil API caveat (critical).** On API version `2025-08-27.basil` (see [src/lib/stripe.ts](../../src/lib/stripe.ts)) invoices no longer expose top-level `invoice.payment_intent` / `invoice.charge` — the PI/Charge live under `invoice.payments.data[].payment`. The renewal-relabel block therefore: (1) retrieves the invoice with `payments.data.payment` expanded, (2) resolves the PI id via the shared `paymentIntentIdsOnInvoice` helper (Basil-aware, also handles legacy keys), (3) retrieves that PI with `latest_charge` expanded to get the settled Charge id, (4) updates both. A prior implementation gated on `invoice.payment_intent` was silently **dead code** on Basil — any change here must resolve via `payments[]`, never the removed top-level keys.

`packageName` comes from `subscription.metadata.packageName` (written as the tier `name` by every create-subscription path — verified), falling back to `"Subscription"` only if a subscription lacks that metadata. Known minor edge: for a renewal that failed then succeeded, the helper's first PI may be an earlier attempt; the common single-payment cycle is correct. Relabeling applies only to cycles processed *after* this code is live — already-settled rows are not retroactively changed.

Tier names (`Tradie` / `Foreman` / `Boss`) come from `name` in [src/data/membershipPackages.ts](../../src/data/membershipPackages.ts). These are subscription-level / PaymentIntent / Charge `description` values, **not** a `statement_descriptor` (bank statement) and **not** the recurring invoice line item — the invoice line text still derives from the Stripe Product configured in the dashboard. **The Stripe Payments / transactions list renders the *Charge* `description`, not the PaymentIntent's.** An auto-cycle charge inherits `subscription.description` (e.g. `"Tradie"`, set once at join) at creation, and the webhook runs after the charge settles — so the webhook must call `stripe.charges.update` directly (it does); updating only the PaymentIntent would leave the transactions row showing the stale join label.

## Idempotency

All Stripe-mutating calls in this domain use **stable idempotency keys** (per route, per resource). Examples:
- Charge past-due: `admin-charge-${invoiceId}` (NEVER `Date.now()`)
- Subscription create: derived from `User._id` + package + intent

See [rules.md](./rules.md#idempotency) for the full rule.

## Resolved attribution metadata on Stripe objects

Every create-* route in this domain (create-subscription, create-subscription-existing-user, create-one-time-purchase, create-one-time-purchase-existing-user, create-payment-intent) now stamps resolved attribution onto the Stripe metadata object at request time via `resolveAttributionAtEdge(request)` from [src/services/attribution/resolveAtEdge.ts](../../src/services/attribution/resolveAtEdge.ts). **`renew-subscription`'s `create_new` branch also stamps it (added 2026-07):** that branch mints a brand-new subscription (`billing_reason: subscription_create`, counted as a *conversion*, not a renewal), so previously it carried no `attr_platform` and the webhook stamped these win-back conversions `direct`. It now spreads `...resolvedAttr` into `baseMetadata` like the other subscription routes. (The `reactivate` / `retry_payment` branches still inherit the original subscription's sticky decision.)

The resolved metadata (`attr_platform`, `attr_confidence`, and related keys from `buildResolvedAttributionMetadata`) is spread alongside the existing `buildAttributionMetadata(attribution)` call in each route's metadata object. For subscription routes this is the subscription `baseMetadata`; for one-time/payment-intent routes it is the PaymentIntent `metadata`. The function never throws — errors produce a `direct/utm_only` fallback so payment flow is unaffected.

### Reading it back in the webhook → ledger

[stripe-webhook-handlers/index.ts](../../src/services/stripe-webhook-handlers/index.ts) reads the stamped decision back via `extractResolvedPlatformFromMetadata` ([src/utils/tracking/resolved-attribution-metadata.ts](../../src/utils/tracking/resolved-attribution-metadata.ts)) at each of the four `processPaymentBenefits` call sites, immediately after the existing `sessionAttribution` line, and forwards it as the trailing `resolvedAttribution` arg:

- **One-time / upsell / mini-draw** — read from `paymentIntent.metadata`.
- **Subscription / renewal** (`handleInvoicePaymentSucceeded`) — read from `subscription?.metadata ?? expandedInvoice.metadata`, matching the `sessionAttribution` source order. Because the decision lives on the subscription, every recurring renewal inherits the same converting platform (sticky).

The ledger writer (`processPaymentBenefits`, in the [payment](../payment/backend.md) domain) then persists `convertingPlatform` / `attributionConfidence` / `isRenewal` onto the `BenefitsGranted` row, falling back to a UTM-based resolve only when no edge decision was stamped.

**`attr_packages_focus` (added 2026-07-17):** the webhook's `extractAttributionFromMetadata` also reads back the landing-URL packages-focus marker stamped by `buildAttributionMetadata` (`attr_packages_focus`, only ever `"one-time"`, validated `=== "one-time"` on read) and forwards it inside `sessionAttribution.packages_focus`. See [docs/tracking/backend.md](../tracking/backend.md) for the full capture pipeline; the ledger write is documented in [docs/payment/backend.md](../payment/backend.md).

## Shop payments no longer resolve a promo multiplier (2026-08-20)

The `paymentType === "shop"` branch of the Stripe webhook used to call
`getActivePromoMultiplier("one-time")` and pass the result into `finalizeShopOrder`, because
merchandise inherited the one-time pack rate.

Merchandise now carries its own multiplier, resolved inside the shop service from
`ShopEntryMultiplierConfig` — see [cart-shop-products/backend.md](../cart-shop-products/backend.md).
The webhook resolves nothing for shop payments and `finalizeShopOrder` no longer accepts a rate.

The parameter was **removed rather than left unused**. A dead argument named "promo multiplier"
sitting on the shop path is exactly how the inheritance gets quietly reinstated by someone
wiring it back up because it looked like it belonged there.

The other branches are unaffected: membership, one-time and mini-draw payments still resolve
their promo multipliers through the same helper as before.
