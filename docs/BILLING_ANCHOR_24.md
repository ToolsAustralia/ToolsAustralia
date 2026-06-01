# Billing Anchor to 24th

## Overview

Users who **join on the 25th, 26th, or 27th** (AEST) are anchored so their subscription **renews on the 24th** of each month. This gives at least 3 days to resolve failed renewals before the major draw period (28th–27th).

## Rules

### New subscriptions (25th / 26th / 27th joiners)

- We use **`trial_end`** (next 24th at midnight AEST) and **`proration_behavior: "none"`** so renewal anchors to the 24th.
- We add **`add_invoice_items`** with the full package price so the user pays immediately at signup (not prorated, per terms).
- First invoice = full price charged at signup; subscription status is `trialing` until the 24th, then `active` with renewals on the 24th.
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

## Second anchor-move trigger — past-due reanchor

There are now **two** events that move the billing anchor:

1. **New joiners on 25th/26th/27th** (this doc) — handled at subscription-create time.
2. **Past-due recovery** — when a `past_due`/`unpaid` subscription recovers, future renewals are reanchored to the recovery-payment date (AEST), clamping 25/26/27 → 24, via `reanchorAfterPastDueRecovery` in `SubscriptionCollectionPauseService`.

See [PAST_DUE_REANCHOR.md](./PAST_DUE_REANCHOR.md) for the full past-due reanchor rule.

## Stripe "Trials" analytics are an anchoring artifact

Anchoring uses Stripe `trial_end`, so Stripe classifies anchored members (25-27 joiners, the migration batch, and past-due reanchors) as **"trials"** — the **Billing → Trials** tab and trial-segmented MRR will show large numbers even though **we never sell a free trial**. This is cosmetic with no functional impact; our DB-based analytics count these members as active subscribers. Do not read Stripe's Trials / MRR-during-trial as a real funnel — use Subscribers/Revenue or the app's own dashboards. See [PAST_DUE_REANCHOR.md](./PAST_DUE_REANCHOR.md).
