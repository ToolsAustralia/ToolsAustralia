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
| `src/hooks/use{StripeSubscription,Memberships,ActivePackage}.ts` | React hooks — read-only views of subscription state. |
| `src/hooks/useMembershipModal.ts` | React hook — modal open/close state; `openModal` / `openModalWithPackageSelectionFirst` also run the subscription-creation gate and `router.push` away when blocked (see below). Not read-only. |

### The modal-open chokepoint owns the subscription gate (2026-09-01)

`useMembershipModal.openModal` / `openModalWithPackageSelectionFirst` call
`resolveSubscriptionCreationGate` before opening, and `router.push` the member to their
membership page instead when the answer is no.

The gate covers every call that passes the plan through the function's own argument —
package cards and the `/membership` abandoned-checkout deep-link both call it that way
today. It does **not** see a plan set any other way: a caller that does
`setSelectedPlan(plan)` and then calls `openModal()` with no argument bypasses the check,
because the gate only reads its own `plan` / `defaultPlan` argument, never `selectedPlan`
state — by design, so the picker stays reachable for a blocking-sub member buying a
**pack** (see below). As of 2026-09-01, `MembershipSection.tsx`'s deep-link and global-
`openMembershipModal`-event handlers and `my-account/page-client.tsx`'s global-event
handler all pass the plan through the argument, so the gate covers them too. The one
remaining live instance of the bypass shape is `useMajorDrawEntryCta.ts`'s `openEntryFlow`
(`setSelectedPlan(correctPlan)` + a bare `openModal()`, ~line 373) — safe today only
because `correctPlan` there is guaranteed a one-time plan whenever the user has a
blocking subscription (the gate allows one-time regardless), and can only be a
subscription plan when the user has none (the gate allows any plan for a non-blocking
user). That is an invariant of that caller, not of `openModal` itself — re-verify it
before adding a second caller of this shape.

A plan-less open is deliberately allowed through: the picker is how a member with a
blocking subscription buys a **pack**, which is permitted. If that same member instead
picks a SUBSCRIPTION tier from the picker — or the open-time gate above let a
subscription plan through because `userLoading` was still true when it ran — a second
check backstops step 2: `stepTwoGate` in
[`MembershipModal/index.tsx`](../../src/components/modals/MembershipModal/index.tsx#L1253)
re-runs the same gate immediately before the payment pre-warm fires and redirects
instead of letting the pre-warm 409 silently.

#### `openModalWithPackageSelectionFirst` does not gate on its `defaultPlan`

`openModalWithPackageSelectionFirst(defaultPlan)` always asks the gate as if the open were
plan-less (`isSubscriptionPlan: false`), which the gate always allows. `defaultPlan` is the
tier **we** recommend, parked *behind* the picker so that backing out lands on a real
package instead of an empty payment step — it is not the member's choice, so it must not
decide whether they may open the picker at all. Gating on it would have denied `paused` /
`unpaid` / `past_due` members the pack path from draw-results, the dashboard, and the
rewards page (all three pass a recommended tier that way), and would have made the two
global `openMembershipModal` listeners disagree for identical input — `MembershipSection`
passes `plan ?? undefined` (plan-less → picker opens) while `my-account/page-client.tsx`
substitutes a tier (would have been blocked).

The step-2 pre-warm backstop guards whatever the member actually **selects** from the
picker. That is the correct layer: it is the first moment a real choice exists.

The gate call itself is kept rather than dropped, so this stays a single chokepoint — a
future block that does not depend on the plan type would apply here too.

#### The gate reads state at CALL time, not capture time (fixed 2026-09-01)

**Where the gate's input comes from.** `readGateUser()` in
[`useMembershipModal.ts`](../../src/hooks/useMembershipModal.ts) reads the user from the
**query cache** at call time — `queryClient.getQueryData(queryKeys.users.detail(id))` —
and falls back to the last rendered `userData` when the cache has nothing usable.
`userLoading` and the user **id** still come from `gateInputsRef`, a ref refreshed every
render. The selection itself is
[`selectGateUser`](../../src/utils/subscription/subscription-creation-gate.ts), a pure
helper fenced by `npm run test:subscription-gate`; the gate's decision logic is untouched.

This was a deterministic bug, not a race. `my-account/membership/page-client.tsx`'s
past-due tier switch awaits `invalidateQueries(users.detail)` and *then* calls
`openModal(plan)`. The click had captured `openModal` while the member was — by definition
— `past_due`. So the gate still read `past_due` and pushed `?open=payment`, even though
`switchTierPastDue.ts:68` had by then set the subscription to `canceled` and voided its
invoice: the member landed on a payment sheet for a subscription that no longer existed.

**Why the ref alone did not fix it — this took two attempts.** The first fix moved
`userData` into a render-assigned ref, on the reasoning that a ref refreshed every render
is current. It is not, at that call site, because **no render has happened yet**. React
Query notifies subscribers through `notifyManager`, whose scheduler is
`systemSetTimeoutZero` — a **macrotask** (`@tanstack/query-core@5.90.2`,
`build/modern/notifyManager.js:3`) — and React then schedules the render itself on another.
The continuation after `await invalidateQueries(...)` is a **microtask**, so it runs first
and the ref still holds `past_due`; the ref catches up one macrotask too late. The **cache**
is written synchronously before `invalidateQueries` resolves, so it is already current at
the call. Both sides use the same key, verified: `UserContext` reads `useUserData(userId)` →
`queryKeys.users.detail(id)` = `["users", id]`, exactly what the switch invalidates.

**The allow-bias is preserved.** A cache miss falls back to the rendered user — it never
invents a blocking status — and a malformed cache entry is rejected by a runtime type guard
rather than asserted, so it degrades to the fallback instead of being read as a status the
gate would act on. A guest, cancelled, expired, or still-loading user is unaffected.

Fixing it at the chokepoint (rather than at that one call site) disarms the same trap for
every future async caller; deferring the `openModal` call at the call site would have traded
a deterministic bug for a timing race and left the trap armed. Both callbacks go through
`readGateUser`, so a future block in `openModalWithPackageSelectionFirst` inherits the fix.
Stable callback identity is a side benefit — no consumer relies on it changing, since the
hook returns a fresh object literal each render anyway.

**Known limitation.** The cache read only helps if the invalidate actually **refetches**,
which needs a live observer on `["users", id]`. There is one: `UserProvider` mounts
`useUserData(userId)` globally in [`providers.tsx`](../../src/app/providers.tsx). An async
caller that opens the modal from a context outside that provider would fall back to the
rendered user and see the old behaviour.

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
