# Partner — Backend

## Helpers

| File | Role |
|---|---|
| [src/utils/partner-discounts/partner-discount-queue.ts](../../src/utils/partner-discounts/partner-discount-queue.ts) | Queue add/end/update operations |
| [src/utils/partner-discounts/partner-catalog-visibility.ts](../../src/utils/partner-discounts/partner-catalog-visibility.ts) | Resolve which discounts to show to which member |

## Public API

`handleSubscriptionQueueUpdate(user, action: "start" | "end" | "renew")` — single entry point for subscription lifecycle changes affecting the queue. Called by:
- Subscription create webhook → `"start"`
- Subscription cycle webhook → `"renew"` (extends eligibility window)
- Subscription cancel (immediate) → `"end"` (removes immediately)
- Subscription cancel (period-end) → handled when period ends, not immediately

## Sample data

[src/data/samplePartnerDiscounts.ts](../../src/data/samplePartnerDiscounts.ts), [src/data/partnerBrandOffers.ts](../../src/data/partnerBrandOffers.ts) — fixture data for development.

## Brand assets

Partner brand logos under `public/images/partnerBrandLogos/`.
