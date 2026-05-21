# Membership Snapshot Analytics — Design Spec

**Date:** 2026-04-29
**Author:** DJ (with Claude Code assistance)
**Status:** Approved — ready for implementation

> **Revision (2026-04-29, post-approval):** Scope narrowed. Historical reconstruction (90-day backfill) is dropped — the dashboard becomes accurate **from today forward**, not retroactively. A one-shot cleanup script removes pre-existing backfill rows from `MembershipStatusHistory` and `MembershipRenewalCycle`. The deprecated `scripts/backfill-membership-analytics.ts` is deleted. All sections below reflect this revision.

---

## 1. Problem

The admin dashboard's "Membership Statuses" KPI card and supporting sections (per-package breakdown, lifecycle chart, cancellations card) all display **current live counts** regardless of the selected date range. Selecting "yesterday" or a custom historical range like "March 15–30" returns today's counts.

Concrete consequences:
- DJ cannot compare today's membership base to yesterday's to spot drops or growth.
- Custom date ranges in the past silently lie — they show today's data labeled as if it covered the historical range.
- Future-dated ranges crash or display incorrectly.

The infrastructure to do point-in-time correctly is **half-built**:
- `MembershipAnalyticsService.getMembershipByPackageSnapshot(asOfDate)` exists but is never called.
- `parseAdminDashboardDateRange` returns `membershipAsOfMode` and `asOfDate` slots — but hardcodes `mode = "live"` and `asOfDate = null`.
- `MembershipStatusHistory` records `past_due` and cancellation events but **does not record activations**, so the existing snapshot query falls back to "current state" for any user without history rows — producing wrong answers for historical dates.
- The existing `scripts/backfill-membership-analytics.ts` has four bugs that produce incorrect or fabricated history rows.

## 2. Goals

1. Selecting any date range on the dashboard shows membership counts **as of the last day of that range**, with these specific rules:
   - `today` → live current counts.
   - `yesterday` → counts as of end-of-yesterday in `Australia/Sydney`.
   - `custom` / `current-draw` / `last-draw` → counts as of the **end of the range's `endDate`**, clamped to today if the range extends into the future.
   - `all-time` → live current counts (matches existing semantics).
