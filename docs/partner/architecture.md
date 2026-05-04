# Partner — Architecture

## Discount queue

Active subscribers are enqueued for partner-discount eligibility. The queue tracks:
- Member's eligibility window (subscription period)
- Partner offers they qualify for
- Catalog visibility (which discounts to surface to which members)

When a subscription ends (cancel-immediately or period-end), `handleSubscriptionQueueUpdate(user, "end")` removes from the queue.

## Helpers

[src/utils/partner-discounts/](../../src/utils/partner-discounts/):
- `partner-discount-queue.ts` — queue management
- `partner-catalog-visibility.ts` — visibility resolution

## Cross-domain integration

- **[subscription](../subscription/)** — `CancelSubscriptionService` calls `handleSubscriptionQueueUpdate(user, "end")` on immediate cancel ([architecture](../subscription/architecture.md#cancellation-flow), step 2 of side effects).

## Models

| Model | Path |
|---|---|
| `PartnerApplication` | [src/models/PartnerApplication.ts](../../src/models/PartnerApplication.ts) — partner brand applications |
| `PartnerDiscount` | [src/models/PartnerDiscount.ts](../../src/models/PartnerDiscount.ts) — discount offers |

> _TODO: pull schemas._
