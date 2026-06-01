# Past-Due Reanchor

## Summary

When a `past_due`/`unpaid` membership recovers (any channel), we reanchor the member's future renewals to the **recovery-payment date** (AEST), clamping days **25/26/27 → 24**. Previously the original anchor day was retained. This stops re-billing a recovered member ~2 weeks later on the old anchor — their next charge becomes ~1 month from when they caught up.

> A past-due member has **no** benefits (`isActive=false`); reanchor changes only the next *charge date*, not access.

## The rule

- New renewal day = the day the recovery payment landed (AEST, from `invoice.status_transitions.paid_at`), clamped: **25/26/27 → 24** (same draw-buffer window as the join-anchor rule; the major-draw period is the 28th–27th).
- **Short months:** a kept day of 29/30/31 in a shorter month → the **last day** of that month.
- **Mechanism:** `stripe.subscriptions.update(id, { trial_end, proration_behavior: 'none', metadata: { billing_anchor_rule: 'past_due_reanchor' } })` — **not** `billing_cycle_anchor`. `trial_end` is **future-floored**: Stripe does NOT reject a past `trial_end` (it ends the trial immediately and charges), so a non-future computed value aborts the reanchor non-fatally.

## Where it lives

| Concern | Location |
|---|---|
| Pure date math | `src/utils/billing/anchor-billing.ts` — `clampReanchorDay`, `daysInMonthUTC`, `getReanchorTrialEndTimestamp`, `BILLING_ANCHOR_RULE_VERSION` |
| Trigger predicate | `shouldReanchorAfterRecovery` in `src/services/subscription/pauseCollectionPolicy.ts` |
| Orchestrator | `reanchorAfterPastDueRecovery` in `src/services/subscription/SubscriptionCollectionPauseService.ts` |
| Single hook | `handleInvoicePaymentSucceeded` in `src/services/stripe-webhook-handlers/index.ts` |
| Idempotency marker | `User.subscription.lastReanchoredInvoiceId` |

All five recovery channels (Stripe auto-retry, admin charge, user retry, Pay-Now, force-charge) pay the existing `subscription_cycle` invoice, so each emits one `invoice.payment_succeeded` caught by the single hook — no inline-route edits.

## Trigger gate

Fires only when: `billing_reason === 'subscription_cycle'` AND invoice paid AND **dunning detected** (`previousSubscriptionDbStatus ∈ {past_due, unpaid}` OR `pause_collection` present at payment OR `invoice.attempt_count > 1`) AND NOT `cancel_at_period_end` AND `autoRenew !== false` AND `pauseReason !== 'retention'` AND not already reanchored for this invoice.

The `attempt_count > 1` arm is essential: the `renew-subscription` retry channel pre-flips DB status to `active` AND clears `pause_collection` before the webhook, defeating the other two dunning arms.

## Idempotency & failure semantics

Atomic claim: `User.findOneAndUpdate({ _id, 'subscription.lastReanchoredInvoiceId': { $ne: invoiceId } }, { $set: { ... } })`. Only the first delivery for an invoice proceeds. Stripe dashboard resends carry fresh `event.id`s and bypass the event-id idempotency layers, so the marker keys on `invoiceId` (the audit row dedupes on it too).

Fully **non-fatal** (recovery already succeeded). On a Stripe-update failure the claim is intentionally **NOT released**: the member self-heals on the next cycle's recovery invoice (new `invoiceId` → fresh claim). We accept a one-cycle anchor miss to preserve single-writer concurrency safety.

## endDate

Written from the **same computed `trial_end`** (`new Date(trialEndSeconds * 1000)`), never read back from Stripe (`current_period_end` can lag). The emitted `trialing` `customer.subscription.updated` is a backstop (it syncs `endDate` for active/trialing).

## Downstream propagation

Every surface that shows the renewal date reads `endDate` **live** per request (my-account, SubscriptionManagementModal, admin upcoming-renewals / projected-income) → auto-corrects on next fetch. The one external copy that does **not** is the **Klaviyo profile** (`next_renewal_date`, `subscription_end_date`, `past_due_renewal_entries` are pushed snapshots) — the orchestrator re-pushes via `ensureUserProfileSynced` after writing `endDate`, and a defense-in-depth push was added to the active/trialing recovery branch of `handleSubscriptionUpdated`. Historical/point-in-time records (Klaviyo events, the renewal email's date row, `MembershipRenewalCycle.dueAt`, daily snapshots) are correct as-is.

## Audit

- Stripe metadata tag `billing_anchor_rule: 'past_due_reanchor'` (parallels the join rule's `'join_25_27_to_24'`).
- `BILLING_ANCHOR_RULE_VERSION` bumped to 2 (documentation only — nothing branches on it).
- `MembershipStatusHistory` row (`source: 'webhook_past_due_reanchor'`, `dedupeKey: past_due_reanchor_<userId>_<invoiceId>`) capturing old→new anchor day, recovery day, clamped day, and old/new `endDate`.

## Tests

- `npm run test:anchor-billing` — date math (clamp, short months, DST boundaries, year rollover, same-day roll, future-floor, invalid input).
- `npm run test:reanchor-gate` — the trigger predicate (signal isolation + all exclusions).

## Pre-ship gate (Stripe test-mode probe)

Three behaviors are documented-but-not-live-verified and must be confirmed in test mode **before the behavior flip merges to main**:
1. Future `trial_end` + `proration_behavior:'none'` on a just-paid active sub creates no new invoice and leaves the paid invoice paid.
2. The sub reports `status='trialing'` and `current_period_end == trial_end` after the update.
3. `pause_collection` + `trial_end` ordering (our flow clears pause before reanchor).

Also confirm `invoice.attempt_count > 1` on recovered renewals across all five channels.

## Related

- `docs/BILLING_ANCHOR_24.md` (join-anchor rule; reanchor is the second anchor-move trigger)
- `docs/STRIPE_COLLECTION_PAUSE_RECOVERY.md`, `docs/CHARGE_PAST_DUE_CUSTOMERS.md`, `docs/FAILED_RENEWAL_PAY_NOW.md`
- Design spec: `docs/superpowers/specs/2026-06-01-past-due-reanchor-design.md`
