# Admin — Models

_N/A — admin reads/writes models from other domains. Audit-style writes go through:_

- `MembershipStatusHistory` ([subscription](../subscription/))
- `InvoiceChargeLog` ([billing-stripe](../billing-stripe/))
- `PaymentEvent` (RefundProcessed type) ([billing-stripe](../billing-stripe/))
- `ErrorReport` ([error-reporting](../error-reporting/))

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
