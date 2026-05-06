# Subscription — Gotchas

Real failure modes, surprising behaviours, and tribal knowledge from incidents. Most of these came from production bugs and have lessons attached.

## Stripe & invoices

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
