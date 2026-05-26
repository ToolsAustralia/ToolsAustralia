# Subscription — Gotchas

Real failure modes, surprising behaviours, and tribal knowledge from incidents. Most of these came from production bugs and have lessons attached.

## UI / modals

### RenewalFailedModal dark mode was half-done (dark bg, dark text)

The "Complete your renewal payment" modal ([RenewalFailedModal](../../src/components/modals/RenewalFailedModal/)) had `dark:bg-*` overrides on the Shell/panels (body went near-black in dark mode) but the **text colours had no `dark:` variants** (`text-neutral-900`, `text-neutral-500`, etc.) and the main Stripe `PaymentElement` used a **hardcoded light** appearance (`colorBackground:#ffffff`, `colorText:#1f2937`). Result in dark mode: dark body + dark labels (and dark Stripe field labels) → invisible; only the white inputs showed (contrast ~1.08). Fix = **complete** dark mode, don't force light:
- Add `dark:` light-text variants to every label across `Shell`, `PaymentMethodPicker`, `PaymentForm`, `InlineCardSetup`, `AlertBanner`, `ActionButtons`, and the index alert boxes (e.g. `text-neutral-900 dark:text-neutral-100`, `text-neutral-500 dark:text-neutral-400`).
- Swap the main card form's hardcoded light appearance for the theme-aware `buildMembershipStripeAppearance(isDarkMode)` (already used for the inline card-setup path) so Stripe renders its `night` theme in dark mode.
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
- **Package tiers** (§3) — Mini-draw packs are a **viewer swap**, not a flat list ([getMiniDrawPackagesForViewer](../../src/data/miniDrawPackages.ts)). The split is driven by [`hasAdditionalPackageAccess`](../../src/utils/membership/has-additional-package-access.ts) = *active subscription **OR** any current Major Giveaway entries* — **NOT** membership-exclusive (the `additional-*-pack-mini` records are flagged `isMemberOnly` in data but the access gate was deliberately broadened; the util comment notes they were `previously "member-only"`). So a One-Time Package buyer with current draw entries also sees the Tradie/Foreman/Boss/Power/VIP (Mini Draw) tiers; users with no current draw entries see Mini Pack 1–3. Do not describe these as "member-only/member-exclusive" in the T&C — that would be a false statement. Mini Pack 4–8 were deactivated 2026-05-14. If the active catalog in `src/data/miniDrawPackages.ts` / `membershipPackages.ts` or the access rule changes, update §3/§5/§17.

Open legal item (not a code issue): "non-refundable once purchased" (§4) vs. the Australian Consumer Law savings clause (§11) is a lawyer review item, behaviourally consistent with code (no proration/refund on cancel) but not an enforced rule.
