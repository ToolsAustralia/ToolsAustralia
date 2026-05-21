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

## Sample data

`src/data/samplePartnerDiscounts.ts` is FIXTURE data for dev. Don't ship it as a fallback in production paths.
