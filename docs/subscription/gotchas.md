# Subscription — Gotchas

Real failure modes, surprising behaviours, and tribal knowledge from incidents. Most of these came from production bugs and have lessons attached.

## Anchor-24 members could not upgrade at all (2026-08-24)

**Symptom:** every tier upgrade by a member whose renewal is anchored failed with a Stripe 400.
Not flaky — deterministic, for the whole cohort, since anchoring shipped.

**Cause:** the upgrade is pay-first by design (`billing_cycle_anchor: "now"`), and anchored members
are held on a pending `trial_end` by design (25th–27th joiners → the 24th; past-due recoveries →
their clamped catch-up day). Stripe refuses an anchor that lands before an unfinished trial.

**Why not just clear the trial:** ending it and walking away silently discards anchor-24 for that
member — their renewal drifts off the 24th and loses the ≥3-day buffer before the major draw that
the whole rule exists to guarantee. The fix is **end trial → charge now → re-apply the anchor for
the next cycle**, so pay-first semantics and the anchor both survive.

**What this means for the member journey:** an upgrading anchored member is charged the new tier's
full price today (unchanged) but **keeps their renewal day** instead of resetting it to today. Their
Stripe subscription is left `trialing`; `getSubscriptionStatusText` maps that to **"Active"** and no
member surface says "Trial". `subscription.endDate` is re-synced by the `customer.subscription.updated`
webhook, which already handles `trialing` subs, so `/my-account` shows the right next renewal date
without the route writing it.

Mechanism, ordering traps, and the $0-invoice guard: [billing-stripe/gotchas.md](../billing-stripe/gotchas.md)
and [PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md).

## `useMembershipModalDeepLink` must not use `useSearchParams()` (2026-07-27)

The Klaviyo abandoned-checkout deep-link hook
([`useMembershipModalDeepLink`](../../src/hooks/useMembershipModalDeepLink.ts), reads
`?openMembership=1&packageId=…`) is called from
[`MembershipSection`](../../src/components/sections/MembershipSection.tsx), which renders on the
PRERENDERED `/` and `/promotions/*` routes. Its `useSearchParams()` call de-opted the whole
packages grid to client-only rendering, so the section shipped as an empty `<section>` and only
appeared after hydration — part of a measured **CLS 1.1689 → 0.7970** on `/promotions/*` (throttled phone profile).

The hook now reads `window.location.search` inside its effect. Nothing is lost: the params only
ever arrive on a fresh landing from the email CTA, the effect is client-only regardless, and the
URL cleanup already used `window.history.replaceState` rather than the router. The `firedRef`
single-fire latch is unchanged.

**A hook that calls `useSearchParams()` de-opts every caller.** Before adding one to anything that
`MembershipSection`, `PrizeShowcase` or another prerendered-page section calls, read
[shared-ui/rules.md R7](../shared-ui/rules.md) and the full incident writeup in
[shared-ui/gotchas.md](../shared-ui/gotchas.md).

## Payment modals must not boot Stripe at module scope (2026-07)

`StripePaymentModal/**` and `RenewalFailedModal/**` (the past-due renewal-recovery modal + `PastDueResolvePanel`) render Stripe Elements — same rule as every other payment surface: `getStripePromise()` must be called lazily inside the component (`useMemo(() => getStripePromise(), [])`), never at module scope. See [docs/payment/gotchas.md](../payment/gotchas.md) "Stripe boots on import" for the full incident + fix pattern. Lint-enforced by `eslint/rules/no-eager-stripe.js` (`internal-norm/no-eager-stripe`, severity `"error"`).

## Membership Streak counter — three invariants (2026-07-07, P1)

The streak counter (`subscription.streakMonths`/`streakGeneration`, see [models.md](./models.md)) is written at exactly two webhook points; breaking any of these reintroduces a replay/staleness bug:

1. **Never a bare `$inc` beside the renewal-cycle upsert.** The increment is gated on `upsertRenewalCycleFromPaidInvoice` returning `firstTimeSucceeded` (the `MembershipRenewalCycle` **pre-image** was absent/`expected`/`failed`). A StripeWebhookQueue redelivery sees a `succeeded` pre-image and no-ops. An unguarded `$inc` double-counts on every replay.
2. **The in-memory mirror is mandatory.** After each `User.updateOne` streak write, the handler also sets the value on the in-memory `user` doc. `handleInvoicePaymentSucceeded` calls `user.save()` later on several paths; Mongoose only writes *modified* paths, but any future code that marks the whole `subscription` subdoc modified (or replaces it) would persist a stale counter without the mirror.
3. **Upgrade activation and `handleSubscriptionDeleted` preserve the streak because they mutate `user.subscription` field-by-field.** Do NOT refactor either to replace the subdoc wholesale (`user.subscription = {...}`) — that silently zeroes `streakMonths`/`streakGeneration` (same class of bug as the `lastMonthAccumulatedEntries` preservation both blocks already do explicitly).
4. **API routes that DO replace the subdoc wholesale must spread `carryStreakAcrossSubscriptionReplace(prev)` into the replacement** (2026-07-15 fix; was a BLOCKER — the review found `create-subscription-existing-user` and `renew-subscription` wiping banked streaks). The helper makes the grace/reset decision IN-ROUTE from the OLD `endDate`, because these saves land before the webhook writer, which only ever sees the NEW endDate (it computes "continue" and preserves whatever the route wrote). Any new resubscribe/renew/replacement path must do the same. Tests: the `carryStreakAcrossSubscriptionReplace` block in `npm run test:streak`.
5. **A fully refunded counted renewal gives its +1 back** (`reverseMembershipLedger` in [refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)): the `MembershipRenewalCycle` row atomically flips `succeeded/recovered → refunded` (pre-image gate = idempotent across replayed refund events) and `streakMonths` decrements with a floor of 0. The walker only counts `succeeded/recovered`, so repair runs agree.

