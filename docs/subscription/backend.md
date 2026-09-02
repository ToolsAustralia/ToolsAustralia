# Subscription — Backend

## Shared renewal-entries resolver (2026-07-09)

[`resolveNextRenewalEntries(user)`](../../src/utils/subscription/next-renewal-entries.ts) is the single source for "entries the member gets on their NEXT successful renewal" — carry-forward + monthly base via `calculateRenewalEntries` (renewals are **never** promo-multiplied). It handles all member states: `past_due`/`unpaid` still recovering (gated on `hasFailedRenewal`) → the settle preview; active + `autoRenew !== false` → effective-package base (downgrade-preservation aware); everything else → `null`. Shared by the admin user-detail route, the Norm `users.get` service projection (`getAdminUserDetail`), and mirrors the customer dashboard note (`useDashboardState.membershipEntriesPerRenewal`) — so all four agree by construction. Reach for this instead of re-deriving renewal entries.

The sibling [`renewalEntriesLandInCurrentDraw(renewalDate, draw)`](../../src/utils/subscription/next-renewal-entries.ts) answers whether a member's renewal grant lands in the **currently-active** draw — true iff the renewal falls before the draw's `freezeEntriesAt` (fallback `drawDate`). A renewal after the current draw's freeze grants into the NEXT draw (the member's current-draw entries reset to 0 for the new cycle), so surfaces that show "entries on renewal" against the *current* draw count must gate on this (the admin user-detail modal + Norm `subscription.renewalLandsInCurrentDraw` both do). Fail-closed: returns false on any missing/invalid input.

## Services

All non-trivial subscription logic lives under [`src/services/subscription/`](../../src/services/subscription/). Per CLAUDE.md, route handlers must delegate here — no business logic in `route.ts`.

### `cancelSubscription(user, options)`

[CancelSubscriptionService.ts](../../src/services/subscription/CancelSubscriptionService.ts)

The single shared cancellation entry point. Used by both the user route (`/api/stripe/cancel-subscription`) and the admin route (`/api/admin/users/[id]/cancel-subscription`).

**Signature:**

```ts
interface CancelSubscriptionOptions {
  cancelAtPeriodEnd?: boolean;            // default true
  analytics?: { actor: "user" | "admin"; adminUserId?: string };
  isMemberChurn?: boolean;                // default FALSE — opt-in, see below
}
interface CancelSubscriptionResult {
  cancelledImmediately: boolean;
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;        // ISO
  endDate: string | null;                 // ISO
  isPastDue: boolean;
}
```

