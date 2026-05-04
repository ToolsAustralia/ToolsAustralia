# Partner — Rules

## R1. Queue lifecycle on subscription events

| Subscription event | Queue action |
|---|---|
| Subscribe / first payment | `start` (enter queue) |
| Renewal payment | `renew` (extend eligibility) |
| Cancel immediately | `end` (remove now) |
| Cancel at period end | `end` triggered when period ends, not at cancel time |

Owned by `handleSubscriptionQueueUpdate()` in `partner-discount-queue.ts`.

## R2. Catalog visibility honours member status

Members see only the discounts they're eligible for at request time. Cancelled / inactive members see nothing (or a "subscribe to access" CTA, depending on the page).

## R3. Cancel-immediately ends queue NOW

Per the [subscription cancel service](../subscription/backend.md), step 2 of side effects: when cancelling immediately, `handleSubscriptionQueueUpdate(user, "end")` runs immediately — not when an end-date is reached. Don't change this without coordinating with the partner team.
