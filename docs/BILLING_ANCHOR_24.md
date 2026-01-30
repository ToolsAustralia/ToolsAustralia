# Billing Anchor to 24th

## Overview

Users who **join on the 25th, 26th, or 27th** (AEST) are anchored so their subscription **renews on the 24th** of each month. This gives at least 3 days to resolve failed renewals before the major draw period (28th–27th).

## Rules

### New subscriptions (25th / 26th / 27th joiners)

- We set **`billing_cycle_anchor_config: { day_of_month: 24 }`** when creating the subscription.
- First charge is prorated (signup → next 24th); subsequent charges are on the 24th.
- **Cancellation**: If the user cancels (`cancel_at_period_end`), their access ends on the **24th** (full period). Stripe does **not** charge again at period end. Cancellation date = period end = 24th.

### Migration (existing 25th–27th renewers)

- Script: `scripts/migrate-anchor-billing-24.ts` (run with `--dry-run` first).
- Uses **`trial_end` = next 24th** and **`proration_behavior: "none"`** so we do not charge mid-cycle.
- **We never migrate subscriptions with `cancel_at_period_end === true`.** Those users have already chosen to cancel at their current period end; changing billing or trial could charge them or extend access. We skip them and log `skip_cancel_at_period_end`.

### Cancellation date = full period

- **Always** we set the user’s “cancellation date” / `endDate` to Stripe’s **current period end** (from subscription items in Basil API, or subscription-level in legacy).
- We **never** charge after the user has cancelled. Stripe does not charge at period end when `cancel_at_period_end` is true.
- Shared helper: **`getSubscriptionPeriodEnd(sub)`** in `src/utils/payment/stripe/subscription-period.ts` — used by cancel API, webhook, and migration so the same logic applies everywhere.

## Where it’s implemented

| Area | What |
|------|------|
| New subs | `getSubscriptionCreateParamsForAnchor(joinDate)` in create-subscription, create-subscription-existing-user, renew-subscription |
| Period end | `getSubscriptionPeriodEnd(sub)` in cancel-subscription, webhook, migration script |
| Migration | Skip `cancel_at_period_end`, skip already 24th, only 25–27; log subId + customerEmail |

## Running the migration

```bash
# Dry run (no Stripe updates)
npm run migrate:anchor-billing-24:dry

# Live (optional limit)
npx tsx scripts/migrate-anchor-billing-24.ts --limit=50
```

## Audit

- Migration logs every subscription with `subId`, `customerEmail`, `oldAnchorDay`, `newAnchorDay`, `action` so you can match records in your DB and Stripe dashboard.