Drift repair: re-run `npm run backfill:membership-streaks` (recomputes from the ledger; re-runnable, dry-run default via `:dry`). **Repair runs must NOT pass `--roundup-incomplete`** — the veterans' round-up is launch-only (with `now` advancing, re-applying it credits pure calendar months, e.g. unpaid past-due stretches). The runner never regresses a live-written reset (skips when the live `streakGeneration` exceeds the computed one).

**Known drift sources (accepted P1, healed by the repair run — from the adversarial review):**
- `handleSubscriptionUpdated` does `markModified("subscription")` + `save()` from its own snapshot, and `customer.subscription.updated` processes concurrently with `invoice.payment_succeeded` (webhook queue has per-event claims, no per-user serialization) — a stale snapshot save can revert a just-committed streak `$inc`.
- A crash between the renewal-cycle upsert (row → `succeeded`) and the `$inc` loses that increment permanently (redelivery sees `succeeded` → no-op by design).
- Cancel-evidence caveat: the dominant cancel path writes `scheduled_cancel` history rows (the *click*, which precedes the lapse by up to a billing period); `canceled` rows exist only for immediate cancels. The walker therefore treats **both** statuses as evidence with a 40-day lookback before the previous paid cycle — do not "simplify" the query back to `canceled` only.
- Grace-continue depends on resubscribe detection (`STRIPE_SUBSCRIPTION_METADATA_IS_RESUBSCRIBE` metadata, or `!isActive` + preserved accumulated entries): a future resubscribe path that pre-activates the user *without* stamping the metadata would hard-reset an in-grace member. Stamp the metadata on any new resubscribe path.

## "Select your package" picker reopen loop killed conversions on /promotions (2026-07-07)

