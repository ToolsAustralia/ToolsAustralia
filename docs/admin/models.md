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

### `attributedRevenue` field (source version 2)

Added alongside `adChannels`. Stores per-platform payment attribution data for the day.

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
  revenue: number;       // Total attributed revenue (excludes refunds)
  conversions: number;   // Number of attributed payment events
  byConfidence: {
    click: number;           // Revenue where attribution confidence = click
    utm_only: number;        // Revenue where attribution confidence = utm_only
    inferred_backfill: number; // Revenue where attribution confidence = inferred_backfill
  };
}
```

`byConfidence.click + byConfidence.utm_only + byConfidence.inferred_backfill === revenue` (the three tiers partition the total).

**Source version:** `DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION` was bumped from `1` to `2` when this field was added. Snapshot documents written at v1 do not contain `attributedRevenue`; readers guard against this by treating an absent field as an empty Map.

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
