# Subscription — Rules

Hard invariants. Violating these causes real-world money/access bugs. Most have dedicated tsx tests under `src/services/subscription/__tests__/` or `src/utils/payment/__tests__/`.

## Cancellation

### R1. Cancellation date = full period end, never sooner

When the user cancels at period end, their `subscription.endDate` is set to **Stripe's authoritative `current_period_end`** (resolved via `getSubscriptionPeriodEnd(sub)` at [src/utils/payment/stripe/subscription-period.ts](../../src/utils/payment/stripe/subscription-period.ts)).

We **never** charge after the user has cancelled. Stripe does not charge at period end when `cancel_at_period_end: true`.

Same helper is used by the cancel API, the subscription webhook, and the anchor-billing migration script — so all three paths agree on what "period end" means.

### R2. Past-due subscriptions always cancel immediately

Regardless of the `cancelAtPeriodEnd` option, when `status === "past_due"` (Stripe or Mongo), `cancelSubscription()` calls `subscriptions.cancel(id)` immediately. There is no period to preserve.

Reference: [CancelSubscriptionService.ts:88-104](../../src/services/subscription/CancelSubscriptionService.ts#L88-L104).

### R3. `lastMonthAccumulatedEntries` is preserved across cancel

Even when cancelling immediately, the user document's `subscription.lastMonthAccumulatedEntries` field is **not** cleared — it must persist so that if the user resubscribes, the entry-accumulation continuity is maintained. See [SUBSCRIPTION_RESUBSCRIBE_ENTRIES](./gotchas.md#resubscribe-entries-continuity) (migrated content).

### R3a. Upgrade entries stack `lastMonthAccumulated` unless a membership grant already landed this draw

`calculateUpgradeEntries` runs in **Mode A** by default — `entriesToGrant = lastMonthAccumulated + (newBase × promo)`, `newAccum = entriesToGrant` — so a mid-cycle upgrade is never penalised relative to letting the cheaper tier renew. **Mode B** (legacy `newBase × promo` formula, with `newAccum = lastMonthAccumulated + grant`) is only used when `hasMembershipGrantInCurrentDrawPeriod === true` — i.e. when a renewal or initial already credited the active major draw — to avoid double-counting that draw period.

The webhook is the source of truth: `handleInvoicePaymentSucceeded` calls `hasMembershipGrantInCurrentDrawPeriod(user._id)` ([src/utils/draws/has-membership-grant-this-draw.ts](../../src/utils/draws/has-membership-grant-this-draw.ts)) before invoking the calculator on the `isUpgrade` branch. The helper fails open (returns `false` → Mode A) on any error — the design accepts a rare over-credit on the same-period edge case over reverting the headline fix.

**Modal preview parity (Phase 2, 2026-05-20).** The four `calculateUpgradeEntries` call sites in the upgrade modal — the `UpgradeList` row map ([src/components/modals/SubscriptionManagementModal/UpgradeList.tsx](../../src/components/modals/SubscriptionManagementModal/UpgradeList.tsx)) and the three `index.tsx` call sites (the `upgradeModalData` memo, the pending-change banner's upgrade branch, and `totalEntriesAfterUpgrade`) — now read `user.hasCurrentDrawMembershipGrant` (served by `GET /api/users/[id]/my-account` — see [dashboard-account/api.md](../dashboard-account/api.md#get-apiusersidmy-account)) and pass it as the 4th argument so the displayed preview matches the webhook's eventual grant (Mode A vs Mode B). **Stale-payload caveat:** if a renewal lands between page load and the user clicking "Upgrade," the preview can drift by one mode. The webhook remains the source of truth; refreshing the dashboard re-fetches the flag and corrects the preview.

Full math, worked examples, and the invariant are in [backend.md](./backend.md#entry-calculation-dispatcher--calculatesubscriptionentries). Tests: `npm run test:subscription-entries-calculator`.

### R4. Cancellation analytics events come from the webhook only

The "Subscription Cancelled" Klaviyo / Meta event is emitted **exclusively** from the `customer.subscription.deleted` webhook handler. The cancel API path writes the `MembershipStatusHistory` row but **does not** fire any external tracking event — this prevents duplicate events when both API + webhook fire on the same cancel.

## Stripe reference integrity

### R5. Only manageable statuses become canonical

`User.stripeSubscriptionId` must point at a Stripe subscription whose status is in `MANAGEABLE_STRIPE_SUBSCRIPTION_STATUSES` (`active`, `trialing`, `past_due`, `unpaid`, `paused`).

Use `shouldWriteCanonicalStripeSubscriptionId(status)` before any write to that field. Pending/incomplete checkouts go to `subscription.pendingStripeSubscriptionId` instead.

### R6. Auto-repair when canonical points at dead

When the cancel API encounters a stored `stripeSubscriptionId` that is `incomplete` / `incomplete_expired` / `canceled`, it searches the customer for any manageable subscription and adopts the newest one. See `resolveCancellableStripeSubscription()` in [SubscriptionReferenceService.ts](../../src/services/subscription/SubscriptionReferenceService.ts).

### R7. Pre-create dedupe guard

Before creating a new subscription for a customer, **check** `stripeCustomerHasManageableSubscription(customerId)`. If true, do not create — the customer already has a real sub, possibly past-due. Creating another duplicates billing.

## Pause / resume collection

### R8. After failed renewal, set `pause_collection: keep_as_draft`

Failed `subscription_cycle` invoices set `pause_collection` so that newer cycle invoices stay draft until collection resumes — preventing stacked charges and duplicate renewal benefits.

### R9. After successful renewal payment, **clear `pause_collection` before applying benefits**

The `resumeAfterSuccessfulRenewalPayment()` call must run **before** `processPaymentBenefits()` in the webhook. If the benefits path is slow, errors, or the Stripe CLI / proxy times out before the response, an unresumed pause would survive and break the next billing cycle.

The clear-condition lives in `shouldClearPauseCollectionAfterPaidInvoice()` — clear when:
- Previous Mongo status was `past_due` or `unpaid`, **or**
- `billing_reason` is `subscription_cycle` | `subscription_threshold` | `subscription_update`.

### R10. Resume is idempotent

`resumeAfterSuccessfulRenewalPayment()` is safe to call when the subscription is not paused — it sets `pause_collection: ""` (Stripe's manual-unpause API), which is a no-op when nothing is paused.

## Billing anchor — 24th of the month

### R11. New 25th/26th/27th joiners anchor to the 24th

**This rule applies to new joiners only.** Users joining on those three calendar days (AEST / `Australia/Sydney`) are anchored to renew on the **24th** of each subsequent month. This guarantees ≥ 3 days to recover from a failed renewal before the major-draw window (28th–27th).

Implementation:
- **`trial_end`** = next 24th at midnight AEST
- **`proration_behavior: "none"`** so renewal anchors to the 24th
- **`add_invoice_items`** with the full package price so the user pays immediately at signup (not prorated)
- First invoice = full price charged at signup; subscription status is `trialing` until the 24th, then `active` with renewals on the 24th

The helper that builds these create-params: `getSubscriptionCreateParamsForAnchor(joinDate)` — used by `create-subscription`, `create-subscription-existing-user`, and `renew-subscription` routes (in the [billing-stripe](../billing-stripe/) domain).

### R12. Anchor migration skips `cancel_at_period_end`

The migration script `scripts/migrate-anchor-billing-24.ts` **never** migrates subscriptions where `cancel_at_period_end === true` — those users have already chosen to end on their current period. Touching `trial_end` or `proration_behavior` could re-charge or extend access. The script logs `skip_cancel_at_period_end` and moves on.

### R16. Recovered past_due/unpaid renewals reanchor to the recovery-payment date

When a `past_due` or `unpaid` subscription recovers (any of the five channels — Stripe auto-retry, admin charge, user retry, Pay-Now, force-charge), future renewals are **reanchored to the recovery-payment date** (AEST), clamping days **25/26/27 → 24** (same draw-buffer window as R11). This prevents the recovered member from being billed again ~2 weeks later on their original stale anchor.

- Mechanism: `stripe.subscriptions.update(id, { trial_end, proration_behavior: 'none' })` via `reanchorAfterPastDueRecovery` in `SubscriptionCollectionPauseService`.
- Idempotency: `User.subscription.lastReanchoredInvoiceId` atomic claim; the `attempt_count > 1` arm of the trigger gate covers the `renew-subscription` retry channel (which pre-flips DB status to `active` before the webhook).
- Fully non-fatal — recovery has already succeeded before the reanchor runs.

See [docs/PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md) for the full rule.

### R13. Cancellation date for anchored subs = 24th

If an anchored user cancels (`cancel_at_period_end: true`), their access ends on **the 24th** (full period). Stripe does not charge again at period end. Cancellation date == period end == 24th.

## Date / timezone

### R14. All subscription dates use `date-fns-tz` Australia/Sydney

Anchor day, renewal date, period end, cancellation date — all are computed in `Australia/Sydney`, never in `Date`'s local zone or UTC. Use `date-fns-tz` (already a dependency).

DST regression tests: see [scripts/test-dst-transitions.ts](../../scripts/test-dst-transitions.ts) and the migrated [TESTING-TIMEZONE-DST](./testing.md#dst-tests) (root-level doc, to be merged here).

## Console / logging

### R15. Use `console.error` only for genuine errors

Per CLAUDE.md, production builds strip `console.{log,info,debug,warn}`. Subscription code that needs durable error trails should use `console.error` or route through `ErrorReport` (see [error-reporting](../error-reporting/)).

## Forbidden

### F1. Don't expand `latest_payment_intent` on Invoices

On Stripe API `2025-05-28.basil` (current), retrieving an Invoice with `expand: ['latest_payment_intent']` returns:

> `This property cannot be expanded (latest_payment_intent)`

Use `expand: ['payment_intent']` instead. The invoice JSON may still include `latest_payment_intent` as an id; retrieve the PaymentIntent separately.

### F2. Don't store card data anywhere except Stripe

Saved payment methods on the User document store **only** Stripe `paymentMethodId` strings. The schema enforces this — see [src/models/User.ts:21-26](../../src/models/User.ts#L21-L26). PCI compliance.

### F3. Don't compute `isActive` client-side

Components must read `subscription.isActive` from the user object (server-derived). Don't infer it from `endDate > now()`. The `isActive` flag is set by the cancel/webhook paths and accounts for past-due, scheduled-cancel, and grace-period nuances that a client-side check would miss.