2. **From today forward**, every day produces an accurate point-in-time snapshot via the nightly cron. Historical dates (before the cron's first successful run) display live counts with a "snapshot unavailable" indicator — the dashboard does not lie about historical state, it admits it doesn't have one.
3. Day-by-day reads must be **fast** (single indexed lookup, no per-user aggregation pipeline).
4. The cron writes must be **DST-safe** for the `Australia/Sydney` zone — no missed or double-written days across AEST↔AEDT transitions.
5. The cron must be **redundantly scheduled** so a single Vercel hiccup cannot leave a gap, and gaps must be **observable** so DJ can fix them with a one-line script invocation.
6. Frozen pricing semantics: a future package price change must not retroactively rewrite historical revenue.

## 3. Non-Goals

- **Historical reconstruction of any kind.** Past-date dashboard reads return live state with a "snapshot unavailable" flag, never reconstructed approximations. DJ explicitly chose accuracy-from-today over best-effort retroactive coverage.
- Storing per-user state for each historical day. The card and breakdown show aggregates only; the per-user drill-down modal continues to query live `User.subscription`.
- Webhook-driven incremental snapshot updates. The daily cron + history log is sufficient.
- Active alerting beyond a health-check endpoint. DJ chose to skip Slack/email alerting for now.
- Per-day revenue *deltas*. We store standing counts; the read layer can compute deltas if needed later.

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MembershipDailySnapshot                         │
│  one row per (date in Australia/Sydney, packageId)                  │
│  active/pastDue/scheduledCancel/cancelled counts + locked-in price  │
│  confidence: "live" only (no "backfill" — collection starts empty)  │
└─────────────────────────────────────────────────────────────────────┘
              ▲                                  │
              │ writes                           │ reads
              │                                  │
       nightly cron                       ┌──────┴───────────────────┐
       (×2 fires +                        │ MembershipAnalyticsSvc   │
       health-check)                      │  · getByPackageSnapshot  │
       confidence:                        │     (live fallback when  │
       "live"                             │      row missing)        │
                                          │  · getByPackageLive      │
                                          └──────┬───────────────────┘
                                                 │
                                                 │ called by
                                          ┌──────┴────────────────────┐
                                          │ /api/admin/dashboard/...  │
                                          │  · membership-by-package  │
                                          │  · stats (cancellations)  │
                                          │  · membership-lifecycle   │
                                          └───────────────────────────┘
```

**One writer, three readers, one source of truth.**

The dispatch decision lives in `parseAdminDashboardDateRange` — it computes `asOfDate = min(endDate, end-of-today-Sydney)` and sets `membershipAsOfMode = "live"` when `asOfDate` covers today, else `"snapshot"`. Routes call `getMembershipByPackageSnapshot(asOfDate)` or `getMembershipByPackageLive()` accordingly. When the snapshot row is missing for a queried date (every date before deployment), the snapshot reader falls back to live counts and sets `summary.snapshotMissing: true`.

## 5. Data model

### 5.1 New collection: `MembershipDailySnapshot`

```ts
interface IMembershipDailySnapshot {
  date: string;                    // "yyyy-MM-dd" in Australia/Sydney, indexed
  packageId: string;               // "tradie-subscription" | "foreman-subscription" | "boss-subscription"
  tz: "Australia/Sydney";          // recorded for forward-compat

  activeCount: number;             // active + trialing
  pastDueCount: number;            // past_due + unpaid
  scheduledCancelCount: number;    // autoRenew=false but still active
  cancelledCount: number;          // fully terminated

  unitPriceCents: number;          // package.price × 100 at snapshot time — locked in
  activeRevenue: number;           // (activeCount × unitPriceCents) / 100
  pastDueRevenue: number;          // (pastDueCount × unitPriceCents) / 100

  confidence: "live";              // only one value today; field retained for forward-compat
  computedAt: Date;                // wall-clock of when row was written
  sourceVersion: number;           // bump if cron computation logic changes
}
```

**Indexes:**
- `{ date: 1, packageId: 1 }` unique — drives upsert and lookup.
- `{ date: 1 }` — drives "all packages on date X" reads.

**File:** `src/models/MembershipDailySnapshot.ts`

**Manifest entry:** belongs to the `subscription` domain (it's a derived view of subscription state). Add `src/models/MembershipDailySnapshot.ts` to the `subscription` domain's `paths` in `CLAUDE.md`.

### 5.2 Why per-package rows, not embedded

- Read pattern is "all packages on a single date" → `find({ date }).lean()` returns 3 rows.
- Easier to evolve: a fourth package = a fourth row, no schema change.
- Backfill writes package-by-package without races.

### 5.3 Locked-in pricing

`unitPriceCents` is stored on the row itself, not looked up at read time from `src/data/membershipPackages.ts`. A future price change writes new snapshots at the new price; old snapshots stay at the old price. Per DJ: "we shouldn't update the history with the new price."

## 6. Cleanup of pre-existing backfill rows

Before the new system goes live, remove rows in `MembershipStatusHistory` and `MembershipRenewalCycle` that were written by the previous (now-deleted) `scripts/backfill-membership-analytics.ts`. These are tagged distinctively and identifiable without ambiguity.

### 6.1 What to delete

In `MembershipStatusHistory`:
- Rows where `source` matches `/^backfill_/` (specifically `backfill_user_pastDueAt`, `backfill_user_cancelledAt`).
- Rows where `metadata.backfill === true`.

In `MembershipRenewalCycle`:
- Rows where `confidence === "backfill"`.

### 6.2 What stays

- Webhook-written `MembershipStatusHistory` rows (`source: webhook_invoice_payment_failed`, `cancel_api_user`, `cancel_api_admin`) — these are real state transitions captured at the time they happened. Keep.
- Webhook-written `MembershipRenewalCycle` rows (`confidence: "stripe"`) — these are correct, captured from real Stripe events. Keep.
- All `User.subscription` data — untouched.

### 6.3 Process

A single one-shot script `scripts/cleanup-membership-backfill-rows.ts`:
1. Counts matching rows for both collections.
2. With `--dry-run`, prints counts and exits.
3. Without `--dry-run`, deletes the matching rows.
4. Logs a structured summary so the deletion is auditable.

This is run once, before the cron + read-path changes go live, to ensure the analytics collections contain only real, webhook-written data.

### 6.4 Deletion of the old backfill script

`scripts/backfill-membership-analytics.ts` is deleted in the same PR as the cleanup. The four bugs documented in the previous spec revision are no longer relevant since the script is gone. Its `package.json` script entry (if any) is also removed.

## 7. Going-forward writes

To keep `MembershipStatusHistory` complete from deployment onward, add an `active` history write at every place a subscription transitions to `active` or `trialing`. Combined with the existing `past_due` and cancellation writes, this means every state transition from today forward is captured in the event log — no reconstruction required.

- Subscription creation in [src/services/subscription/](src/services/subscription/) (initial activation).
- Webhook handlers in [src/app/api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts) for `customer.subscription.created` / `.updated` events that flip status to `active` from a non-active prior state.

Each write uses `appendMembershipStatusHistory` with `actor: "stripe" | "system"`, `source: "webhook_subscription_active" | "service_subscription_activated"`, and a stable `dedupeKey` so retries are idempotent.

## 8. Read path

### 8.1 Routing logic

In [src/utils/admin/dashboardDateRange.ts](src/utils/admin/dashboardDateRange.ts), replace the hardcoded `membershipAsOfMode = "live"` with:

```ts
const todayEndInSydney = endOfToday;
const asOfDate = new Date(Math.min(endDate.getTime(), todayEndInSydney.getTime()));
const isFuture = endDate.getTime() > todayEndInSydney.getTime();
const isToday = asOfDate.getTime() === todayEndInSydney.getTime();
const membershipAsOfMode: MembershipAsOfMode = isToday || isFuture ? "live" : "snapshot";
```

This handles:
- Today → live
- Future → live (clamped to today)
- Past or custom-ending-in-past → snapshot at that date

### 8.2 Three routes consume it (scope C)

1. **`/api/admin/dashboard/membership-by-package`** — dispatches to `Live` or `Snapshot` based on `mode`.
2. **`/api/admin/dashboard/stats`** (Cancellations card) — "cancellations in range" stays as a delta query; "users currently scheduled to cancel" / cancellation-impact revenue reads against the snapshot when `mode === "snapshot"`.
3. **Lifecycle chart route** — re-pointed to query `MembershipDailySnapshot` directly for the time series.

### 8.3 `getMembershipByPackageSnapshot` rewrite

Replace the existing per-user aggregation pipeline (`$lookup` into history) with:

```ts
const dateKey = formatInTimeZone(asOfDate, "Australia/Sydney", "yyyy-MM-dd");
const rows = await MembershipDailySnapshot.find({ date: dateKey }).lean();

if (rows.length === 0) {
  // Snapshot missing: backfill cron hasn't run, or date is before backfill window.
  // Fall back to live with a `snapshotMissing: true` flag for UI to warn.
  const live = await getMembershipByPackageLive();
  return { ...live, summary: { ...live.summary, snapshotMissing: true } };
}

return assembleDtoFromSnapshotRows(rows);
```

Three rows, indexed lookup, sub-millisecond.

### 8.4 Frontend

`MembershipBreakdownSection` already has scaffolding for an "as of" badge ([line 30–33](src/app/admin/component/overview/MembershipBreakdownSection.tsx#L30-L33)). Light it up properly:
- `mode === "snapshot" && confidence === "live"` → "Status as of {date}"
- `mode === "snapshot" && confidence === "backfill"` → "Status as of {date} (reconstructed)"
- `snapshotMissing` → "Showing live counts (snapshot unavailable)"

The KPI card title may also flip from "Membership Statuses" to "Membership Statuses (as of {date})" when in snapshot mode.

## 9. Cron + DST

### 9.1 Endpoint

**`GET /api/cron/membership-daily-snapshot/route.ts`**

Follows existing patterns in [src/app/api/cron/](src/app/api/cron/): `CRON_SECRET` header auth, idempotent handler, structured logging.

### 9.2 Schedule

`vercel.json` adds two daily fires:

```json
{ "path": "/api/cron/membership-daily-snapshot", "schedule": "0 14 * * *" },
{ "path": "/api/cron/membership-daily-snapshot", "schedule": "0 15 * * *" }
```

- AEST (UTC+10): 14:00 UTC = 00:00 local; 15:00 UTC = 01:00 local.
- AEDT (UTC+11): 14:00 UTC = 01:00 local; 15:00 UTC = 02:00 local.

Both fires occur after midnight local on every day of the year. The handler is idempotent (`upsert` on `{date, packageId}`), so the 15:00 fire is a no-op if 14:00 succeeded.

### 9.3 Handler logic

**Precondition:** Extend `MembershipAnalyticsService` with a new method `getMembershipByPackageLiveForSnapshot()` that returns all four counts the snapshot model needs:

- `activeCount` (active + trialing) — already computed by `getActiveSubscriptionFilter(false)`
- `pastDueCount` — already computed
- `scheduledCancelCount` — currently exposed as `cancelledCount` in the live DTO (`autoRenew=false` + `endDate` exists)
- `fullyCancelledCount` (NEW) — aggregates users with `subscription.status ∈ ["canceled", "cancelled"]` OR (`subscription.endDate <= now` AND `subscription.cancelledAt` set)

This populates the schema's `cancelledCount` field with real data on every cron run, instead of hardcoding zero.

```ts
const now = new Date();
const yesterdayDate = new Date(now);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterdayInSydney = formatInTimeZone(yesterdayDate, "Australia/Sydney", "yyyy-MM-dd");

const liveData = await new MembershipAnalyticsService().getMembershipByPackageLiveForSnapshot();

for (const pkg of liveData.packages) {
  const unitPriceCents = Math.round((getPackageById(pkg.packageId)?.price ?? 0) * 100);
  await MembershipDailySnapshot.findOneAndUpdate(
    { date: yesterdayInSydney, packageId: pkg.packageId },
    {
      $set: {
        tz: "Australia/Sydney",
        activeCount: pkg.activeCount,
        pastDueCount: pkg.pastDueCount,
        scheduledCancelCount: pkg.scheduledCancelCount,
        cancelledCount: pkg.fullyCancelledCount,
        unitPriceCents,
        activeRevenue: Math.round(pkg.activeCount * unitPriceCents) / 100,
        pastDueRevenue: Math.round(pkg.pastDueCount * unitPriceCents) / 100,
        confidence: "live",
        computedAt: now,
        sourceVersion: SNAPSHOT_SOURCE_VERSION,
      },
    },
    { upsert: true }
  );
}
```

Wrapped in `try/catch` with structured error logging via the existing error-reporting infrastructure.

### 9.4 DST edge cases

- **April (AEDT → AEST, 25-hour day):** Cron fires at 14:00 *and* 15:00 UTC. The local "yesterday" date string is unambiguous because we read it once via `formatInTimeZone`. The duplicated 02:00–03:00 hour is invisible — we don't snapshot mid-day.
- **October (AEST → AEDT, 23-hour day):** Same — fires twice, local date increments by one cleanly.

Tested via an extension to `scripts/test-dst-transitions.ts`.

## 10. Reliability layers

Three layers, none of which complicate the daily cron:

1. **Simple cron handler.** No self-heal logic, no historical reconstruction inside the hot path. ~30 lines, wrapped in `try/catch`.
2. **Two daily fires** (14:00 and 15:00 UTC) for redundancy. Idempotent upserts make the second fire free insurance.
3. **Health-check endpoint** `GET /api/admin/health/membership-snapshot`:
   - Returns `{ ok: true, missingDays: [] }` or `{ ok: false, missingDays: ["yyyy-MM-dd", ...] }`.
   - Checks rows from the cron's first deployment date (or last 7 days, whichever is shorter) for gaps.
   - Read-only — does not write or fix.
   - Fix path: manually invoke the cron handler with a stub date, or accept the gap and live with the snapshot-missing fallback for that one day.

DJ explicitly chose not to add active alerting (Slack/email) at this stage.

## 11. Cleanup script details

`scripts/cleanup-membership-backfill-rows.ts` is a one-shot script that prepares the database for the new system by removing pre-existing backfill rows.

```ts
const dryRun = process.argv.includes("--dry-run");

const historyFilter = {
  $or: [
    { source: { $regex: /^backfill_/ } },
    { "metadata.backfill": true },
  ],
};

const renewalFilter = { confidence: "backfill" };

const historyCount = await MembershipStatusHistory.countDocuments(historyFilter);
const renewalCount = await MembershipRenewalCycle.countDocuments(renewalFilter);

console.log(dryRun ? "DRY RUN — no deletes" : "LIVE — deleting backfill rows");
console.log(`Would delete: ${historyCount} history rows, ${renewalCount} renewal rows`);

if (!dryRun) {
  const histDelete = await MembershipStatusHistory.deleteMany(historyFilter);
  const renDelete = await MembershipRenewalCycle.deleteMany(renewalFilter);
  console.log(`Deleted: ${histDelete.deletedCount} history rows, ${renDelete.deletedCount} renewal rows`);
}
```

**Wired into `package.json`** as `cleanup:membership-backfill` and `cleanup:membership-backfill:dry`.

**Run order:** first `:dry`, eyeball the counts, then live. Run **before** PR 2 (cron) and PR 3 (read path) ship — but it can run independently of either.

**The deleted `scripts/backfill-membership-analytics.ts`** had four bugs documented in the previous spec revision. With the script removed, those bugs are no longer tracked — the analytics collections are now only written by the real webhook handlers (`webhook_invoice_payment_failed` for past-due, `cancel_api_user`/`cancel_api_admin` for cancellation) plus the new `webhook_subscription_created`/`webhook_subscription_updated_active` writes added in Section 7.

## 12. Testing

### 12.1 DST transition test

`scripts/test-membership-snapshot-dst.ts`:
- Walks October 2026 AEDT-start boundary.
- Walks April 2027 AEDT-end boundary.
- Asserts the cron handler's date-key computation, when invoked at 14:00 UTC and 15:00 UTC on each side, produces the correct local date.
- Asserts no day is double-written or skipped.

Wired into `package.json` as `test:membership-snapshot-dst`.

### 12.2 End-to-end smoke (manual, documented in PR description)

After deploy:
1. Run cleanup script `--dry-run`, confirm row counts match expectations, then run live.
2. Wait for the first cron fire (or trigger manually via the cron endpoint with `Bearer ${CRON_SECRET}`).
3. Hit `GET /api/admin/health/membership-snapshot`, expect `{ ok: true, missingDays: [yesterday-1, ...] }` — older days will all be flagged as missing, which is expected and correct.
4. Open dashboard, switch to "today" — see live counts (no badge).
5. Switch to "yesterday" after the cron has run for a day — see counts as of yesterday with "Status as of {date}" badge.
6. Switch to a custom range ending two weeks ago — see "Showing live counts (snapshot unavailable for this date)" message. This is the correct behavior; we don't fabricate historical data.
7. Switch to a future-dated custom range — falls back to live without errors.

### 12.3 Not testing

- Vercel cron scheduling itself — that's Vercel's job. We test the handler in isolation.
- Per-user drill-down modals — they continue to use live data, unchanged.

## 13. Migration / deployment order

Three PRs, in order:

1. **PR 1 — Cleanup + Foundation:**
   - Add `scripts/cleanup-membership-backfill-rows.ts`.
   - **Run `:dry` against production, eyeball counts, then run live.**
   - Delete `scripts/backfill-membership-analytics.ts` and its `package.json` entry.
   - Add `MembershipDailySnapshot` model.
   - Add `appendActivationStatus` helper + wire into Stripe webhook activation paths (Section 7).
   - Update `CLAUDE.md` manifest + domain docs.
   - No dashboard reads change yet — behavior unchanged.

2. **PR 2 — Cron + Health Check:**
   - Add `getMembershipByPackageLiveForSnapshot` to the analytics service.
   - Add cron route + `vercel.json` schedule(s).
   - Add health-check endpoint.
   - Add DST transition test.
   - Cron immediately starts writing forward-going `confidence: "live"` rows from the day after deployment.

3. **PR 3 — Read Path:**
   - Update `parseAdminDashboardDateRange` to dispatch.
   - Wire `getMembershipByPackageSnapshot` to read from the new collection (with live fallback when row missing).
   - Update lifecycle chart route.
   - Update Cancellations card route.
   - Light up the "as of {date}" badge in the breakdown UI; show "Showing live counts (snapshot unavailable)" for past dates with no row.

**Expected runtime behavior:** Until at least one cron fire has succeeded, every snapshot read for any past date returns live data with `snapshotMissing: true`. Once the cron has run for N days, those N days will display correctly; older days continue to show "snapshot unavailable." This is the correct, explicit, no-fabrication behavior DJ chose.

## 14. Open questions / explicitly deferred

- **Active alerting on cron failure** — deferred. Health-check endpoint exists; DJ to monitor manually for now.
- **Per-user drill-down modal point-in-time** — out of scope. Continues to query live `User.subscription`.
- **Historical reconstruction (any window)** — explicitly out of scope. DJ chose accuracy-from-today over best-effort retroactive coverage.
- **Webhook-driven incremental snapshot updates** — explicitly skipped; daily cron is sufficient.
