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
10. Klaviyo `ensureUserProfileSynced(user)` — non-blocking, errors logged not thrown.
11. `recordCancellationAnalytics(...)` writes a `MembershipStatusHistory` row — non-blocking.

**Important:** Cancellation analytics events (the "Subscription Cancelled" Klaviyo / Meta event) are **only emitted from the `customer.subscription.deleted` webhook**, never from this service path, to prevent duplicate events.

### `pauseAfterRenewalFailure(subscriptionId)` / `resumeAfterSuccessfulRenewalPayment(subscriptionId)`

[SubscriptionCollectionPauseService.ts](../../src/services/subscription/SubscriptionCollectionPauseService.ts)

```ts
export async function pauseAfterRenewalFailure(subscriptionId: string): Promise<void>;
export async function resumeAfterSuccessfulRenewalPayment(subscriptionId: string): Promise<void>;
```

`pause` sets `pause_collection: { behavior: "keep_as_draft" }`. `resume` clears `pause_collection` (sets to empty string per Stripe's manual-unpause API). Both are idempotent.

Pause callers: `invoice.payment_failed` webhook handler.

Resume callers (must run *before* benefit application):
- `invoice.payment_succeeded` webhook (when `shouldClearPauseCollectionAfterPaidInvoice()` returns true)
- `src/server/admin/chargePastDueShared.ts` after successful `invoices.pay`
- `/api/stripe/renew-subscription` after user retry success

### `prepareRecoveredCycleInvoice(params, deps?)`

[prepareRecoveredCycleInvoice.ts](../../src/services/subscription/prepareRecoveredCycleInvoice.ts) — the **one shared** "prepare a payable cycle invoice from a stranded past-due state" primitive, reused by the admin recover flow, the member interactive Pay-Now flow, and the member/admin off_session Force-Charge flow.

Ordering is deliberately **pick → stamp dunning marker → finalize → void** (not void-first): it finds the held cycle draft (`pickHeldDraftForRecovery`, matched against the live-price `expectedAmountCents`), **stamps `metadata.dunning_recovery: "1"` on the draft** (`markDunningRecovery`, merging existing metadata — best-effort, non-fatal), `finalizeInvoice(auto_advance:false)`s it, then voids the stranded original **last and non-fatally** (a void failure is logged and the recovery still succeeds — the draft is already finalized+payable). If no held draft exists it returns `no_held_draft` **without voiding anything**, so a member's current cycle can never be left with zero invoices; it **never** creates a manual invoice (would flip `billing_reason` off `subscription_cycle` and skip the webhook renewal pipeline + reanchor).

**Why stamp `dunning_recovery` (added 2026-07-20):** recovery pays the *new* draft while the marker-bearing *original* gets voided, so the paid invoice reaches `invoice.payment_succeeded` with **no marker, `attempt_count=1`, and `pause_collection` already cleared** — the reanchor gate (`shouldReanchorAfterRecovery`) then has only the racy `previousSubscriptionDbStatus` signal left and **silently skips**, leaving the member to be re-billed on their old anchor days later (observed live 2026-07: recovered members charged for two consecutive cycles 5–13 days apart). Stamping the durable marker on the draft — the same signal `handleInvoicePaymentFailed` puts on a failed renewal — makes the reanchor fire reliably for **every** recovery path (Pay-Now, Force-Charge, admin recover, bulk recover). ⚠️ Billing-timing change → **verify on a test clock (`npm run stripe:probe-reanchor --full`) before merge** per [docs/PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md).

It **never pays, resumes `pause_collection`, or reanchors** — the caller pays (interactive → return the finalized draft's PI `client_secret`; off_session → `payOpenInvoiceAsPastDueAdmin`) and the `invoice.payment_succeeded` webhook clears pause + reanchors. When an `audit` ctx is supplied it writes the recovery `InvoiceChargeLog` rows tagged `result.recovery.step` with the caller's `actor` (`admin`/`member`); side-effecting Stripe/DB ops are injectable for unit tests (`npm run test:prepare-recovered-cycle`).

### `mintCurrentCycleInvoice(params, deps?)`

[mintCurrentCycleInvoice.ts](../../src/services/subscription/mintCurrentCycleInvoice.ts) — force-collect the **current cycle** for a stranded **`no_held_draft`** member (`prepareRecoveredCycleInvoice` can't help them — nothing to finalize). Mechanism (test-clock verified, `npm run stripe:probe-rebill-cycle`): **unpause** (Stripe rejects invoice creation on a paused sub) → `subscriptions.update({ billing_cycle_anchor: 'now', proration_behavior: 'none' })`, which **immediately creates AND auto-charges** a fresh cycle invoice on the default card **and moves the next renewal ~1 month out** (so it doubles as the reanchor — no separate `trial_end`). The minted invoice is `billing_reason: **subscription_update**` (NOT `subscription_cycle`); the entry webhook normalizes that to a full renewal-size grant off the subscription's **live** metadata (correct for a straight re-bill). The dead original is voided last (best-effort). Returns `{ ok: true, invoiceId, amountPaid }` only when the invoice settled to `paid`; otherwise `charge_failed` (card didn't settle — member effectively past-due on a fresh cycle, retryable). **Does not fit the held-draft/`payOpenInvoiceAsPastDueAdmin` pattern** — the charge happens inside the `subscriptions.update`, so it writes no pay row; its caller logs the outcome. Serialized by the per-subscription `RecoveryClaim` (its own `acquireClaim`), so it must NOT be called by a context that already holds that claim. Wired as the `no_held_draft` fallback in `recoverStrandedPastDueInvoice({ mintCurrentCycleIfNoDraft })` — **enabled only** by the per-user `chargeOrRecover` (holds no claim); the bulk chunk passes `false`. Injectable deps; unit-tested `npm run test:mint-current-cycle`.

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
computeResumeAt(base: Date): number   // unix seconds = base + 30d
applyRetentionPause(userId: string): Promise<{ resumesAt: string }>
resumeRetentionPause(userId: string): Promise<{ resumed: true; wasFrozen: boolean }>
retentionPauseBlockReason(user): string | null   // pure eligibility guard
```

- **Timing fix (period-end anchored).** `computeResumeAt(base)` takes the member's **period end** as the base, so resume = `period_end + 30d` — NOT `now + 30d` (the previous formula gave a just-renewed member ~0 pause benefit). `applyRetentionPause` sources the period end from `user.subscription.endDate` (synced from Stripe for active members; falls back to the live Stripe period end when the DB date is missing/past), sets `pausedFrom = period_end`, `pausedUntil = period_end + 30d`, applies the Stripe pause (`pause_collection.behavior:"void"`, `resumes_at`, `metadata.pauseReason:"retention"`), then atomically persists `retentionOffersConsumed.pause30d = true` + `pausedFrom` / `pausedUntil`. Stripe-first ordering (persist failure is non-fatal — the pause is live). Guards (`retentionPauseBlockReason`, most-critical first): past-due → scheduled-to-cancel → already-consumed → no subscription.
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
