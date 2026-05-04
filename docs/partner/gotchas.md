# Partner — Gotchas

## Subscription-cancel queue removal timing

Cancel-immediately removes from queue NOW. Cancel-at-period-end does NOT remove until the period actually ends. Common mistake: assuming `cancelledAt` triggers queue removal — it doesn't. The trigger is the `end` action call.

## Past-due interaction

Past-due subscribers stay in the queue until cancelled or recovered. This is intentional — they may still recover and shouldn't lose discount access while in grace.

## Webhook ordering

If `customer.subscription.deleted` and `customer.subscription.updated` arrive close together, queue updates can race. The single-update-function pattern (P2) plus idempotent operations should handle this, but verify under load.

## Sample data

`src/data/samplePartnerDiscounts.ts` is FIXTURE data for dev. Don't ship it as a fallback in production paths.
