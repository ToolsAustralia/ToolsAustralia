# Admin — Gotchas

## Middleware vs handler gating

Common mistake: assuming `/api/admin/**` is gated by middleware. NOT TRUE. Middleware excludes `/api`. Each handler must `requireAdmin(session)` itself.

Symptom: a missing `requireAdmin()` in a route handler doesn't fail in dev (you're logged in as admin); it only fails when a malicious user discovers the unprotected endpoint.

## Audit drift

If admin path doesn't write the audit row that user path writes, analytics drift between cancel actors. The shared-service pattern ([P4](./patterns.md#p4-shared-service-for-user--admin-paths)) prevents this.

## Past-due cancel race

Cancelling a past-due subscription always immediate-cancels (no period to preserve). Make sure the admin UI surfaces this — admin checks "cancel at period end," but the service ignores the option for past-due. The UI should warn / explain.

## Modal stacking in admin

Multiple admin modals (UserDetail + ChargePastDue + ErrorReport) can stack. Coordinate via `useModalPriorityStore`.

## Sanitised log echoes

If admin UI shows raw Stripe responses, card data leaks into screenshots / shared screens. Always sanitise before display.

## Stripe API 2025-04-01+ period field migration

`current_period_start` and `current_period_end` were removed from the Subscription root in Stripe API version `2025-04-01` (Basil). They now live on each `subscription.items.data[*]` instead.

**Affected function:** `checkForceChargeEligibility` in `src/server/admin/forceChargePastDue.ts`

The fix reads from `subscription.items.data[0]` first (new API) and falls back to the subscription root (old API). Any code that casts a subscription object and reads `.current_period_start` / `.current_period_end` directly will silently get `undefined` on the new API — guard against both locations.

For a shared helper that abstracts this, see `src/utils/payment/stripe/subscription-period.ts` (`getSubscriptionPeriodEnd`).
