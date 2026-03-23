---
name: Past-due subscription status and activity log
overview: Split past_due vs canceled in webhooks, clear cancelledAt on recovery, and surface past-due transitions in the admin activity log using the same User-timestamp pattern as upgrades/cancellations.
todos:
  - id: split-past-due-webhook
    content: Refactor handleSubscriptionUpdated — separate past_due from canceled; do not set cancelledAt on past_due
    status: completed
  - id: clear-cancelled-on-reactivate
    content: In handleSubscriptionPackage (membership), clear cancelledAt when setting subscription active
    status: completed
  - id: past-due-timestamp
    content: Add subscription.pastDueAt (or lastPastDueAt) on User; set only when status transitions into past_due (webhook handleInvoicePaymentFailed + handleSubscriptionUpdated past_due branch)
    status: completed
  - id: activity-log-past-due
    content: Extend admin activity-log route to include past-due events from pastDueAt; action copy + type/status consistent with existing subscription rows
    status: completed
  - id: optional-klaviyo-previous-status
    content: Optional — pass previousStatus past_due for subscription_cycle Klaviyo when recovering from past_due
    status: completed
  - id: manual-verify
    content: Manual test — past_due transition logs activity; recovery clears cancelledAt; DB consistent
    status: pending
isProject: false
---

# Past-due vs canceled + activity log for past due

## Context (from audit)

- Successful renewal sets `isActive` / `status` via `processPaymentBenefits` → `grantBenefits` → `handleSubscriptionPackage` + `user.save()`.
- **Bug:** `[handleSubscriptionUpdated](src/app/api/stripe/webhook/route.ts)` treats `past_due` like `canceled` and sets `**cancelledAt`** (lines 1956–1974). Past due is not a cancellation.
- **Bug:** `handleSubscriptionPackage` does not clear `**cancelledAt`** on reactivation (unlike other webhook paths in the same file).

## 1. Split `past_due` and `canceled` in `handleSubscriptionUpdated`

- `**canceled`:** Keep current semantics (`cancelledAt`, `endDate`, etc. as today).
- `**past_due`:** Set `isActive = false`, `status = "past_due"`, preserve `lastMonthAccumulatedEntries`, **do not set `cancelledAt`**.

## 2. Clear `cancelledAt` on successful membership recovery

- In `[handleSubscriptionPackage](src/utils/payment/payment-processing.ts)`, when setting `isActive` / `status` to active, **clear `subscription.cancelledAt`** (align with webhook lines 1529 / 1645).

## 3. Activity log — past due accounts

Today admin activity is built in `[src/app/api/admin/activity-log/route.ts](src/app/api/admin/activity-log/route.ts)` from **PaymentEvents** and **User subscription fields** (`lastUpgradeDate`, `lastDowngradeDate`, `cancelledAt`) under "SUBSCRIPTION CHANGES". There is **no** row when a member becomes past due.

**Approach (consistent with existing patterns):**

1. **Schema:** Add optional `subscription.pastDueAt` (or `lastPastDueAt`) on `[User](src/models/User.ts)` — `Date`, indexed if queried for activity log.
2. **When to set:** On transition **into** `past_due` only (not on every retry if already past due):
  - `[handleInvoicePaymentFailed](src/app/api/stripe/webhook/route.ts)` renewal branch (`subscription_cycle`), when updating DB from a non–`past_due` state → `past_due`.
  - After splitting branches, `[handleSubscriptionUpdated](src/app/api/stripe/webhook/route.ts)` when Stripe reports `past_due` and the stored status was not already `past_due` (optional dedupe if both events fire).
3. **When to clear (optional):** On successful recovery to active (`handleSubscriptionPackage` or invoice success path), **either** leave `pastDueAt` as historical **or** clear it — recommend **keeping** it for audit and relying on **time window** (90 days) for the log; if you want "last time they went past due" only, update `pastDueAt` only on transition (do not clear on recovery).
4. **Activity log UI:** In the same `usersWithChanges` loop (or a parallel query on `pastDueAt` in range), push an activity row, e.g.:
  - `action`: e.g. `"Membership renewal failed — account past due"` (include package name via `getPackageName` like cancellations).
  - `status`: `"error"` or `"warning"` (match severity of failed payment).
  - `type`: reuse an existing union member if it fits filters (e.g. `membership_upgrade` is overloaded for cancel/downgrade today) **or** extend `ActivityLogItem["type"]` with e.g. `subscription_status` / `system_alert` and add a filter in `[ActivityLogManagement](src/app/admin/component/ActivityLogManagement.tsx)` if needed.
5. **Admin list query:** Extend the `User.find` `$or` for subscription changes to include `{ "subscription.pastDueAt": { $gte: startDate } }` and ensure `isActive` / user filters match how other subscription rows are included.

## 4. Optional

- Klaviyo `previousStatus` for `subscription_cycle` when recovering from past_due (analytics only).

## 5. Verification

- Trigger past due → DB `status` / `pastDueAt` set; activity log shows new row within 90-day window.
- Pay successfully → `active`, `cancelledAt` cleared; no duplicate past-due row for same incident unless they fail again later.

