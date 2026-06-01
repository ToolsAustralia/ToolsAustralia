# Admin — Models

_N/A — admin reads/writes models from other domains. Audit-style writes go through:_

- `MembershipStatusHistory` ([subscription](../subscription/))
- `InvoiceChargeLog` ([billing-stripe](../billing-stripe/))
- `PaymentEvent` (RefundProcessed type) ([billing-stripe](../billing-stripe/))
- `ErrorReport` ([error-reporting](../error-reporting/))

## DashboardStatsDailySnapshot

[src/models/DashboardStatsDailySnapshot.ts](../../src/models/DashboardStatsDailySnapshot.ts)

One document per AEST calendar day. Written (upserted) by the dashboard-stats cron and by `writeSnapshotForDate`. Collection name: `dashboardstatsdailysnapshots`. Indexed on `date` (unique).

**Shape:**

| Field | Type | Notes |
|---|---|---|
| `date` | `string` (YYYY-MM-DD) | AEST calendar day — the unique key |
| `tz` | `"Australia/Sydney"` | Always Sydney |
| `revenue.total` | `number` | Sum of all bucket revenue for the day |
| `revenue.buckets` | `Map<RevenueBucketKey, { revenue, purchaseCount }>` | Per-bucket totals. Keys: `membershipPurchase`, `membershipRenewal`, `oneTimePurchase`, `additionalOneTimePurchase`, `miniDraw`, `upsell` |
| `users.newSignups` | `number` | Users created that AEST day with `isActive: true` |
| `users.cancellationsInDay` | `number` | Users whose `subscription.cancelledAt` falls in that AEST day |
| `adChannels` | `Map<string, { spend, revenue, roas, impressions?, clicks? }>` | Keyed by channel name (e.g. `"facebook"`). Provider registry in `adChannelProviders.ts` |
| `confidence` | `"live"` | Always `"live"` (future field for partial / projected values) |
| `computedAt` | `Date` | UTC timestamp when snapshot was last written |
| `sourceVersion` | `number` | Schema version (`DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION = 1`) |

**Distinct user counts** are NOT stored — they are computed live at read time via `computeDistinctUserCounts` because they are not additive across days (the same user buying on two days counts once in a multi-day range). The `revenue.buckets[k].userCount` field in `SnapshotReadResult` is always a live query.

### `attributedRevenue` field (source version 3)

Added alongside `adChannels`. Stores per-platform payment attribution data for the day, split into acquisition revenue (used as the ROAS numerator) and renewal revenue (tracked separately, excluded from ROAS).

| Field | Type | Notes |
|---|---|---|
| `attributedRevenue` | `Map<AttributedPlatformKey, IAttributedRevenue>` | Keyed by platform. Absent keys mean zero revenue for that platform. |

**`AttributedPlatformKey` union:**

```
"meta" | "tiktok" | "snapchat" | "klaviyo_email" | "klaviyo_sms" | "google" | "direct" | "other"
```

**`IAttributedRevenue` shape:**

```ts
{
  newRevenue: number;      // Acquisition revenue only: initial subscriptions, one-time, upsell, mini-draw, upgrades/resubscribes. This is the ROAS numerator.
  renewalRevenue: number;  // Recurring membership renewals (packageType === "membership" && billingReason === "subscription_cycle"). Tracked separately; EXCLUDED from ROAS.
  conversions: number;     // Number of attributed payment events contributing to newRevenue
  byConfidence: {
    click: number;           // newRevenue where attribution confidence = click
    utm_only: number;        // newRevenue where attribution confidence = utm_only
    inferred_backfill: number; // newRevenue where attribution confidence = inferred_backfill
  };
}
```

`byConfidence.click + byConfidence.utm_only + byConfidence.inferred_backfill === newRevenue` (the three tiers partition acquisition revenue only). `conversions` and `byConfidence` cover `newRevenue` rows only; renewal events do not contribute to these counters.

**Renewal discriminator:** A PaymentEvent row is classified as a renewal when `packageType === "membership" && data.billingReason === "subscription_cycle"`. This is the same predicate used by `PaymentEventRepository.aggregateRevenueAndCountByHourOfDay` (the `$nor` guard). It is used instead of the top-level `isRenewal` field because `data.billingReason` is present on every historical PaymentEvent row, whereas `isRenewal` defaults `false` on rows written before the field was introduced.

**Source version:** `DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION` is `3`. Snapshots at v1 lack `attributedRevenue` entirely; snapshots at v2 carried the old single-`revenue` shape. Readers guard against absent or old-shape values by treating an absent field as an empty Map.

## ChargeJobRun

[src/models/ChargeJobRun.ts](../../src/models/ChargeJobRun.ts)

One document per bulk past-due charge run. Created at the start of `POST /api/admin/invoices/charge-past-due` and updated when the run finishes.

**Lifecycle states:** `running` → `completed` | `failed` | `aborted`. An orphan sweep sets any `running` document older than 35 minutes to `aborted` on the next bulk-run start.

**Totals shape:**

```ts
{
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;           // total skipped
  skippedBreakdown: {
    recentlyAttempted: number;
    alreadyPaid: number;
    noLongerPastDue: number; // late re-check: status flipped mid-run
    other: number;
  };
}
```

**Cross-reference:** every `InvoiceChargeLog` row produced by a bulk run carries `chargeRunId: ObjectId` pointing back to the `ChargeJobRun` document. Per-user manual retries write `chargeRunId: null`. See [billing-stripe/gotchas.md](../billing-stripe/gotchas.md#charge-past-due--runbook) for the full audit trail.
