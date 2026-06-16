# Partner — Gotchas

## Subscription-cancel queue removal timing

Cancel-immediately removes from queue NOW. Cancel-at-period-end does NOT remove until the period actually ends. Common mistake: assuming `cancelledAt` triggers queue removal — it doesn't. The trigger is the `end` action call.

## Past-due interaction

Past-due subscribers stay in the queue until cancelled or recovered. This is intentional — they may still recover and shouldn't lose discount access while in grace.

## Webhook ordering

If `customer.subscription.deleted` and `customer.subscription.updated` arrive close together, queue updates can race. The single-update-function pattern (P2) plus idempotent operations should handle this, but verify under load.

## Subscription partner access has no fixed duration

Subscription partner access is **lifecycle-gated**, not a fixed N-day window. A subscriber keeps partner access for as long as `user.subscription.isActive` (queue rows track `subscription.endDate`, which renews each billing cycle — see `partner-discount-queue.ts`). The `partnerDiscountDays` field on the three subscription records in `src/data/membershipPackages.ts` is therefore `0` and is **never** used to gate subscription access — only one-time / additional / mini packs have a real `partnerDiscountDays` window.

UI must not show a day count for a subscription tier. Use `getPartnerAccessDurationLabel({ isSubscription })` from `src/utils/partner-discounts/partner-access-duration.ts`: it returns `"While active"` / `"Partner access while your membership is active"` for subscriptions, and the concrete `N days` / `N hours` label for one-time/mini/additional packs. Do not re-derive this inline — call the helper so the wording stays consistent across modals, toasts, and stat strips.

## A new purchase must reconcile the queue against real time before deciding to activate vs queue

**Incident (dan_427@hotmail.com, June 2026):** a 2-day Tradie one-time pack purchased on May 28 still showed as "queued / upcoming" ~3 weeks later. Root cause: `addToPartnerDiscountQueue` decided activate-vs-queue from the stored `status === "active"` flag **without checking whether that row's window had already elapsed**. Timeline: pack #0 activated May 17–19; nothing swept the queue afterwards (see the Vercel-cron-GET gotcha in [infrastructure/gotchas.md](../infrastructure/gotchas.md)), so #0 stayed `status:"active"` with a stale past `endDate` for weeks; the May 28 pack saw that "zombie" as active, same tier (40% = 40%), and **queued behind it** instead of activating; the June 12 Foreman pack then preempted the zombie (clearing its dates → it shows `expired` with null `startDate`/`endDate`, the tell-tale of the preemption path).

**The fix** ([`partner-discount-queue.ts`](../../src/utils/partner-discounts/partner-discount-queue.ts), test `npm run test:partner-discount-queue`):
- `addToPartnerDiscountQueue` now calls `processPartnerDiscountQueue(user)` **first**, so elapsed-active rows are expired (and any genuinely-due queued item is activated) before the new purchase is placed.
- The `activeQueueItem` lookup now also requires `endDate > now` (defense in depth) — an "active" row whose window has elapsed is never treated as the active blocker.

Severity note: the bug **defers** paid access, it does not destroy or over-grant it (a stale row with a past `endDate` grants nothing — `calculateActivePartnerDiscountPeriod` checks `endDate > now`). Customers keep their paid window (12-month use-by); it just activated later than expected. So existing affected users should be **left to run their deferred window**, not have it expired — that would punish them for our bug.

## Sample data

`src/data/samplePartnerDiscounts.ts` is FIXTURE data for dev. Don't ship it as a fallback in production paths.