**Flow:**
1. `resolveCancellableStripeSubscription(user)` — finds the live Stripe sub, repairing the canonical `User.stripeSubscriptionId` if it pointed at a dead one.
2. `isPastDue` derived from Stripe status OR Mongo `subscription.status` (either signal counts).
3. `shouldCancelImmediately = isPastDue || !cancelAtPeriodEnd`.
4. Stripe call: `stripe.subscriptions.cancel(id)` for immediate, otherwise `stripe.subscriptions.update(id, { cancel_at_period_end: true })`.
5. Re-`retrieve()` the subscription to get the authoritative `current_period_end`.
6. Resolve `stripeEndDate` via `resolveTimestamp(...)` — falls through `getSubscriptionPeriodEnd` (Basil API → legacy) → `cancel_at` field.
7. Mongo update on `user.subscription`: `autoRenew=false`, `cancelledAt=new Date()`, `status`, `endDate` (now if immediate, else stripe end), `isActive` (false if immediate).
8. Partner-discount queue: `handleSubscriptionQueueUpdate(user, "end")` — *only when cancelling immediately*.
9. `await user.save()`.
10. **The cancel-time Klaviyo emit (added 2026-08-26).** When `isMemberChurn === true`, `emitCancellationRequested(user)` fires `"Subscription Cancellation Requested"` via `klaviyo.trackEventBackground` — fire-and-forget, wrapped in its own try/catch, so a marketing signal can never block or fail a member cancelling. It is emitted **after** `await user.save()` because it carries the *persisted* `cancelledAt` / `endDate`, not the values this run intended to write. The package block comes from a real `getPackageById(subscription.packageId)` lookup through `formatCanonicalPackageData`, so the email can print a genuine tier name; when the stored id does not resolve the event still fires and simply omits the package block (a `console.error` records it). See [tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md#subscription-cancellation-requested-2026-08-26).

    **No win-back bonus code is minted here (changed 2026-08-26).** Between 2026-08-25 and 2026-08-26 this step called `mintBonusCodeForTrigger(user, "cancel-click")` when the flag was `true`; that block was deleted. The win-back email lands days after the cancellation while the personal window is a fixed 72 hours, so a code minted at the commit had already expired by the time the customer read about it. Minting moved to `POST /api/bonus-codes/v1/issue`, which the Klaviyo win-back flow calls one step above its discount email — the flow this step's event starts. See [rewards-redeemables P7](../rewards-redeemables/patterns.md).
11. Klaviyo `ensureUserProfileSynced(user)` — non-blocking, errors logged not thrown.
12. `recordCancellationAnalytics(...)` writes a `MembershipStatusHistory` row — non-blocking.

**Important:** The `"Subscription Cancelled"` Klaviyo event is **only emitted from the `customer.subscription.deleted` webhook**, never from this service path, to prevent duplicate events. Any cancel-time event this service emits must therefore carry a **different** name — never rename one to `"Subscription Cancelled"` or the duplication this rule prevents comes straight back.

**The one named carve-out is `"Subscription Cancellation Requested"`** (step 10 above). It is a different event, with a different name, feeding a different flow, and it is deliberately fired from this service path — it does not duplicate anything. It exists because `"Subscription Cancelled"` only fires when Stripe *deletes* the subscription, which for a cancel-at-period-end cancellation is up to a month after the member clicked cancel and is not guaranteed to arrive at all; a win-back flow needs the click. A Klaviyo segment cannot substitute: on the period-end path `subscription.status` is left unchanged, so the profile still reports `membership_status: "active"` after the post-cancel sync. Recorded as a carve-out in all three copies of the rule — [subscription/rules.md R4](./rules.md), [billing-stripe/rules.md R2](../billing-stripe/rules.md), [tracking/rules.md R2](../tracking/rules.md).

**`isMemberChurn` is opt-in (default `false`)** because this service has three callers and only one of them is churn. Renamed from `mintBonusCode` on 2026-08-26 when minting left this service; it was **not** deleted with the mint, because it is the only thing in the codebase that tells member churn apart from the two non-churn cancellations — exactly the gate the cancel-time marketing signal needs. Deleting it would have silently merged three different situations into one:

| Caller | `isMemberChurn` | Why |
|--------|------------------|-----|
| [`/api/stripe/cancel-subscription`](../../src/app/api/stripe/cancel-subscription/route.ts) (member-initiated) | `true` | The member is leaving — this is the win-back moment, and the only caller that emits `"Subscription Cancellation Requested"`. |
| [`switchTierPastDue.ts`](../../src/services/subscription/switchTierPastDue.ts) | `false` (default) | Cancel-then-resubscribe on a past-due tier switch. The member is *staying*; a tier switch is not churn. |
| [`/api/admin/users/[id]/cancel-subscription`](../../src/app/api/admin/users/[id]/cancel-subscription/route.ts) | `false` (default) | An admin-initiated cancellation must not silently start a win-back flow and email a customer who never asked to leave. |

The **commit** — not the start of the retention flow — is still the right moment to act on: a member saved by a retention offer never churns. But `subscription.cancelledAt` and the customer's bonus-code window are no longer the same instant; they are days apart, because the window now starts when the flow reaches its discount email. Do not write code that assumes they coincide.

### `pauseAfterRenewalFailure(subscriptionId)` / `resumeAfterSuccessfulRenewalPayment(subscriptionId)`

[SubscriptionCollectionPauseService.ts](../../src/services/subscription/SubscriptionCollectionPauseService.ts)

```ts
export async function pauseAfterRenewalFailure(subscriptionId: string): Promise<void>;
export async function resumeAfterSuccessfulRenewalPayment(subscriptionId: string): Promise<void>;
```

`pause` sets `pause_collection: { behavior: "keep_as_draft" }`. `resume` clears `pause_collection` (sets to empty string per Stripe's manual-unpause API). Both are idempotent.

Pause callers: `invoice.payment_failed` webhook handler.

Resume callers (must run *before* benefit application):
- `invoice.payment_succeeded` webhook (when `decideClearPause()` returns true — i.e. `pause_collection` is actually set and it is not a `"retention"` pause; see [rules.md R9](./rules.md#r9-after-successful-renewal-payment-clear-pause_collection-before-applying-benefits))
- `src/server/admin/chargePastDueShared.ts` after successful `invoices.pay`
- `/api/stripe/renew-subscription` after user retry success

### `prepareRecoveredCycleInvoice(params, deps?)`

[prepareRecoveredCycleInvoice.ts](../../src/services/subscription/prepareRecoveredCycleInvoice.ts) — the **one shared** "prepare a payable cycle invoice from a stranded past-due state" primitive, reused by the admin recover flow, the member interactive Pay-Now flow, and the member/admin off_session Force-Charge flow.

Ordering is deliberately **pick → stamp dunning marker → finalize → void** (not void-first): it finds the held cycle draft (`pickHeldDraftForRecovery`, matched against the live-price `expectedAmountCents`), **stamps `metadata.dunning_recovery: "1"` on the draft** (`markDunningRecovery`, merging existing metadata — best-effort, non-fatal), `finalizeInvoice(auto_advance:false)`s it, then voids the stranded original **last and non-fatally** (a void failure is logged and the recovery still succeeds — the draft is already finalized+payable). If no held draft exists it returns `no_held_draft` **without voiding anything**, so a member's current cycle can never be left with zero invoices; it **never** creates a manual invoice (would flip `billing_reason` off `subscription_cycle` and skip the webhook renewal pipeline + reanchor).

**Why stamp `dunning_recovery` (added 2026-07-20):** recovery pays the *new* draft while the marker-bearing *original* gets voided, so the paid invoice reaches `invoice.payment_succeeded` with **no marker, `attempt_count=1`, and `pause_collection` already cleared** — the reanchor gate (`shouldReanchorAfterRecovery`) then has only the racy `previousSubscriptionDbStatus` signal left and **silently skips**, leaving the member to be re-billed on their old anchor days later (observed live 2026-07: recovered members charged for two consecutive cycles 5–13 days apart). Stamping the durable marker on the draft — the same signal `handleInvoicePaymentFailed` puts on a failed renewal — makes the reanchor fire reliably for **every** recovery path (Pay-Now, Force-Charge, admin recover, bulk recover). ⚠️ Billing-timing change → **verify on a test clock (`npm run stripe:probe-reanchor --full`) before merge** per [docs/PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md).

It **never pays, resumes `pause_collection`, or reanchors** — the caller pays (interactive → return the finalized draft's PI `client_secret`; off_session → `payOpenInvoiceAsPastDueAdmin`) and the `invoice.payment_succeeded` webhook clears pause + reanchors. When an `audit` ctx is supplied it writes the recovery `InvoiceChargeLog` rows tagged `result.recovery.step` with the caller's `actor` (`admin`/`member`); side-effecting Stripe/DB ops are injectable for unit tests (`npm run test:prepare-recovered-cycle`).

### `mintCurrentCycleInvoice(params, deps?)`

[mintCurrentCycleInvoice.ts](../../src/services/subscription/mintCurrentCycleInvoice.ts) — force-collect the **current cycle** for a stranded **`no_held_draft`** member (`prepareRecoveredCycleInvoice` can't help them — nothing to finalize). Mechanism (test-clock verified, `npm run stripe:probe-rebill-cycle`): **unpause** (Stripe rejects invoice creation on a paused sub) → `subscriptions.update({ billing_cycle_anchor: 'now', proration_behavior: 'none' })`, which **immediately creates AND auto-charges** a fresh cycle invoice on the default card **and moves the next renewal ~1 month out** (so it doubles as the reanchor — no separate `trial_end` here). **Anchor-24 caveat:** `billing_cycle_anchor:'now'` renews on the recovery day itself, un-clamped — so when the recovery lands on the **25th/26th/27th** (AEST) the entry webhook re-applies the anchor-24 clamp (`shouldReanchorRebillToAnchor24` → `reanchorAfterPastDueRecovery`, `trial_end` to the next 24th, member → `trialing`) so the renewal keeps its ≥3-day buffer before the 27th major draw — **parity with the held-draft recovery path**; on any other day the ~1-month anchor already suffices. The minted invoice is `billing_reason: **subscription_update**` (NOT `subscription_cycle`); the entry webhook normalizes that to a full renewal-size grant off the subscription's **live** metadata (correct for a straight re-bill). The dead original is voided last (best-effort). Returns `{ ok: true, invoiceId, amountPaid }` only when the invoice settled to `paid`; otherwise `charge_failed` (card didn't settle — member effectively past-due on a fresh cycle, retryable). **Does not fit the held-draft/`payOpenInvoiceAsPastDueAdmin` pattern** — the charge happens inside the `subscriptions.update`, so it writes no pay row; its caller logs the outcome. Serialized by the per-subscription `RecoveryClaim`; the optional **`skipClaim`** param lets a caller that **already holds** this subscription's claim reuse it — `skipClaim: true` makes the mint neither acquire nor release its own claim (line ~97 `params.skipClaim ? true : await acquireClaim(...)`; the `finally` only releases `when !params.skipClaim`). Wired as the `no_held_draft` fallback in `recoverStrandedPastDueInvoice({ mintCurrentCycleIfNoDraft })`, enabled by **both** the per-user `chargeOrRecover` (holds no claim → leaves `skipClaim` false/undefined, mint acquires its own) **and** the BULK "Charge Past Due" job (acquires the `RecoveryClaim` per member, so it threads `skipClaim: true` via `recoverStrandedPastDue`'s `callerHoldsRecoveryClaim` — without which the mint would always self-deadlock to `claim_held` and skip every stranded member). **Hardening (2026-07-21, from the adversarial audit):** after acquiring the claim it does a LIVE re-read and **(D)** refuses a member with `cancel_at_period_end` (`member_ending` — re-anchoring would extend a cancelling member ~1 month and reverse their cancellation), **(A)** refuses when the sub is no longer `past_due`/`unpaid`: `active`/`trialing` → `already_collected` (a prior re-bill already collected, so a re-anchor would be a **double-charge**), while any OTHER non-collectible status (`canceled`/`incomplete`/`incomplete_expired`) → **`subscription_inactive`** (kept distinct — 2026-07-21 review — so the member "Resolve" path can't show a false "paid" for a dead sub; a FAILED prior mint stays `past_due` and is correctly still retryable), and **(B)** the anchor `subscriptions.update` BLANKS stale `upgradeFrom`/`upgradeType`/… metadata (Stripe merges metadata) so a previously-upgraded member's re-bill grants a plain **renewal**, not a promo-inflated **upgrade** (the `billing_anchor_rule: rebill_current_cycle` tag it also stamps **IS read by the webhook** — with the `upgradeFrom` + `past_due` guards — to classify this as a RENEWAL: on SUCCESS `handleInvoicePaymentSucceeded` normalizes its `billing_reason` → `subscription_cycle` so admin labels / revenue+ROAS / conversion tracking / `isRenewal` all treat it as a renewal (`isRebillPayment`, see billing-stripe/gotchas.md), and on DECLINE `handleInvoicePaymentFailed` fires "Renewal Failed" via `isRebill`). Guard/concurrency outcomes (`claim_held`/`member_ending`/`already_collected`/`subscription_inactive`) log as **skipped**, not failed (no card was touched). A THIRD consumer calls the mint directly: the member **"Resolve payment"** route (`pay-failed-invoice`) mints for its own `no_held_draft` cohort with `skipClaim: true` (it already holds the claim), mapping the result via `classifyMemberResolveMintOutcome` (see [FAILED_RENEWAL_PAY_NOW.md](../FAILED_RENEWAL_PAY_NOW.md)); probe `npm run stripe:probe-member-resolve-mint`. Injectable deps; unit-tested `npm run test:mint-current-cycle`.

### `pauseCollectionPolicy.ts` (pure helpers)

[pauseCollectionPolicy.ts](../../src/services/subscription/pauseCollectionPolicy.ts)

Two pure helpers, no Stripe client — safe to import in tests:

```ts
shouldClearPauseCollectionAfterPaidInvoice({
  billingReason,                    // Stripe invoice.billing_reason
  previousSubscriptionDbStatus,     // Mongo's view of status before this update
}): boolean;

describePauseCollection(subscription): string;   // "none" | "void" | "mark_uncollectible" | "keep_as_draft" | "paused"
```

Clearing rule (returns true if any):
- Previous DB status was `past_due` or `unpaid`.
- `billingReason` is `subscription_cycle` | `subscription_threshold` | `subscription_update`.

### `RetentionPauseService` — the `paused` membership state

[RetentionPauseService.ts](../../src/services/subscription/RetentionPauseService.ts) — applies the 30-day `pause_30d` cancellation-flow retention offer. A member who accepts keeps the PAID period they already bought, then FREEZES for ~30 days. This introduces a real DB state: `subscription.status = "paused"` + `subscription.isActive = false` during the window `[subscription.pausedFrom, subscription.pausedUntil)` (the two new fields — see [models.md](./models.md#subscription-subdocument-fields)).

**Frozen semantics.** While paused: no charge, and the existing `isActive=false` gates suspend partner discounts, member pages, additional-pack access, and NEW entry accrual (a `behavior:"void"` pause discards cycle invoices, so no paid renewal → no entry-grant webhook — no extra "freeze" code needed). **Existing accumulated entries are UNTOUCHED** — they were paid for, so a paused member's already-earned entries still count in draws. (No entry freezing/exclusion is applied.)

```ts
computeResumeAt(base: Date): number   // unix seconds = base (period end) + 1 month, calendar-clamped via date-fns addMonths
applyRetentionPause(userId: string): Promise<{ resumesAt: string }>
resumeRetentionPause(userId: string): Promise<{ resumed: true; wasFrozen: boolean }>
retentionPauseBlockReason(user): string | null   // pure eligibility guard
```

- **Timing fix (period-end anchored, next-cycle-boundary).** `computeResumeAt(base)` takes the member's **period end** as the base, so resume = `period_end + 1 month` — the member's NEXT billing-cycle boundary, computed with date-fns `addMonths` (calendar-clamped, Feb-safe), which skips exactly one cycle. Two earlier formulas were wrong: anchoring off the current time gave a just-renewed member ~0 pause benefit, and a fixed 30-day offset would double-skip a 28-day month and misalign the re-bill. `applyRetentionPause` sources the period end from `user.subscription.endDate` (synced from Stripe for active members; falls back to the live Stripe period end when the DB date is missing/past), sets `pausedFrom = period_end`, `pausedUntil = period_end + 1 month`, applies the Stripe pause (`pause_collection.behavior:"void"`, `resumes_at`, `metadata.pauseReason:"retention"`), then atomically persists `retentionOffersConsumed.pause30d = true` + `pausedFrom` / `pausedUntil`. Stripe-first ordering (persist failure is non-fatal — the pause is live). Guards (`retentionPauseBlockReason`, most-critical first): past-due → scheduled-to-cancel → already-consumed → no subscription.
- **Flip `active → paused`.** PRIMARY = the Stripe webhook `handleSubscriptionUpdated` — Stripe keeps the sub `status:"active"` during a `pause_collection`, so the **app owns** the DB `paused` state. When the update carries a retention pause AND `now >= pausedFrom`, it sets `status="paused"` / `isActive=false`; the else-branch active-restore is GUARDED (`prevSubStatus !== "paused"`) so it can't clobber `paused` back to `active`. BACKSTOP = the [`cancellation-retention-resume` cron](../infrastructure/api.md#cancellation-retention-resume-cron) (flips at `pausedFrom` if the webhook was missed, and restores if Stripe already resumed). The flip/restore choice is the pure `decidePauseTransition(...)` in [`pauseCollectionPolicy.ts`](../../src/services/subscription/pauseCollectionPolicy.ts) — **shared by the webhook and the cron** so the two can never drift (unit-tested: `npm run test:pause-transition`, 8 cases). See [gotchas.md](./gotchas.md#retention-pause--the-app-owns-the-paused-state-stripe-stays-active) + [billing-stripe/gotchas.md](../billing-stripe/gotchas.md#retention-pause-keeps-stripe-active-while-the-app-owns-paused).
- **Auto-resume.** At `pausedUntil` Stripe auto-resumes collection and bills the next cycle. A SUCCESSFUL charge restores active — `handleInvoicePaymentSucceeded` flips `paused → active` and unsets `pausedFrom` / `pausedUntil` (a paused member's only paid invoice is their resume charge, since the void pause discards all others). A FAILED charge → `past_due` (benefits return ONLY after a successful payment — `handleInvoicePaymentFailed` keeps them past-due, never flickering active).
- **Early resume.** `resumeRetentionPause(userId)` lifts the pause immediately — exposed by `POST /api/subscription/resume-pause` (the member **"Resume now"** button in the dashboard ManageSheet) and `POST /api/admin/users/[id]/resume-pause` (admin resume control, gated by the `users.cancelSubscription` permission + audit log). It clears the Stripe `pause_collection` + retention metadata and unsets the pause window; the return to active is the same payment-gated restore (if already past the period end, Stripe bills the next cycle now and `invoice.payment_succeeded` restores active; a failed charge → `past_due`).

Pure helpers (`computeResumeAt`, `retentionPauseBlockReason`) are unit-tested without Stripe/DB (`npm run test:retention-pause`). `decideClearPause` in `pauseCollectionPolicy.ts` keys on `metadata.pauseReason === "retention"` to protect a retention pause from the recovery-clear path (see [billing-stripe/gotchas.md](../billing-stripe/gotchas.md#paid-invoice-clear-pause-decision-is-now-centralized)).

### `SubscriptionReferenceService` (Stripe-ref repair toolkit)

[SubscriptionReferenceService.ts](../../src/services/subscription/SubscriptionReferenceService.ts)

Helpers used everywhere we touch a Stripe subscription. Key exports:

| Symbol | Role |
|---|---|
| `MANAGEABLE_STRIPE_SUBSCRIPTION_STATUSES` | `["active","trialing","past_due","unpaid","paused"]` — the canonical "user has a real sub" set. |
| `DEAD_STRIPE_SUBSCRIPTION_STATUSES` | `["incomplete","incomplete_expired","canceled"]`. |
| `isManageableStripeSubscriptionStatus(status)` | Type-narrowing predicate. |
| `isDeadStripeSubscriptionStatus(status)` | Same for dead set. |
| `shouldWriteCanonicalStripeSubscriptionId(status)` | Only promote to `User.stripeSubscriptionId` when manageable. |
| `retrieveStripeSubscription(id)` | Wraps `stripe.subscriptions.retrieve` with classified errors (`is404`, `isRetryable`). |
| `findRecoverableSubscriptionForCustomer(customerId)` | Lists subs by status priority (`active → trialing → past_due → unpaid → paused`); newest-first within a status. |
| `stripeCustomerHasManageableSubscription(customerId)` | Pre-create dedupe guard. |
| `resolveCancellableStripeSubscription(user)` | The full repair-and-resolve algorithm used by the cancel service. Throws `SubscriptionReferenceError` with a typed `code`. |
| `shouldAdoptPaidSubscriptionOverStored(...)` | Webhook auto-correction when `invoice.paid` references a different (but manageable) sub than the stored one (and stored is dead). |

Error codes (`SUBSCRIPTION_REFERENCE_ERROR_CODES`):
- `NO_ACTIVE_SUBSCRIPTION` — surface as 400 / "you have no subscription to cancel."
- `STRIPE_RETRYABLE` — surface as 503 with retry-after.

## Utilities

[`src/utils/subscription/`](../../src/utils/subscription/) and [`src/utils/membership/`](../../src/utils/membership/) hold pure helpers consumed by services and route handlers.

| File | Purpose |
|---|---|
| `utils/membership/get-active-package.ts` | Resolve the user's currently-effective package, honouring `previousSubscription` for downgrade benefit-preservation. |
| `utils/membership/has-additional-package-access.ts` | Combined check: subscription + one-time package overlap. |
| `utils/membership/membership-adapters.ts` | Shape conversions between Mongo, Stripe, and UI representations. |
| `utils/membership/subscription-benefits.ts` | Resolve `entriesPerMonth`, `shopDiscountPercent` etc. given a subscription state. |
| `utils/membership/benefit-resolution.ts` | Higher-level resolver that combines subscription + one-time + active mini-draws. |
| `utils/membership/member-package-mapping.ts` | Static config map `packageId → packageName` etc. |
| `utils/subscription/subscription-helpers.ts` | Misc helpers (date math, status normalisation). |

> _TODO: enumerate the exact exports from each helper file and document any non-obvious invariants. The above is a structural overview — refresh when touching these files._

## Entry-calculation dispatcher — `calculateSubscriptionEntries`

[`src/utils/payment/subscription-entries-calculator.ts`](../../src/utils/payment/subscription-entries-calculator.ts) is the single pure-function entry point that decides how many entries a subscription event grants and what the user's new `lastMonthAccumulatedEntries` should be. It is dispatched from the `invoice.payment_succeeded` webhook (see [billing-stripe/architecture.md](../billing-stripe/architecture.md#upgrade-entries--mode-a--mode-b)) and from the four upgrade-modal preview call sites.

Branches (in priority order):

| Scenario | Function | Formula |
|---|---|---|
| Upgrade (`isUpgrade: true`) | `calculateUpgradeEntries` | Mode A / Mode B — see below |
| Resubscribe (`isResubscribe: true`, `lastMonthAccumulatedEntries` defined) | `calculateResubscribeEntries` | `grant = base × promo`; `accum = lastMonth + (base × promo)` |
| Initial (`billing_reason === "subscription_create"`) | `calculateInitialSubscriptionEntries` | `grant = base × promo`; `accum = grant` |
| Renewal (`billing_reason === "subscription_cycle"`) | `calculateRenewalEntries` | `grant = lastMonth + base`; `accum = grant` (no promo on renewal) |

### `calculateUpgradeEntries` — two modes

Signature: `calculateUpgradeEntries(newBaseEntries, lastMonthAccumulatedEntries = 0, promoMultiplier = 1, hasMembershipGrantInCurrentDrawPeriod = false)`. The dispatcher threads the same `hasMembershipGrantInCurrentDrawPeriod?: boolean` param through to the upgrade branch.

**Mode A — no prior membership grant in the active draw (common case):**
```
entriesToGrant            = lastMonthAccumulated + (newBase × promoMultiplier)
newLastMonthAccumulated   = entriesToGrant
```

**Mode B — a membership grant already landed in the active draw (renewal-then-upgrade within the same major-draw period):**
```
entriesToGrant            = newBase × promoMultiplier        // legacy formula
newLastMonthAccumulated   = lastMonthAccumulated + entriesToGrant
```

Worked examples (from spec §3):

| Scenario | lastAccum | newBase | promo | hasGrantThisDraw | grant | newAccum |
|---|---|---|---|---|---|---|
| Apr Tradie renewal → May Boss upgrade (5×) | 1115 | 100 | 5 | false | **1615** | 1615 |
| Apr Tradie renewal → May Boss upgrade (no promo) | 1115 | 100 | 1 | false | 1215 | 1215 |
| May Tradie renewal → May Boss upgrade same draw (5×) | 1130 | 100 | 5 | true | **500** | 1630 |
| Fresh user initial → upgrade same draw (5×) | 150 | 100 | 5 | true | 500 | 650 |
| `lastAccum = 0` (no history) | 0 | 100 | 5 | false | 500 | 500 |

**Invariant.** Total membership entries credited to a user in any single major-draw period = `lastMonthAccumulated_at_start_of_period + (newBase × promo)`, regardless of how many entry-granting events fire in that period. Mode B preserves the invariant by crediting only the differential to the draw while still accumulating the full baseline for the next renewal.

Why two modes: prior to this design, mid-cycle upgrades granted only `newBase × promo`, which could be *fewer* entries than letting the cheaper tier renew — a backwards incentive. Mode A stacks `lastMonthAccumulated` into the grant. Mode B is the guard that prevents double-counting when a renewal already credited the current draw.

`hasMembershipGrantInCurrentDrawPeriod` is computed by [`src/utils/draws/has-membership-grant-this-draw.ts`](../../src/utils/draws/has-membership-grant-this-draw.ts) (see [draws/backend.md](../draws/backend.md#has-membership-grant-this-draw-helper)) and fails open to `false` (Mode A) on any error. Tests live in [`src/utils/payment/__tests__/subscription-entries-calculator.test.ts`](../../src/utils/payment/__tests__/subscription-entries-calculator.test.ts) — runnable via `npm run test:subscription-entries-calculator`.

**Modal preview parity (Phase 2, 2026-05-20).** The same boolean is surfaced to the client as `user.hasCurrentDrawMembershipGrant` by `GET /api/users/[id]/my-account` (see [dashboard-account/api.md](../dashboard-account/api.md#get-apiusersidmy-account)). All four `calculateUpgradeEntries` invocations in the upgrade modal pass it as the 4th argument so the previewed entry total matches what the webhook will actually grant:

- [`UpgradeList.tsx`](../../src/components/modals/SubscriptionManagementModal/UpgradeList.tsx) — per-row preview in the upgrade list.
- [`SubscriptionManagementModal/index.tsx`](../../src/components/modals/SubscriptionManagementModal/index.tsx) — the `upgradeModalData` memo, the pending-change banner's upgrade branch, and `totalEntriesAfterUpgrade`.

Stale-payload caveat: a renewal landing between page load and click can drift the preview by one mode; the webhook is still authoritative and a refresh re-fetches the flag.

## Membership upsell semantics (upsell-remap — 2026-05-14)

When a membership subscriber completes a purchase, they are offered a post-payment upsell. Under the remap the upsell references the **next tier down** base pack (not a bespoke "Plus" SKU):

| Subscriber tier | Upsell shown | Upsell ID | Default upsell entries |
|---|---|---|---|
| Tradie (`tradie-subscription`) | Apprentice Pack | `membership-upsell-tradie` | 30 free (10× × 3 base) |
| Foreman (`foreman-subscription`) | Tradie Pack | `membership-upsell-foreman` | 150 free (10× × 15 base) |
| Boss (`boss-subscription`) | Foreman Pack | `membership-upsell-boss` | 300 free (10× × 30 base) |

The category multiplier (default 10×) is admin-configurable via `UpsellMultiplierConfig`. See [upsell/architecture.md](../upsell/architecture.md) for the formula.

## `isAdditional` and the mini-draw catalog swap

`MiniDrawPackage.isAdditional` controls which mini-draw packs are shown to subscribers vs guests (the catalog-swap rule in [src/utils/membership/has-additional-package-access.ts](../../src/utils/membership/has-additional-package-access.ts)).

The five new `additional-*-pack-mini` records carry `isAdditional: true`, so they appear in the subscriber mini-draw catalog while guests still see `mini-pack-1/2/3`. **However**, being in the `isAdditional` catalog does NOT route these packs through `getEffectivePromoType`'s subscriber-bonus branch — they stay on the `mini-packages` promo path (typically `1×` multiplier). The flag governs catalog visibility only.

## `getEffectivePromoType` — unchanged

[src/utils/promo/get-effective-promo-type.ts](../../src/utils/promo/get-effective-promo-type.ts) resolves tier-based purchase multipliers (subscriber vs entrant vs guest). This logic is **not** changed by the upsell remap. Upsell entry math uses a separate `UpsellMultiplierConfig` knob; `getEffectivePromoType` affects package purchases only.

## Membership Streak counter (P1 — 2026-07-07)

The streak (consecutive paid renewals; join = month 0) lives on `User.subscription.streakMonths` with `streakGeneration` scoping re-earns after a full lapse. All decision logic is pure and DB-free in [src/utils/subscription/streak.ts](../../src/utils/subscription/streak.ts) (`npm run test:streak`, 22 assertions):

- `isFirstTimePaidCycle(preImageStatus)` — gates the webhook's `$inc` on the `MembershipRenewalCycle` pre-image (replay-proof; recovery increments late because it pays the same cycle invoice).
- `decideStreakOnSubscriptionCreate(...)` — start (fresh join / out-of-grace resubscribe, generation bump only when a prior streak existed) / continue (within `RESUBSCRIBE_GRACE_DAYS = 30` of `subscription.endDate`) / none (upgrades, non-create invoices).
- `computeStreakFromHistory(...)` — the backfill/repair walker: counts paid cycles, breaks generations on >`BREAK_GAP_DAYS` (65-day) gaps **with cancel evidence** (a `canceled` OR `scheduled_cancel` history row from `CANCEL_LOOKBACK_DAYS` (40d) before the previous paid cycle up to the next one — a scheduled-cancel *click* precedes the lapse), continues over recovery/pause gaps (~60d, no cancel evidence) without crediting missed months, and rounds UP to whole months since join for history-incomplete active members with no detected breaks (never under-credit veterans — owner-approved). The runner additionally **never regresses a live-written reset**: when the user's live `streakGeneration` exceeds the computed one, the row is skipped (`LIVE-RESET-PRESERVED` in the CSV).

Continuity rules (spec §2): recovered past-due keeps; retention pause freezes (emergent — `behavior: void` produces no cycle invoice); grace reactivate continues; upgrade/downgrade untouched; only out-of-grace `create_new` resets. Writers live in the Stripe webhook — see [billing-stripe/backend.md](../billing-stripe/backend.md#membership-streak-writers-in-the-webhook--added-2026-07-07-p1) — and the backfill script `scripts/backfill-membership-streaks.ts` ([infrastructure](../infrastructure/README.md#membership-streak-backfill-added-2026-07-07)). Invariants: [gotchas.md](./gotchas.md#membership-streak-counter--three-invariants-2026-07-07-p1). Grants/milestones are P2 (not yet built).

## Jobs / cron / locks

`ChargeJobLock` (model) is a **single-document** distributed lock used to serialise the past-due charge job, ensuring only one instance of the operational charge run executes at a time across deployments. The doc's `_id` is hard-coded to `"charge-job-lock"`. See [models.md](./models.md#chargejoblock).

> _TODO: locate the cron entry that uses `ChargeJobLock` (likely under `src/lib/jobs/` or `src/app/api/cron/`) and document its schedule + behaviour. Cross-reference [infrastructure](../infrastructure/) when those docs exist._

## Renewal cohort metrics — due-time vs payment-time (2026-09-02)

`MembershipAnalyticsService.getAnalyticsBundle` returns a `renewalCohort` describing the
renewals **due** in a range and their outcomes. Shaping is in the pure
[`summarizeRenewalCohort`](../../src/utils/admin/renewalCohort.ts) (`npm run test:renewal-cohort`);
the admin card that consumes it is documented in [admin/frontend.md](../admin/frontend.md).

**Two clocks, and they are not interchangeable.** Stripe finalises a renewal invoice roughly an
hour after the cycle boundary, so a renewal due at 23:30 is charged the next day:

| Field | Clock | Meaning |
| --- | --- | --- |
| `renewalCohort.landedInRange` | **due-time** (`dueAt`) | Members whose renewal fell due in range and collected |
| `successfulRenewalsInRange` / `successfulRenewalUserCount` | **payment-time** | Renewal payments received in range — what the revenue card ties to |

These legitimately differ (32 vs 43 on a live day). **Never divide one by the other** — that
mismatch is exactly the bug this work replaced.

**`failedInvoiceAttemptsInRange` counts ATTEMPTS, not members.** It keys off `failedAt`, which
dunning rewrites on every retry of an older invoice: 129 attempts against 21 members actually
due, on the same day. It was previously named `failedInvoicesInRange`; the rename makes the
distinction visible next to the cohort's `failedInRange`. For members, always use
`renewalCohort.failedInRange`.

**`MembershipRenewalCycle` is reactive, not a schedule.** Rows exist only once Stripe emits an
invoice (`stripeInvoiceId` is `required, unique`) — there are **zero** rows dated in the future,
and nothing writes the `"expected"` status the enum permits. Anything needing a forward view of
renewals must read `User.subscription.endDate`, as the cohort's pending half does. The field
formerly called `expectedRenewalsInRange` was removed for asserting a forecast this table cannot
provide; it had also been mirrored to Norm under that name.

**Recovery rewrites history.** `upsertRenewalCycleFromPaidInvoice` sets `status: "succeeded"` on
the **existing** row, so a failed cycle later recovered by dunning flips in place and a past
range's `failedInRange` decreases over time. Intended (it answers "did they eventually pay?"),
but it means these figures are not reproducible from a screenshot.

Computed **live** on every range — never from `DashboardStatsDailySnapshot`, which covers revenue
buckets only. `MembershipRenewalCycle` holds data from 2026-01-26; earlier ranges return zeros,
which is genuine absence rather than an error.
