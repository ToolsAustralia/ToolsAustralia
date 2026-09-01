# Subscription — Architecture

## What this domain does

Owns the full lifecycle of a member's subscription:

1. **Signup** — checkout → Stripe `customer.subscription.created` → User record gains `subscription` field.
2. **Renewal** — Stripe `invoice.payment_succeeded` (`billing_reason: subscription_cycle`) → benefits applied for next month.
3. **Failure recovery** — `invoice.payment_failed` → `subscription.status = past_due`, optionally Stripe `pause_collection`.
4. **Cancellation** — user or admin → `cancel_at_period_end` (default) or immediate; partner-discount queue, Klaviyo, analytics rows updated.
5. **Resubscribe** — cancelled user resigns; `lastMonthAccumulatedEntries` is preserved for continuity. The cancelled empty state in `SubscriptionManagementModal` renders a tier-picker grid (`ResubscribeTierPicker`), so members can pick any tier (not only their previous one) — the entry-carry-over math is unchanged. See [frontend.md → Resubscribe tier picker](./frontend.md#resubscribe-tier-picker-phase-1-2026-05-20).

## Data flow (signup → renewal → cancel)

```
                          ┌──────────────────┐
                          │  Stripe (truth   │
                          │  for billing)    │
                          └────────┬─────────┘
                                   │ webhooks
                                   ▼
       ┌──────────────────────────────────────────────────────┐
       │  /api/stripe/webhook  (billing-stripe domain)        │
       │  • customer.subscription.created/updated/deleted     │
       │  • invoice.payment_succeeded / payment_failed        │
       └────────┬───────────────────────┬─────────────────────┘
                │                       │
                ▼                       ▼
   ┌───────────────────────┐ ┌─────────────────────────────┐
   │ User document         │ │ MembershipStatusHistory     │
   │ • stripeCustomerId    │ │ (event-sourced audit log    │
   │ • stripeSubscriptionId│ │  of state transitions)      │
   │ • subscription { … }  │ │                             │
   └───────────────────────┘ └─────────────────────────────┘
                │
                ├─► MembershipRenewalCycle (per-invoice cycle row)
                │
                ▼
       ┌────────────────────┐
       │ Hooks read this    │
       │ to render UI:      │
       │ - useStripeSubscr. │
       │ - useMemberships   │
       │ - useActivePackage │
       └────────────────────┘
```

## Layered responsibilities

Per CLAUDE.md's strict layering:

| Layer | What lives here for subscription |
|---|---|
| `src/app/api/subscription/**`, `src/app/api/memberships/**` | Thin handlers — auth, parse, delegate. |
| `src/services/subscription/**` | Cancel logic, pause-collection logic, Stripe-ref repair logic. Pure-policy helpers split out for tests. |
| `src/utils/subscription/**`, `src/utils/membership/**` | Pure helpers (active-package resolution, benefit lookup, downgrade benefit preservation). |
| `src/models/{User,MembershipPackage,MembershipRenewalCycle,MembershipStatusHistory,ChargeJobLock}.ts` | Mongoose schemas. See [models.md](./models.md). |
| `src/hooks/use{StripeSubscription,Memberships,ActivePackage,MembershipModal}.ts` | React hooks — read-only views of subscription state. |

### The modal-open chokepoint owns the subscription gate (2026-09-01)

`useMembershipModal.openModal` / `openModalWithPackageSelectionFirst` call
`resolveSubscriptionCreationGate` before opening, and `router.push` the member to their
membership page instead when the answer is no.

The gate lives **here, not in the callers**, because there are four ways into this modal
and three of them (the Klaviyo abandoned-checkout deep-link, the global
`openMembershipModal` event, and the package-picker open) never ran the card-click guard.
Adding a fifth entry point now inherits the gate for free — that is the point of the
placement.

A plan-less open is deliberately allowed through: the picker is how a member with a
blocking subscription buys a **pack**, which is permitted. The step-2 pre-warm backstop
guards that path.

## Source-of-truth split

- **Stripe is truth for billing facts** — current period end, status (`active`/`past_due`/`canceled`/...), `pause_collection`, invoice history.
- **Mongo is truth for our derived state** — `isActive`, `autoRenew`, `endDate`, `cancelledAt`, `pastDueAt`, `previousSubscription`, `pendingChange`. Derived from Stripe events but consumed by the rest of the app (page renders, eligibility checks, partner-discount queue).
- When the two diverge, the **webhook handler reconciles** — see `shouldAdoptPaidSubscriptionOverStored()` in [SubscriptionReferenceService.ts](../../src/services/subscription/SubscriptionReferenceService.ts) for the auto-correction rule.

## Manageable vs dead Stripe statuses

`SubscriptionReferenceService` defines two sets that drive almost every cancel/repair decision:

- **Manageable**: `active`, `trialing`, `past_due`, `unpaid`, `paused` — eligible to be cancelled or treated as "the user's current sub."
- **Dead**: `incomplete`, `incomplete_expired`, `canceled` — never canonical; if `User.stripeSubscriptionId` points to one, repair by searching for a manageable sibling on the same customer.

See [SubscriptionReferenceService.ts:13-32](../../src/services/subscription/SubscriptionReferenceService.ts#L13-L32).

## Anchor billing day

Australian users joining on the **25th, 26th, or 27th** are anchored to renew on the **24th** of the following month. This guarantees ≥ 3 days to recover from a failed renewal before the major-draw window (28th–27th).

Implementation: `getSubscriptionCreateParamsForAnchor(joinDate)` in `create-subscription` / `create-subscription-existing-user` / `renew-subscription` routes (under [billing-stripe](../billing-stripe/)). Period-end resolution lives in `getSubscriptionPeriodEnd(sub)` at [src/utils/payment/stripe/subscription-period.ts](../../src/utils/payment/stripe/subscription-period.ts) and is reused by the cancel API, the webhook, and the migration script.

See [rules.md](./rules.md#billing-anchor-24th) for the full rule set.

## Pause-collection lifecycle

When a renewal fails, Stripe will keep generating invoices each cycle while the subscription is `past_due`, stacking charges. We mitigate by setting `pause_collection: { behavior: "keep_as_draft" }` after the failure — new invoices stay draft until collection resumes.

```
invoice.payment_failed (billing_reason=subscription_cycle)
   └──► pauseAfterRenewalFailure(subId)
            sets subscription.pause_collection = { behavior: "keep_as_draft" }

[time passes; user retries OR admin charges past-due OR auto-recovery]

invoice.payment_succeeded (eligible)
   └──► resumeAfterSuccessfulRenewalPayment(subId)  ← MUST run before benefit application
            clears subscription.pause_collection
```

The `resume` call is **idempotent** — safe to call when not paused. It runs *before* `processPaymentBenefits` in the webhook so a slow benefits path (or Stripe CLI / proxy timeout) cannot leave `pause_collection` orphaned. See [gotchas.md](./gotchas.md#pause-collection-orphans) for the failure modes this protects against.

## Cancellation flow

Single shared service: `cancelSubscription(user, options)` at [CancelSubscriptionService.ts](../../src/services/subscription/CancelSubscriptionService.ts). Used by both the user-facing route (`/api/stripe/cancel-subscription`) and the admin route (`/api/admin/users/[id]/cancel-subscription`).

Behaviour:
- `cancelAtPeriodEnd: true` (default) → `subscriptions.update(id, { cancel_at_period_end: true })`. User keeps access until period end.
- `cancelAtPeriodEnd: false` → `subscriptions.cancel(id)`. Access revoked now.
- **`status === "past_due"` always cancels immediately**, regardless of the option, since there is no current period to preserve.

Side effects (always, in order):
1. Mongo: `subscription.{autoRenew=false, cancelledAt=now, endDate, status, isActive}` updated.
2. **Partner-discount queue** ended via `handleSubscriptionQueueUpdate(user, "end")` — *only when cancelling immediately*.
3. Klaviyo profile sync (non-blocking).
4. `recordCancellationAnalytics()` writes a `MembershipStatusHistory` row (non-blocking).
5. `lastMonthAccumulatedEntries` is **preserved** on the user doc for potential resubscribe.

Cancellation-event analytics emission is centralised in the **`customer.subscription.deleted` webhook**, not the API path, to avoid double-counting.

## Activation history writes (added 2026-04-29)

`handleSubscriptionCreated` and the `customer.subscription.updated` handler both append a row to `MembershipStatusHistory` (status `active` or `trialing`, source `webhook_subscription_created` / `webhook_subscription_updated_active`) whenever a subscription transitions into an active state.

Concretely:
- **`customer.subscription.created`:** fires once per new subscription (regular checkout) and once per upgrade-promotion path. Records the activation with `effectiveAt = subscription.created`.
- **`customer.subscription.updated`:** fires when status changes from non-active to `active` or `trialing` (e.g., past_due → active recovery, incomplete → active, trialing → active conversion). Records the activation with `effectiveAt = now`.

This makes the event log complete from this date forward. Combined with the existing `past_due` and cancellation writes, every state transition into the four primary buckets (`active`, `trialing`, `past_due`, `canceled`/`scheduled_cancel`) is now recorded. The new `MembershipDailySnapshot` cron does not depend on this for daily snapshot writes (it reads live state), but downstream tooling that reconstructs membership state from history events alone will benefit from the completeness.

Errors during the analytics write are caught and routed via `webhookLog("warn", ...)` — they never fail the webhook handler.

## MembershipDailySnapshot cron (added 2026-04-29)

A nightly cron at [`/api/cron/membership-daily-snapshot`](../../src/app/api/cron/membership-daily-snapshot/route.ts) writes one [`MembershipDailySnapshot`](../../src/models/MembershipDailySnapshot.ts) row per package for **yesterday in `Australia/Sydney`**.

Read path:
- The cron calls [`MembershipAnalyticsService.getMembershipByPackageLiveForSnapshot()`](../../src/services/admin/MembershipAnalyticsService.ts) — a snapshot-shaped sibling of `getMembershipByPackageLive()` that returns four bucket counts (active, past_due, scheduledCancel, fullyCancelled) instead of three. The dashboard's existing `getMembershipByPackageLive()` is unchanged.
- Dashboard reads (admin route layer) call [`getMembershipByPackageSnapshot(asOfDate)`](../../src/services/admin/MembershipAnalyticsService.ts) when `parseAdminDashboardDateRange` resolves `membershipAsOfMode === "snapshot"`. That method reads three rows (one per package) directly from the `MembershipDailySnapshot` collection — a single indexed lookup. When no row exists for the queried date, it falls back to live counts and sets `summary.snapshotMissing: true` so the UI can flag the result. `getAnalyticsBundle()` still accepts `{ membershipAsOfMode, asOfDate }` for call-site compatibility but no longer uses them — `cancelledMembershipRevenueImpact` is always derived from the same `cancellationRows` that produce `cancellationsInRange`, so the revenue and the count always describe the same cohort. (See `gotchas.md` → "Dashboard cancellation revenue must come from the same cohort as the count" for the bug this fixed.)
- Each row stores a snapshot of `unitPriceCents` at write time, so historical revenue is **immutable** if a package price changes later.
- `confidence: "live"` always — there is no historical reconstruction.

Schedule: fires twice daily at `30 17 * * *` and `30 20 * * *` UTC (moved off `0 14`/`0 15` on 2026-08-24 — those land in the ~900-membership renewal-webhook burst and its trailing Stripe payment wave; a same-day `0 18`/`0 19` attempt was reverted within the same task after it was found to collide with `sync-meta-ads`/`sync-tiktok-ads`'s Sydney-slot gate during AEDT; see `docs/infrastructure/gotchas.md` for the full incident). Both correspond to the early-morning hours of a fresh Sydney local day (03:30/06:30 AEST, 04:30/07:30 AEDT). **`getMembershipByPackageLiveForSnapshot` has NO date filtering — it is a purely live census, not a point-in-time snapshot of a closed day.** The `date` key it gets stamped with is only a label (`now − 24h` in Sydney); every fire, first or second, captures "membership state right now". Accuracy is purely a function of how many hours past the Sydney day boundary the cron happens to fire — there is no run that is absolutely "clean", only "closer to the boundary" versus "further from it". **Write-once guard, with a degenerate-row escape hatch (2026-08-24):** `upsertMembershipSnapshotRow` upserts on `{date, packageId}` only when no NON-DEGENERATE row already exists for that key — the fire closer to the boundary wins, and a later fire is a no-op fallback for a missed/failed run (or self-heals a degenerate all-zero row, since nothing else repairs this collection). `maxDuration: 300s`, declared in-file in `route.ts` (there is no `vercel.json` `functions` entry for this route, so without it the route silently ran under the 10s catch-all default).

DST safety: the handler computes the local date string via `formatInTimeZone(yesterdayDate, "Australia/Sydney", "yyyy-MM-dd")`. The IANA zone is DST-aware automatically. Verified by [`scripts/test-membership-snapshot-dst.ts`](../../scripts/test-membership-snapshot-dst.ts) across both October (AEDT-start) and April (AEDT-end) transition boundaries — the formula's correctness does not depend on which fixed UTC hour the cron fires at, only on which side of the DST transition instant it lands.

Health: [`GET /api/admin/health/membership-snapshot`](../../src/app/api/admin/health/membership-snapshot/route.ts) lists missing days from the last 7. Admin-only. Read-only — does not attempt repair. **Expect a daily "yesterday missing" window, not a fault:** the health check expects yesterday's row from the moment Sydney rolls past midnight, but the first snapshot fire now lands ~3.5–4.5 hours later (17:30 UTC) — so a check run in that window will correctly show `ok:false` for yesterday every day, not just on incident nights. See `docs/infrastructure/architecture.md` for the cron schedule context and `docs/infrastructure/gotchas.md` for why the schedule sits where it does.
