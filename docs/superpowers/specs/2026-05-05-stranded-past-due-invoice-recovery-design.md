# Stranded Past-Due Invoice Recovery — Design

**Status:** Draft for review
**Date:** 2026-05-05
**Scope:** Phase A only (immediate recovery flow). Phase B (architectural switch to Stripe-native "Mark as unpaid") is tracked separately.

## Problem

Subscriptions that have been past-due long enough for Stripe's smart retries to exhaust end up with their original failed invoice in `uncollectible` (or `void`) state. From that point forward:

- The bulk past-due charger ([POST /api/admin/invoices/charge-past-due](../../../src/app/api/admin/invoices/charge-past-due/route.ts)) silently skips them — its filter requires `status: "open"`.
- The per-user manual retry ([renew-subscription/route.ts:237](../../../src/app/api/stripe/renew-subscription/route.ts#L237)) calls `stripe.invoices.pay()` and Stripe rejects with: *"This invoice can no longer be paid. Consider voiding, marking as uncollectible, or marking as paid out of band instead."*
- The customer remains visible in the admin UI as past-due, but no path can charge them. The "Manual Retries (per-user)" audit log fills with this error.

These users are **stranded**: alive in MongoDB as past-due, alive in Stripe with `pause_collection: keep_as_draft`, but with no chargeable invoice.

## Goal

Add a per-user admin-triggered recovery flow that gives a stranded subscription a fresh, payable invoice and attempts to charge it once — reusing the existing `payOpenInvoiceAsPastDueAdmin` primitive for the actual charge.

This spec **only** addresses the "This invoice can no longer be paid" failure mode. Other failure modes (`incorrect_number`, `card_declined`, `expired_card`, `authentication_required`) are out of scope: those need a card-update flow, not invoice recovery.

## Non-goals

- Bulk recovery. The recovery action is per-user, manually triggered, gated by typed confirmation.
- Automatic detection or scheduled cleanup. An admin always initiates the action.
- Card-update flows for users with permanently dead payment methods.
- Phase B: switching to Stripe-native "Mark as unpaid" dashboard setting (separate plan).
- Customer notifications. Match the existing past-due charge behavior (no notification).

## Approach

**New helper + new endpoint, reuse existing pay primitive.** Recovery is a separate explicit action, not a fallthrough patch on the existing retry endpoint. This keeps responsibility separation clean and makes the irreversible steps (void) explicit in the audit trail.

**Companion fix — single-invoice scoping in the existing chargers.** While reading the codebase for the recovery flow, we found that both `/api/admin/users/[id]/charge-past-due` and `/api/admin/invoices/charge-past-due` iterate every open invoice on a customer. Customers whose `pause_collection` did not fire in time end up with multiple open cycle invoices; charging all of them produces "no longer be paid" errors on the older ones whose PaymentIntents have been canceled by Stripe. The amended plan adds Task 5a, which scopes both chargers to **only the invoice attached to `user.stripeSubscriptionId`** — using the existing `pickOpenInvoiceForFailedRenewal` helper. This fix ships before the recovery flow because it directly reduces the volume of stranded users we'd otherwise need to recover after the fact.

### Recovery sequence

For one user, server-side, in order:

1. **Verify state**
   - Admin auth (NextAuth + role check)
   - Body shape: `{ confirmation: "RECOVER", originalInvoiceId: string }`
   - Load user, confirm `subscription.status === "past_due"`
   - Load `MembershipPackage` from `user.subscription.packageId`, derive expected cycle amount from `price * 100`
   - Fetch original invoice from Stripe, confirm:
     - `customer` matches `user.stripeCustomerId`
     - `subscription` matches `user.stripeSubscriptionId`
     - `status` is `uncollectible` or `void` (if `open`/`paid`, return 409 — admin should use existing flow)
   - Confirm subscription itself is still alive (not `canceled`/`incomplete_expired`)

2. **24h lock check**
   - Query `InvoiceChargeLog` for any row with `result.recovery.originalInvoiceId === <originalInvoiceId>` within the last 24h
   - If found, return 409 with the prior attempt's timestamp

3. **Void original** (idempotent)
   - If original status is already `void`, skip
   - Else `stripe.invoices.voidInvoice(originalInvoiceId)`
   - Log `InvoiceChargeLog` row: `status: "skipped"`, `result: { recovery: { step: "void", originalInvoiceId } }`

4. **Find or create draft** (the safest path)
   - `stripe.invoices.list({ subscription: subId, status: "draft", limit: 10 })`
   - **If a draft exists** with `amount_due === expectedAmount` → use it (this is the held draft Stripe created during the pause)
   - **If no matching draft** → `stripe.invoices.create({ customer, subscription, collection_method: "charge_automatically", auto_advance: false, pending_invoice_items_behavior: "exclude" })` then add a one-time line item at the package amount
   - Log step result

5. **Finalize draft** → becomes `open`
   - `stripe.invoices.finalizeInvoice(draftId)`
   - Re-fetch with `expand: ["payment_intent"]`
   - Battle-tested pattern: production code already does this in [pay-failed-invoice/route.ts:150](../../../src/app/api/stripe/pay-failed-invoice/route.ts#L150) and [invoice-payment-intent.ts:163](../../../src/utils/payment/stripe/invoice-payment-intent.ts#L163)

6. **Pay** via `payOpenInvoiceAsPastDueAdmin`
   - Resolves payment method via existing `resolveInvoicePaymentMethodId`
   - Calls `stripe.invoices.pay()` with idempotency key
   - Writes `InvoiceChargeLog` with `status: "success" | "failed" | "skipped"`
   - On `paid` status, fires `resumeAfterSuccessfulRenewalPayment(subscriptionId)` — clears `pause_collection`

7. **Return** `PastDueChargeResultRow` shape (matches existing past-due charge response)

### Failure semantics

Each step is naturally idempotent on retry. Partial state never leaves the customer worse than before:

| Step fails | State after | Recovery |
|---|---|---|
| Void | No change | Admin retries; void is idempotent |
| Find/Create draft | Original voided, no draft | Admin retries; void step skipped, create proceeds |
| Finalize | Original voided, draft exists | Admin retries; create step finds existing draft, finalize proceeds |
| Pay | Original voided, fresh `open` invoice | Admin uses existing per-user retry on the new invoice |

The 24h lock prevents re-running the *full* sequence within a day, but a separate retry mechanism for the pay step (or an existing per-user retry) is unaffected because that runs against the new invoice ID, not the original.

## Architecture

### New files

- **`src/server/admin/recoverStrandedPastDue.ts`** — pure recovery logic. Exports `recoverStrandedPastDueInvoice({ userId, originalInvoiceId, adminId })` returning `PastDueChargeResultRow`. Reuses `payOpenInvoiceAsPastDueAdmin` for the final charge.
- **`src/app/api/admin/users/[userId]/recover-past-due-invoice/route.ts`** — thin handler. Auth, validate body, delegate to helper, return JSON.
- **`src/components/admin/RecoverInvoiceModal.tsx`** — confirmation modal (type "RECOVER"). Shows: original invoice ID, dead status reason, fresh amount that will be charged, customer email. On submit, POSTs to the endpoint.
- **`src/server/admin/__tests__/recoverStrandedPastDue.test.ts`** — `tsx` test mocking the Stripe client. Verifies sequence, idempotency, and failure handling. Wired as `npm run test:recover-stranded-past-due`.

### Modified files

- **`src/app/admin/component/PastDueChargeHistory.tsx`** — for rows whose `errorMessage` matches `/no longer be paid/i`, render a "Recover" action button alongside the existing retry button. Clicking opens `RecoverInvoiceModal`.
- **`src/app/admin/component/PastDueChargeHistoryDrawer.tsx`** — auto-fallback (Trigger D): when the existing per-user retry returns the "no longer be paid" error, the modal swaps its primary CTA to "Recover this invoice" which opens the same `RecoverInvoiceModal` flow.

### Reused (no changes)

- `src/server/admin/chargePastDueShared.ts` — `payOpenInvoiceAsPastDueAdmin` is the final step
- `src/services/subscription/SubscriptionCollectionPauseService.ts` — `resumeAfterSuccessfulRenewalPayment` fires automatically on successful pay
- `src/models/InvoiceChargeLog.ts` — extended only via the existing `result` field with a `recovery` sub-object

### Domain Manifest

All new and modified files fall under the existing **`admin`** domain (per the manifest's `src/server/admin/**`, `src/app/api/admin/**`, `src/components/admin/**`, `src/app/admin/**` patterns). No manifest changes required.

Doc-sync target: `docs/admin/` — `backend.md`, `api.md`, and `frontend.md` will need updates during implementation.

## Idempotency & safety

- **Confirmation**: must type literal string `RECOVER` in the modal body. Endpoint validates `body.confirmation === "RECOVER"` else returns 400 (matches the existing `CHARGE` pattern in [charge-past-due/route.ts:221](../../../src/app/api/admin/invoices/charge-past-due/route.ts#L221)).
- **24h lock per user/original-invoice pair**: query `InvoiceChargeLog` filtered by `result.recovery.originalInvoiceId` and `attemptedAt: { $gte: cutoffForRecentAttempt() }`. Reuses the existing `RECENT_ATTEMPT_WINDOW_HOURS` constant from `past-due-charge-idempotency.ts`.
- **Stripe idempotency keys**: each Stripe write uses a stable key:
  - Void: `recover-void-${originalInvoiceId}`
  - Create: `recover-create-${originalInvoiceId}`
  - Finalize: `recover-finalize-${newInvoiceId}`
  - Pay: existing `admin-charge-${newInvoiceId}` (from `buildAdminChargeIdempotencyKey`)
- **No mutex/global lock** — the existing global `ChargeJobLock` is for bulk; per-user recovery doesn't need it.
- **Audit trail**: every Stripe write produces one `InvoiceChargeLog` row tagged with `result.recovery.step`. Admin can reconstruct the full attempt timeline from the collection.

## UI behavior

### Trigger A: per-row "Recover" button

- Visible only on `Manual Retries` rows where `errorMessage` matches `/no longer be paid|invoice can no longer be paid/i`
- Renders next to the existing retry action, distinguished by warning color (admin must understand this is a different operation)
- Click → opens `RecoverInvoiceModal` pre-populated with: user email, customer ID, original invoice ID, expected amount

### Trigger D: auto-fallback in retry modal

- When the existing per-user retry submits and the response error indicates "no longer be paid":
  - Modal does NOT close
  - Primary CTA is replaced with "Recover this invoice" (warning-styled)
  - Secondary text explains: "This invoice can't be paid directly. Recovery will void it and create a fresh one."
  - Click → opens `RecoverInvoiceModal` (or transitions inline, TBD during implementation — modal-on-modal vs swap is a UI detail)

### `RecoverInvoiceModal`

States: `idle` → `processing` → `completed` | `error`

Idle screen shows:
- Customer email + name
- Original (dead) invoice ID + amount
- Expected fresh charge amount (one cycle from package price)
- Warning banner: "This will void the existing invoice and attempt one fresh charge. Cannot be undone."
- Confirmation input requiring exact `RECOVER` match
- Confirm button (disabled until input matches)

Completed screen shows:
- Success: amount charged, new invoice ID, "pause cleared" indicator
- Failed: which step failed (void/create/finalize/pay), error code, error message
- Audit log row link if applicable

## Testing strategy

`tsx` regression test at `src/server/admin/__tests__/recoverStrandedPastDue.test.ts`. Mocks the Stripe client (existing test pattern in `SubscriptionCollectionPauseService.test.ts`). Asserts:

1. **Happy path with held draft** — original `uncollectible`, draft exists with matching amount → void called, draft used (not created), finalize called, pay called, returns success.
2. **Happy path no held draft** — original `uncollectible`, no drafts → void, create, finalize, pay, success.
3. **Original already void** — void step skipped (idempotent).
4. **Pay step fails (card decline)** — void/create/finalize succeed, pay returns failed → response indicates partial recovery; admin can retry the pay step via existing per-user retry path.
5. **Subscription not past-due** — returns 409 with `notPastDue` reason, no Stripe writes.
6. **Original invoice is `open`** — returns 409 with `notStranded` reason (admin should use existing flow).
7. **24h lock hit** — second invocation within window returns 409.
8. **Subscription canceled** — returns 409 with `subscriptionInactive` reason.

Test runs via `npm run test:recover-stranded-past-due`.

## Rollout plan

This is a destructive, irreversible operation. Roll out in three phases:

1. **Sandbox/staging test on one synthetic stranded user** — confirm the four-step Stripe sequence works end-to-end with a paused subscription and a working test card.
2. **Production: test on Evan first** — single, manually-selected user from the screenshot. Run recovery, verify charge succeeds, verify pause cleared, verify next anchor will bill normally. **Stop here for at least 24h** to confirm no anomalies in webhook handling, accounting, or analytics.
3. **General availability** — once Evan's recovery is verified clean, enable the action for the remaining stranded users one-by-one.

No feature flag needed — admin manual gating + typed confirmation + 24h lock provide enough rollout control.

## Confidence

| Component | Confidence | Evidence |
|---|---|---|
| Void uncollectible invoice | 99% | Standard Stripe API |
| Voiding doesn't affect app state | 99% | No `invoice.voided` handler in webhook ([stripe/webhook/route.ts:5088-5126](../../../src/app/api/stripe/webhook/route.ts#L5088-L5126)) |
| Finalize draft on paused sub | 99% | Three production code paths already do this |
| Pay open invoice | 95% | Reuses `payOpenInvoiceAsPastDueAdmin` |
| Held draft path | 90% | Stripe creates these per pause docs; we list and use directly |
| `invoices.create()` fallback | 80% | Unverified, but only invoked when no held draft exists |
| **Happy path: dead invoice + working card** | **~95%** | Most users hit the held-draft path which is fully verified |
| **Won't make worse** | 99% | All steps idempotent, void is no-op for app, partial states recoverable |

## Out of scope (Phase B reminders)

These belong in a separate spec, not this one:

- Switch Stripe Dashboard "If all retries fail" → "Mark as unpaid"
- Refactor or remove `SubscriptionCollectionPauseService` if the dashboard switch makes pause logic redundant
- Migrate existing paused users to the new failure-handling model
- Webhook handlers for `customer.subscription.updated` → `unpaid` status

## Open questions for review

1. UI for Trigger D — modal-on-modal stack vs in-place swap of CTA. Defer to implementation; both work.
2. Should the recovery action also be exposed in the user detail drawer (Trigger C from earlier brainstorming)? Currently rejected as redundant once Trigger A exists. Re-evaluate after Phase A ships if admins find Trigger A insufficient.
3. Should we cap the recovery action by total dollars per admin per day? Probably not in Phase A — typed confirmation + 24h per-user lock is sufficient.
