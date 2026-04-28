# Affiliate — Architecture

## Lifecycle

```
1. Visitor lands via affiliate link → cookie + session capture
                                              │
2. Visitor signs up / pays → affiliate-attribution writes Affiliate ref to user
                                              │
3. Payment succeeds → commission-processing writes AffiliateCommission row
                                              │
4. Recurring renewal → affiliate-recurring-invoice processes per cycle
                                              │
5. Payout cycle → payout-processing aggregates → AffiliatePayout row
                                              │
6. Refund → reverse-commission undoes the commission row
```

## Helpers ([src/utils/affiliate/](../../src/utils/affiliate/))

| File | Role |
|---|---|
| `affiliate-attribution.ts` | Attribution capture: cookie → user record at signup. |
| `commission-processing.ts` | Compute and write `AffiliateCommission` for a successful payment. |
| `affiliate-recurring-invoice.ts` | Process recurring renewal commissions (subscription cycles). |
| `payout-processing.ts` | Aggregate eligible commissions into payouts. |
| `reverse-commission.ts` | Reverser called by refund flow. |
| `get-affiliate-session.ts` | Read affiliate session/cookie. |
| `referred-user-admin.ts` | Admin tools for the referred-user view. |

## Auth

Affiliate portal has its own auth via [src/lib/affiliate-auth.ts](../../src/lib/affiliate-auth.ts) (separate from main NextAuth — affiliates are a different user type).

## Backfill

Operational scripts for backfilling commissions/recurring exist under `scripts/` (see [infrastructure](../infrastructure/) and grep for `backfill-affiliate*`).