The `MembershipModal` package picker ([`PackageSelectionModal`](../../src/components/modals/PackageSelectionModal/index.tsx)) auto-reopened every time the user selected a plan **or** exited it — on `/promotions/[slug]` **only**, never the homepage — trapping users before payment. New-member conversions fell from ~9/12h to ~1/9h; the only payments still landing were auto-renewals (they bypass the UI), so it was a **silent** outage (no server error; `console.log` stripped in prod). Stripe filled with `incomplete` subscriptions, multiple tiers per customer seconds apart (each tier tap mints a sub via the creation effect ~L910). **Cause:** a newly-added re-arm block (`if (isOpen && !isPlaceholderPlan) packageSelectionAutoOpenedRef.current = false`) cleared the once-per-session auto-open latch after any real plan was selected, and the implicit `/promotions` auto-open branch was **not gated on `isPlaceholderPlan`** (its sibling config branch was) — so the cleared latch immediately reopened the picker on the next closed-picker render (produced by a pick or a dismiss; on this path dismiss doesn't close the modal because `configSelectionFirst` is false). **Fix:** removed the re-arm (latch now resets only via `!isOpen`) **and** gated the `/promotions` branch on `isPlaceholderPlan`, so an auto-reopen is structurally impossible once a plan exists. Full write-up + the invariant ("auto-open at most once per session, only while on placeholder; never re-arm on an in-session condition"): **[package-selection-first.md](./package-selection-first.md)**.

## Retention offers must be blocked for an already-scheduled-to-cancel member (2026-07-06)

The `accept_offer` route (`/api/subscription/cancellation-flow`) never re-validates the offer against the server-side eligibility filter — the filter is **advisory (drives the UI only)**. So the per-service block-reason guards (`retentionPauseBlockReason` / `retentionDiscountBlockReason`) are the *entire* backend gate at accept time. They previously checked only past-due / already-consumed / no-sub. **Gap:** a member already scheduled to cancel (`autoRenew` off, `cancel_at_period_end` true) who reaches `accept_offer` (UI-gated on every surface, but reachable via a stale-two-tab race or a direct authenticated POST) would get a pause/discount that Stripe silently overrides by cancelling at period end — recording a false `outcome: "saved"`. Same class as the upgrade/downgrade "didn't clear the pending cancel" bug. **Fix:** both guards now return `409 "scheduled to cancel: retention {pause,discount} not allowed"`; the member un-cancels via the explicit dashboard **"Resume membership"** button instead. Guard chosen over silently clearing the cancel — a retention offer is for members still *deciding*, and Resume is the deliberate un-cancel path. Unit-tested (`test:retention-pause`, `test:retention-discount`).

## Retention pause — the app owns the `paused` state (Stripe stays active)

The 30-day `pause_30d` retention offer produces a real DB state: `subscription.status = "paused"` + `isActive = false` across `[pausedFrom, pausedUntil)` (see [backend.md → RetentionPauseService](./backend.md#retention-pause-the-paused-membership-state)). The trap is that **Stripe keeps the subscription `status:"active"` during a `pause_collection`** — so the app, not Stripe, owns the `paused` state, and the webhook must not let a routine Stripe update clobber it:

- **The flip is app-driven and guarded.** `handleSubscriptionUpdated` sets `paused` only when the update is a retention pause (`pause_collection != null && metadata.pauseReason === "retention"`) AND the freeze window has begun (`now >= pausedFrom`). Its else-branch active-restore is guarded with **`prevSubStatus !== "paused"`** — without that guard, the next Stripe `customer.subscription.updated` (which still reports `status:"active"`) would flip a frozen member straight back to `active`, un-freezing them mid-window. Before the window (still inside the paid period) the pause branch is false, so a normal active update flows through untouched.
- **Benefits return ONLY after a successful resume payment.** At `pausedUntil` Stripe auto-resumes and bills; `handleInvoicePaymentSucceeded` restores `paused → active` and clears `pausedFrom`/`pausedUntil` on the paid resume invoice (a paused member's only paid invoice — the void pause discards the rest). A FAILED resume charge stays `past_due` — do NOT add any path that flips `paused → active` (or restores benefits) without a settled payment. The webhook's past-due restore branch is likewise gated `prevSubStatus !== "paused"` so a failed resume can't flicker active.
- **The cron is the backstop, not the driver.** The [`cancellation-retention-resume` cron](../infrastructure/api.md#cancellation-retention-resume-cron) also flips `active→paused` (at `pausedFrom`) and restores from `paused` (when Stripe already resumed) — but only catches events the webhook missed; it is idempotent and Stripe-truth-based.
- **Earned entries are untouched.** A paused member keeps every entry they already accrued (they were paid for); only NEW accrual is suspended (no paid renewal invoice while `behavior:"void"`). Do not add entry freezing/exclusion — that was explicitly rejected.

## Money path

### Past-due tier switch = cancel + void → resubscribe (never proration) (2026-07-03)

A `past_due` member who wants a **different** tier cannot be upgraded/downgraded in place. Reactivation (`renew-subscription` → `retry_payment`) pays the overdue invoice on the **same** tier, and `reactivate` is same-tier-only — both because a proration swap on a live subscription spawns a granting `subscription_update` invoice (the $0-trial-guard footgun). So switching tiers while past-due is modelled as a **teardown + fresh subscribe**:

- Service: [`abandonPastDueForTierSwitch(user)`](../../src/services/subscription/switchTierPastDue.ts) — asserts `subscription.status === "past_due"` (throws `NotPastDueError` otherwise; this immediate-cancels, so it must NEVER run on an active sub), calls `cancelSubscription` (auto-immediate for past-due → `status:"canceled"`, `isActive:false`, partner queue ended, `lastMonthAccumulatedEntries` preserved), then **voids every open/uncollectible invoice** on the sub via `stripe.invoices.list({subscription,status})` + `voidInvoice`. Void is best-effort and runs **after** cancel (so no dunning retry races it).
- Route: [`POST /api/stripe/switch-tier-past-due`](../../src/app/api/stripe/switch-tier-past-due/route.ts) — no body; the teardown is target-agnostic and the client enforces "different tier" (a same-tier tap resolves payment instead).
- Client: [`PastDueTierSwitchModal`](../../src/components/sections/account-membership/PastDueTierSwitchModal.tsx) confirms → POSTs → on success the membership page invalidates the account/dashboard queries (so the subscribe flow sees `canceled`, not stale `past_due`) and opens the normal `MembershipModal` subscribe for the new tier.

**Why no spurious grant:** cancel + void emit only `customer.subscription.deleted` + `invoice.voided` — never `invoice.payment_succeeded`. The single intended grant is the new subscription's own `subscription_create` invoice (which the webhook also detects as a resubscribe → carries over accumulated entries + applies the live promo). Do NOT "optimise" this into a proration swap on the existing sub.

**Reconcile against LIVE Stripe status before the irreversible cancel (2026-07-04).** The stored DB status lags the webhook queue, so the teardown must not trust it blindly — otherwise a dunning retry that already recovered the sub (Stripe `active`, webhook not yet applied) would get its just-paid membership immediately canceled. `abandonPastDueForTierSwitch` now: (a) local `canceled` → no-op `alreadyClosed` (idempotent for a retried POST after a lost response); (b) resolves the **live** Stripe sub — status `past_due`/`unpaid` → tear down; recovered (`active`/…) → throw `SubscriptionRecoveredError` (409 `SUBSCRIPTION_RECOVERED`, never cancel a paid sub); `NO_ACTIVE_SUBSCRIPTION` (dunning-exhausted cancel not yet webhooked) → sync DB `canceled` + return `alreadyClosed` (no more 400-loop). The route accepts `past_due` **or** `canceled` so the idempotent retry reaches the service. The invoice-void loop is per-invoice best-effort (one transient failure never aborts the rest).

**Freeze-gate the switch + recovered-race UX (2026-07-04, flow verification).** The switch is a resubscribe (new purchase), so both the client tap (`whenGatesOpenElseGateModal`) and the server route (`enforceMajorDrawOpenForNewPurchasesOr403`) now gate it on the major-draw freeze — otherwise a freeze would let the irreversible teardown run while the follow-on resubscribe 403s, stranding the member in `canceled`. And the recovered-race (409 `SUBSCRIPTION_RECOVERED`) no longer dead-ends in a red error box: `PastDueTierSwitchModal` detects the code and calls a new `onRecovered` prop → the page invalidates `users.detail` + closes, refreshing into the resolved active state. Separately, `SubscriptionManagementModal` (the active up/down-grade confirm) in `confirmOnly` mode now shows a spinner while benefits load and calls `onClose()` if the benefits fetch fails (was a silent invisible stuck modal — `changeTierName` never reset).

### Past-due members CAN buy one-time / Additional packs — only subscriptions are blocked (2026-07-03)

`useMembershipCardCta.onSelect` bounced **every** tap to `/my-account` for a past-due member (`if (hasBlockingSub && isPastDue) router.push(...)`). That was over-broad: a past-due member can't start a second *subscription*, but a **one-time / Additional pack is a standalone purchase** (no subscription conflict — the `useMajorDrawEntryCta` "Get more entries" flow already allows it via `getOneTimePlan`). The guard is now scoped `&& isSubscriptionPlan(plan)`, so a one-time/Additional pack tap opens the purchase modal while subscription taps still route to `/my-account` (resolve/switch first). Pairs with the dashboard showing member (Additional) packs — see [dashboard-account/frontend.md](../dashboard-account/frontend.md).

> **Both surfaces scoped (2026-07-04):** the ultra review found the identical guard in the shared `MembershipSection.tsx` (the public `/membership` "one-time" tab, used across 15+ pages) was left unscoped, so a past-due member tapping a one-time pack there was still bounced. `MembershipSection.handlePlanSelect` now applies the same `&& isSubscriptionPlan` scope, so the dashboard and public surfaces behave identically. Also: [`tier-visuals.ts`](../../src/utils/membership/tier-visuals.ts) now exports a canonical `PAST_DUE_AMBER` (`#d97706`) consumed by the past-due JS `style`/color usages (dashboard hero theme, PartnerPreview, RewardsPartnerCard, tier-list border) — the amber's single source of truth.

## UI / modals

### RenewalFailedModal dark mode was half-done (dark bg, dark text)

The "Complete your renewal payment" modal ([RenewalFailedModal](../../src/components/modals/RenewalFailedModal/)) had `dark:bg-*` overrides on the Shell/panels (body went near-black in dark mode) but the **text colours had no `dark:` variants** (`text-neutral-900`, `text-neutral-500`, etc.) and the main Stripe `PaymentElement` used a **hardcoded light** appearance (`colorBackground:#ffffff`, `colorText:#1f2937`). Result in dark mode: dark body + dark labels (and dark Stripe field labels) → invisible; only the white inputs showed (contrast ~1.08). Fix = **complete** dark mode, don't force light:
- Add `dark:` light-text variants to every label across `Shell`, `PaymentMethodPicker`, `PaymentForm`, `InlineCardSetup`, `AlertBanner`, `ActionButtons`, and the index alert boxes (e.g. `text-neutral-900 dark:text-neutral-100`, `text-neutral-500 dark:text-neutral-400`).
- Swap the main card form's hardcoded light appearance for the theme-aware `buildMembershipStripeAppearance(isDarkMode)` (already used for the inline card-setup path) so Stripe renders its `night` theme in dark mode.
- **Derive `isDarkMode` from `useHtmlDarkForUi()` (the actual `.dark` class on `<html>`), NOT `useThemeStore`.** They can disagree — the `<html>` class is set by the bootstrap in `layout.tsx` (incl. a time-based Sydney-night fallback) and by AdminThemeContext, while `useThemeStore.theme` defaults to `"light"`. Wiring the Stripe appearance to the store left the `PaymentElement` rendering its **light** theme (white inputs, invisible labels) inside a dark-classed modal. The HTML around it was already dark via Tailwind `dark:` — only the Stripe iframe was out of sync.
- Keep the dark backgrounds — the modal is meant to be dark in dark mode. When adding UI here, always pair a text colour with its `dark:` variant.

## Stripe & invoices

### `list({ status: "trialing" })` leaks `incomplete` subs → false "Existing Subscription" block

**Symptom:** a user who is *not* an active member is permanently blocked from subscribing. The checkout shows two toasts — **"Existing Subscription"** and **"Active Subscription Found"** (both the `EXISTING_SUBSCRIPTION` 409) — and "Manage Subscription" leads nowhere because `/my-account` shows them as unsubscribed.

**Cause:** the resubscribe guard `stripeCustomerHasManageableSubscription` (→ `findRecoverableSubscriptionForCustomer`) used to trust Stripe's `subscriptions.list({ status })` filter. Stripe's `status: "trialing"` filter **also returns subscriptions that merely have a future `trial_end`, even when the object's own `.status` is `incomplete`.** Anchor billing produces exactly this shape for joins on the 25th–27th: `trial_end` set ([anchor-billing.ts](../../src/utils/billing/anchor-billing.ts)) + `payment_behavior: "default_incomplete"` + an unpaid initial `add_invoice_items` charge → the subscription sits at `incomplete` with a future `trial_end`. So an **abandoned checkout** was mis-classified as a live "trialing" membership and blocked all future attempts. Verified live: `retrieve(sub).status === "incomplete"` while `list({status:"trialing"})` returned that same sub.

**Fix:** `findRecoverableSubscriptionForCustomer` now re-validates each returned sub's own `.status` with `isManageableStripeSubscriptionStatus()` before treating it as recoverable — the query filter is advisory only ([SubscriptionReferenceService.ts](../../src/services/subscription/SubscriptionReferenceService.ts)). This fixes both call sites at once: the resubscribe guard *and* the cancel-recovery path (`resolveCancellableStripeSubscription`). Regression test: `npm run test:find-recoverable-subscription`.

**Rule of thumb:** never trust Stripe's `subscriptions.list({ status })` filter as proof of a subscription's status — always check the returned object's `.status` field. The two can disagree for trial + incomplete combinations.

**Now also addressed:** the remaining follow-ups from this fix have since been closed. The new `cancelIncompleteSubscriptionAndVoidInvoice` helper ([cancelIncompleteSubscription.ts](../../src/services/subscription/cancelIncompleteSubscription.ts)) cancels the stale sub and voids its open initial invoice (best-effort, idempotent). Both create-subscription routes call it at-source to retire the user's `pendingStripeSubscriptionId` before creating a new sub, preventing abandoned `incomplete` checkouts from accumulating (see [billing-stripe/gotchas.md](../billing-stripe/gotchas.md#resubscribe-retires-the-stale-pending-incomplete-sub)). The `cleanup-abandoned-incomplete-subscriptions` backfill script (`npm run cleanup:abandoned-incomplete:dry` / `cleanup:abandoned-incomplete`) sweeps any that already exist in Stripe and repairs or clears dead `stripeSubscriptionId` pointers. Finally, the MembershipModal background pre-warm no longer raises an `EXISTING_SUBSCRIPTION` toast — only the single actionable "Active Subscription Found" toast on purchase click remains.

### Pause-collection orphans

When a renewal fails we set `pause_collection: { behavior: "keep_as_draft" }`. If `resumeAfterSuccessfulRenewalPayment()` doesn't run on the matching success event, the subscription stays paused — and **subsequent cycle invoices stay draft, never finalize, never charge**. The user appears to be active in our DB but Stripe never bills them.

**The clear is gated on a pause actually existing (2026-08-24).** `decideClearPause` in
`pauseCollectionPolicy.ts` short-circuits to `false` when `subscription.pause_collection == null`, so
the decision is now exactly `pauseCollectionPresent && pauseReason !== "retention"`. Before that, a
plain `subscription_cycle` renewal satisfied the disjunction on its own and we issued
`subscriptions.update(… pause_collection: "")` for **every** renewing member, almost none of whom were
paused — one wasted `/v1/subscriptions` write per renewal, on the endpoint that hit Stripe's 25 req/sec
cap during the 23 Aug burst. Behaviour for a member who *is* paused is unchanged: same code path, same
ordering, still before benefits. This narrows the orphan risk rather than widening it — the write we
removed could only ever have cleared a pause that was not there. `resumeAfterSuccessfulRenewalPayment`
itself is unchanged and still safe to call unconditionally from the admin / retry paths.

Causes seen in production:
- Slow `processPaymentBenefits()` path — long DB writes for entry accumulation. **Fix**: resume runs *before* benefits.
- Stripe CLI / proxy timing out the webhook HTTP response. **Fix**: same — resume early so even a timed-out response leaves Stripe in the right state.
- Admin past-due charge succeeding but resume call erroring. The error is captured into `result.pauseCollectionResumeError` and surfaced in the API row's `resumeCollectionError` field for support visibility.

Audit script (dry-run by default, CSV to stdout):

```bash
npx tsx scripts/list-active-paused-subscriptions.ts --limit=200
```

To clear from the script after reviewing:

```bash
npx tsx scripts/list-active-paused-subscriptions.ts --live --resume --limit=50
```

Manual fix: Stripe Dashboard → Customer → Subscription → **Resume collection**. Then verify the right invoice is `open` or `paid` and finalize drafts only when appropriate.

### "Missing" invoice while paused

With `keep_as_draft`, newer cycle invoices stay **draft** until collection resumes. Tools that only list **open** invoices (admin previews, certain payment-flow selectors) won't see the draft. Always check the Stripe Dashboard's Invoices view including draft status.

Failed-payment flows prefer an **open**, chargeable subscription invoice over relying solely on `latest_invoice` (which may be a newer draft). See [src/utils/payment/failed-invoice-selection.ts](../../src/utils/payment/failed-invoice-selection.ts) and [src/utils/payment/failed-invoice-handler.ts](../../src/utils/payment/failed-invoice-handler.ts).

### Don't expand `latest_payment_intent`

On Stripe API `2025-05-28.basil` (current), retrieving an Invoice with `expand: ['latest_payment_intent']` returns:

> `This property cannot be expanded (latest_payment_intent)`

Use `expand: ['payment_intent']` instead. The invoice JSON may still include `latest_payment_intent` as an id — retrieve the PaymentIntent separately if needed.

### Past-due with `cancel_at_period_end: true`

When a subscription is `past_due` AND has `cancel_at_period_end: true`, the situation is ambiguous:

- The user has signalled they want to cancel at period end.
- But payment has failed; there's no current period to "preserve."

Resolution in `cancelSubscription()`: **immediate cancel wins**. The past-due check fires first (`shouldCancelImmediately = isPastDue || !cancelAtPeriodEnd`), regardless of the requested option. The user loses access now; no charge happens.

## Admin dashboard analytics

### Dashboard cancellation revenue must come from the same cohort as the count

The "Cancellations" KPI card on the admin dashboard shows two values that **must** describe the same cohort:

- **Count** (`users.cancelledMemberships`): number of users whose `subscription.cancelledAt` falls in the selected range (delta), or — for `all-time` — number of users with a standing scheduled cancellation (stock).
- **"Est. membership revenue at risk"** (`users.cancellationImpact.estimatedMonthlyRevenue`): sum of package prices for those same users.

[`MembershipAnalyticsService.getAnalyticsBundle()`](../../src/services/admin/MembershipAnalyticsService.ts) always derives the revenue by iterating `cancellationRows` (the exact users that produced the count) and summing `getPackageById(packageId).price`. **Never** source this revenue from `MembershipDailySnapshot` / `getMembershipByPackageSnapshot()`: the snapshot's `cancelledCount` per package is the **standing** scheduled-cancel total as of that day (i.e., a stock value), so combining it with a delta count produces a wildly inflated revenue figure for a different (much larger) cohort.

The original snapshot-revenue path violated this invariant and shipped — for "Yesterday" with 38 cancellations it reported ~$16,580 (the entire ~470-user scheduled-cancel stock × price), not the ~$1.3k actually attributable to those 38 users. Smell test: divide revenue by count; it must land within the package price range ($35–$200ish). If it's much higher, something is mixing stock with delta.

## Cancel flow

### Admin cancel edge cases

(Migrated from former `docs/ADMIN_CANCEL_SUBSCRIPTION.md`.)

The cancel button must appear when the user has either:
- `subscription.isActive === true`, **or**
- `subscription.status === "past_due"`

Past-due users have `isActive === false` in our DB (set by the Stripe webhook on payment failure) but still have a live Stripe subscription that can — and should — be cancelled. Including `past_due` in the visibility rule lets admins clean up failed subscriptions.

Hidden when:
- No Stripe subscription on the user
- Status is already `canceled`
- Status is `incomplete` / `incomplete_expired`

### Repair on cancel — the user's id changes mid-call

When `User.stripeSubscriptionId` points to a dead sub but the customer has a manageable sibling, `resolveCancellableStripeSubscription()` mutates the user object in-memory: `user.stripeSubscriptionId = recovered.id`, then `markModified('subscription')` and `save()`.

If the cancel API path fails downstream, the repaired id is **already saved**. This is intentional — even if the cancel itself fails, the canonical id is now correct, so the next attempt won't need the repair pass.

### Cancel when only `stripeCustomerId` exists

User has `stripeCustomerId` but no `stripeSubscriptionId` (the canonical was already cleared). `resolveCancellableStripeSubscription()` searches the customer for a manageable sub. If none → `NO_ACTIVE_SUBSCRIPTION` (400). If one → repair-and-cancel.

Result: even users with broken canonical references can still cancel through the normal path, as long as a real sub exists somewhere on their customer.

## Resubscribe / continuity

### Resubscribe entries continuity

(Migrated from former `docs/SUBSCRIPTION_RESUBSCRIBE_ENTRIES.md` — _TODO: verify the full doc content; root file should be re-read and merged here in a refresh pass._)

`subscription.lastMonthAccumulatedEntries` survives cancellation. When a previously-cancelled user resubscribes, the new subscription picks up that count for the first renewal cycle's calculation — preventing accidental zeroing of accumulated entries.

The cancel service intentionally preserves this field; see the comment at [CancelSubscriptionService.ts:136-140](../../src/services/subscription/CancelSubscriptionService.ts#L136-L140).

**UI exposure (Phase 1, 2026-05-20):** the backend has always accepted *any* `packageId` via `POST /api/stripe/create-subscription-existing-user`, and `calculateResubscribeEntries` correctly preserves `lastMonthAccumulatedEntries` regardless of which tier the member picks on the way back. Until 2026-05-20 the UI restricted cancelled users to a single "Reactivate same tier" CTA; the new `ResubscribeTierPicker` (see [frontend.md → Resubscribe tier picker](./frontend.md#resubscribe-tier-picker-phase-1-2026-05-20)) now exposes the existing backend capability so members can resubscribe to a higher or lower tier and still keep their accumulated-entries carry-over.

### Reactivate button gating is looser than backend reactivate eligibility (known edge)

The "Reactivate" / "Resume" button in `SubscriptionManagementModal` (`CancelResumeRow.tsx`, `SettingsRedesignSubscription.tsx`) renders purely on the DB-derived flag **`isCancelled = !user.subscription.autoRenew && user.subscription.isActive`** ([benefits/route.ts:45](../../src/app/api/subscription/benefits/route.ts#L45)). It does **not** inspect the live Stripe `cancel_at_period_end` / `cancel_at` / 30-day grace window.

In **normal app flows this is correct** — `!autoRenew && isActive` is exactly the *scheduled-cancellation-but-still-in-grace* state, and the button correctly hides for: fully-lapsed (`isActive=false` → resubscribe picker), past-due with auto-renew on (`hasFailed` hides the manage block → "Pay Now"), normal active/trialing (`autoRenew=true` → "Cancel"), and retention-paused (the pause flow never sets `autoRenew`, so it stays `true` → button hidden).

**But because it's a DB-flag heuristic, the affordance is looser than what the backend will honor.** `renew-subscription` only derives `renewalStrategy:"reactivate"` when the *live* Stripe sub has `cancel_at` non-null and is within a 30-day grace window ([renew-subscription/route.ts:160-206](../../src/app/api/stripe/renew-subscription/route.ts#L160)). So any state that reaches `autoRenew=false && isActive=true` by another path shows the button but may **not** perform a free uncancel on click:

| Edge state (`autoRenew=false`, `isActive=true`) | Click consequence |
|---|---|
| **Admin sets `autoRenew=false`** via the user-edit route ([admin/users/[id]/route.ts:795-801](../../src/app/api/admin/users/[id]/route.ts#L795)) with no real Stripe cancellation | backend finds no `cancel_at` → falls to `create_new` → **charges a full new membership** (only edge with a real money consequence) |
| DB/Stripe **drift** or `cancel_at` null / grace elapsed | `create_new` (full charge) |
| Stale DB vs live **`past_due`** | `retry_payment` → charges the overdue invoice |
| **No saved payment method** | backend returns `requiresSetupIntent`; the client setup-intent modal is an unimplemented TODO ([index.tsx:640](../../src/components/modals/SubscriptionManagementModal/index.tsx#L640)) → dead-ends |

**Status: accepted/known, not a live production problem** — the in-app paths that set `autoRenew=false` (the Cancel button, `update-auto-renew`, and the Stripe-side cancel webhook) all produce a *genuine* scheduled cancellation that the backend reactivates correctly; the surprise-charge edges require an admin edit or flag drift. If revisited, two minimal fixes: (1) compute `isCancelled` from the live Stripe sub in `benefits/route.ts` (collapses the affordance onto the exact backend condition), or (2) have the backend return a distinct "cannot reactivate — please resubscribe" error instead of silently falling to `create_new`.

### Cancelled-membership comeback promo

There is a separate flow that targets cancelled members with a comeback promo. See the [promo](../promo/) domain — specifically the migrated `CANCELLED_MEMBERSHIP_COMEBACK_PROMO.md` content (will land in `docs/promo/gotchas.md` when that domain is bootstrapped).

The cancel service does **not** know about the promo flow. The promo is triggered by a separate Klaviyo / cron path that watches `MembershipStatusHistory` for `canceled` rows.

## Anchor billing

(Migrated from former `docs/BILLING_ANCHOR_24.md`.)

### Why the 24th?

Members who join on the 25th, 26th, or 27th get anchored to renew on the **24th** of each month. The reason: at least 3 days to recover from a failed renewal before the major-draw window (28th–27th). If renewal fails on the 27th, that's the same day major-draw eligibility freezes — too late.

### Migration must skip `cancel_at_period_end`

The migration script `scripts/migrate-anchor-billing-24.ts` *never* migrates subs with `cancel_at_period_end === true`. Touching `trial_end` or `proration_behavior` could re-charge them or extend access past their chosen end date. The script logs `skip_cancel_at_period_end` and moves on.

### How to run the migration

```bash
# Dry run first (no Stripe updates)
npm run migrate:anchor-billing-24:dry

# Live with optional limit
npx tsx scripts/migrate-anchor-billing-24.ts --limit=50
```

Logs every subscription with `subId`, `customerEmail`, `oldAnchorDay`, `newAnchorDay`, `action` for cross-referencing in DB and Stripe Dashboard.

### `createAESTDateAsUTC` returns Invalid Date (NaN) on overflow days

`createAESTDateAsUTC` (and related AEST date helpers) return an Invalid Date when given a day that doesn't exist in the target month (e.g. day 31 in a 30-day month). Always **clamp to the last day of the month first** — use `daysInMonthUTC(year, month)` from `src/utils/billing/anchor-billing.ts` — before constructing the date. The past-due reanchor rule does this via `clampReanchorDay`. Failing to clamp will silently produce a `NaN` timestamp that passes through to Stripe as a bad value.

### Stripe does NOT reject a past `trial_end` — it charges immediately

When you call `stripe.subscriptions.update(id, { trial_end: <timestamp> })` and the timestamp is in the past, Stripe **does not return an error** — it ends the trial immediately and charges the customer right away. The past-due reanchor code **future-floors** the computed `trial_end`: if the computed reanchor date is not strictly in the future, the reanchor is aborted non-fatally. Never pass a non-future `trial_end` when the intent is "schedule next renewal", not "charge now".

## Frontend

### Client-derived `isActive`

Components must read `subscription.isActive` from the user object. Computing it client-side as `subscription.endDate > now()` is wrong because:
- Past-due subs have `isActive: false` but `endDate` may still be in the future.
- Scheduled-cancel subs have `cancel_at_period_end: true`; the period end is in the future but the user's intent is to end.
- Trialing subs may have no `endDate` set yet.

Always trust the server-set `isActive` flag.

### Optimistic cancel — don't

The cancel API has multi-step side effects (Stripe → Mongo → partner queue → Klaviyo → analytics). An optimistic UI update assuming success will desync if any step fails (Stripe rate limit, network blip, etc.). Wait for the API result and invalidate the relevant TanStack Query keys.

## Logging / support

- Admin charge rows store payment success in `InvoiceChargeLog` (see [billing-stripe](../billing-stripe/)). If pause-collection resume fails, `result.pauseCollectionResumeError` is set and surfaces as `resumeCollectionError` in the API row.
- Don't log full payment-method or card data. Subscription IDs, invoice IDs, and customer IDs are sufficient for support.
- For genuine errors that must survive production builds, use `console.error` (not `console.log`/`info`/`debug`/`warn` — those are stripped by Next.js per CLAUDE.md).

## Public T&C page — keep in lockstep

The customer-facing Terms & Conditions page lives at [src/app/(site)/terms/page.tsx](../../src/app/(site)/terms/page.tsx) (static JSX, no logic) and is registered under the **subscription** domain because its substantive clauses restate subscription/billing rules. When you change any of the following, the matching T&C clause must be updated in the same task or it becomes a false contractual statement:

- **Anchor billing** (§4 "Billing Exception") — the join-day → 24th anchor rule. The page deliberately says the *initial charge is at purchase* and only the *recurring renewal* moves to the 24th; it does NOT say "you will be charged on the 24th instead" (that wording was factually wrong — see [Anchor billing](#anchor-billing)).
- **Cancellation timing** (§6) — must keep the [R2 past-due cancels immediately](./rules.md) carve-out reflected.
- **Entry restoration** (§5.10) — there is **no code** implementing suspension/reactivation entry restoration. The clause is intentionally written as a fully discretionary, no-SLA manual policy (no 90-day / 7-day / 48-hour / "2 suspensions in 12 months" timers). Do not re-introduce hard timers into the T&C unless a real mechanism is built. The only 90-day window in code is the unrelated cancellation save-offer retention-analytics cron.
- **Package tiers** (§3) — Mini-draw packs are a **viewer swap**, not a flat list ([getMiniDrawPackagesForViewer](../../src/data/miniDrawPackages.ts)). The split is driven by [`hasAdditionalPackageAccess`](../../src/utils/membership/has-additional-package-access.ts) = *active subscription **OR** any current Major Giveaway entries* — **NOT** membership-exclusive (the `additional-*-pack-mini` records are flagged `isAdditional` in data but the access gate was deliberately broadened; the util comment notes they were `previously "member-only"`). So a One-Time Package buyer with current draw entries also sees the Tradie/Foreman/Boss/Power/VIP (Mini Draw) tiers; users with no current draw entries see Mini Pack 1–3. Do not describe these as "member-only/member-exclusive" in the T&C — that would be a false statement. Mini Pack 4–8 were deactivated 2026-05-14. If the active catalog in `src/data/miniDrawPackages.ts` / `membershipPackages.ts` or the access rule changes, update §3/§5/§17.

Open legal item (not a code issue): "non-refundable once purchased" (§4) vs. the Australian Consumer Law savings clause (§11) is a lawyer review item, behaviourally consistent with code (no proration/refund on cancel) but not an enforced rule.

## Upgrade Order Summary says "Charge today", not "Prorated" (2026-07-03)

The upgrade payment modal's [`OrderSummary`](../../src/components/modals/StripePaymentModal/OrderSummary.tsx) row is labelled **"Charge today"** — it used to say "Prorated charge today", which is factually wrong: upgrades run with **`proration_behavior: "none"` + `billing_cycle_anchor: "now"`** ([upgrade route](../../src/app/api/stripe/upgrade-subscription-payment/route.ts); BUSINESS.md §10c), i.e. the member is charged the **full** new-tier price today and the cycle resets to now — there is no proration. Don't reintroduce "prorated" wording in the upgrade/downgrade UI. (The generic `ConfirmationModal` still has a `details.proration` block with "Prorated Amount Today"/"Prorated Entries", but that modal is used by admin/payment-delete surfaces, not the member upgrade flow.)

## Past-due reanchor — `attempt_count` is not a reliable dunning signal under `pause_collection`

When a renewal fails, the app sets `pause_collection: { behavior: "keep_as_draft" }` on the subscription. This **blocks Stripe's automatic retry scheduler** — Stripe does not re-attempt the invoice while collection is paused. As a result, a manually recovered invoice (admin charge, user Pay-Now, renew-subscription retry) still has `attempt_count === 1`, even though the member genuinely was past-due.

The reanchor gate (`shouldReanchorAfterRecovery` in `pauseCollectionPolicy.ts`) therefore does **not** rely on `attempt_count > 1` as its primary dunning signal — it is kept only as belt-and-suspenders for the rare no-pause edge. The **primary durable signal** for the `renew-subscription` recovery channel is the `invoice.metadata.dunning_recovery === '1'` marker, stamped on the invoice by `handleInvoicePaymentFailed` at the moment the renewal first fails. This marker survives channel-independently (it is set on the invoice object itself and is not cleared when DB status or `pause_collection` is updated).

See `docs/PAST_DUE_REANCHOR.md` for the full trigger-gate logic and channel analysis.

## /terms and /competition-term-majordraw are marketing-class static pages (2026-07-19)

Both legal pages render static/ISR under the no-nonce CSP variant (see docs/security-csp/architecture.md "Route classes") — their `getNonce()` calls were removed (JSON-LD is non-executable data and needs no nonce). Do not add `headers()`/`cookies()`/session reads to them; that silently flips them dynamic.

## The upgrade flow's confirm + payment steps were unreadable in dark mode (2026-08-06)

The `SubscriptionManagementModal → UpgradeConfirmModal → StripePaymentModal` path shipped
light-only UI on a dark surface at the moment the member commits to a paid upgrade. Worst of
it: the **Order Summary panel rendered as a solid white card while its own labels themed
correctly to light-grey** — so "Current plan / Upgrading to / Charge today" and the price were
effectively invisible on the final confirm step. The "Cancel" button beside "Pay $X" was a
solid white pill for the same reason.

Root causes were plain CSS, not the Stripe `appearance` plumbing that looks guilty here —
`ui/Card` and `ui/Button` had no `dark:` tokens, and four upgrade components paint tier
accents through inline `style={{ color }}`, which `dark:` cannot reach. Full write-up,
including the theme-source hypothesis that was investigated and **refuted**, lives in
[shared-ui/gotchas.md](../shared-ui/gotchas.md) — read it before touching tier colours in
these modals.

Practical rule for this flow: the confirm modal is effectively always-dark (its
`styles.module.css` hardcodes `#0a0a0a`/`#141416`), so anything you add inside it must be
styled for a dark surface, and tier ink should come from **`--tier-color-deep`** — which now
has a dark value in the `:global(.dark) .scrollFrame[data-tier=…]` blocks of **both**
`UpgradeConfirmModal/styles.module.css` and `DowngradeConfirmModal/styles.module.css`.

_(Corrected 2026-08-06. This previously said the opposite — use `--tier-color`, avoid
`--tier-color-deep` — which was true only while the dark blocks omitted the ink variable.
Following the old advice now paints the BRIGHT stop (#00c2ed / #ffd200 / #ee0000) beside
existing deep-ink glyphs on the light frame, visibly mismatched. `--tier-color` remains the
right token where you specifically want the bright accent.)_

**Only those two stylesheets were fixed.** `PackageDetailModal/styles.module.css`,
`ReferFriendModal/styles.module.css` and `SubscriptionExplainerModal.tsx` still define
`--tier-color-deep` light-only, so the original caveat still applies there.
