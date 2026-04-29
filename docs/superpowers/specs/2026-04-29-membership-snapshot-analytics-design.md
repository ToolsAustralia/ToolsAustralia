# Membership Snapshot Analytics — Design Spec

**Date:** 2026-04-29
**Author:** DJ (with Claude Code assistance)
**Status:** Draft — pending user review

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
2. Historical accuracy goal: ~90 days of point-in-time counts, with `confidence: "live"` for days written by the going-forward cron and `confidence: "backfill"` for reconstructed days.
3. Day-by-day reads must be **fast** (single indexed lookup, no per-user aggregation pipeline).
4. The cron writes must be **DST-safe** for the `Australia/Sydney` zone — no missed or double-written days across AEST↔AEDT transitions.
5. The cron must be **redundantly scheduled** so a single Vercel hiccup cannot leave a gap, and gaps must be **observable** so DJ can fix them with a one-line script invocation.
6. Frozen pricing semantics: a future package price change must not retroactively rewrite historical revenue.

## 3. Non-Goals

- Reconstructing point-in-time data for periods older than ~90 days — the source data has too much state churn (untracked `past_due → active` recoveries) for backfilled accuracy to be meaningful that far back.
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
└─────────────────────────────────────────────────────────────────────┘
              ▲                                  │
              │ writes                           │ reads
       ┌──────┴──────┬──────────────┐            │
       │             │              │            │
   one-shot      nightly cron   (no live    ┌────┴───────────────────┐
   backfill      (×2 fires +    webhook     │ MembershipAnalyticsSvc │
   script        health-check)  writers)    │  · getByPackageSnapshot│
   90 days       confidence:                │  · getByPackageLive    │
   confidence:   "live"                     └────┬───────────────────┘
   "backfill"                                    │
                                                 │ called by
                                          ┌──────┴────────────────────┐
                                          │ /api/admin/dashboard/...  │
                                          │  · membership-by-package  │
                                          │  · stats (cancellations)  │
                                          │  · membership-lifecycle   │
                                          └───────────────────────────┘
```

**Three writers, three readers, one source of truth.**

The dispatch decision lives in `parseAdminDashboardDateRange` — it computes `asOfDate = min(endDate, end-of-today-Sydney)` and sets `membershipAsOfMode = "live"` when `asOfDate` covers today, else `"snapshot"`. Routes call `getMembershipByPackageSnapshot(asOfDate)` or `getMembershipByPackageLive()` accordingly.

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

  confidence: "live" | "backfill"; // "live" = cron from real state; "backfill" = reconstructed
  computedAt: Date;                // wall-clock of when row was written
  sourceVersion: number;           // bump when reconstruction algorithm changes
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

## 6. Reconstruction algorithm (backfill)

For each user with a subscription, walk forward day-by-day from `subscription.startDate ?? createdAt` to today. The user's state on day **D** is determined by the most recent signal at or before **D**, in this priority order:

1. **`MembershipStatusHistory` events** with `effectiveAt <= D` — sorted desc, take the latest. Most authoritative.
2. **`MembershipRenewalCycle` events** as positive activity signal — a `succeeded` cycle at `succeededAt <= D` confirms the user was active on D (until the next signal); a `failed` cycle at `failedAt <= D` confirms `past_due` entry.
3. **`User.subscription` rewound** as fallback:
   - `cancelledAt > D` → not yet cancelled on that day
   - `pastDueAt > D` → not yet past_due on that day
   - Otherwise → `active`
4. **Activation start gate** — user is `none` (not in any bucket) for any **D** before `subscription.startDate ?? earliest BenefitsGranted timestamp ?? createdAt`. Handles signups within the 90-day window correctly.
5. **endDate cap** — if `subscription.endDate <= D` and on a cancellation track → `cancelled`; if `endDate > D` and `autoRenew = false` → `scheduled_cancel`.

### 6.1 Known accuracy limitation

We have no record of `past_due → active` recovery in current data. A user past-due on Mar 10 who recovered Mar 12 will look past-due on Mar 11 in the backfill. Going forward, this is fixed by the new history writes (Section 7); historically it is lossy. All backfilled rows carry `confidence: "backfill"` so the UI can flag them.

### 6.2 Activation seed (one-time, runs before snapshot backfill)

For every currently-active user with no `active` history row, write one row to `MembershipStatusHistory` at `subscription.startDate ?? earliest BenefitsGranted timestamp ?? createdAt`, with `dedupeKey: backfill_active_${userId}`. Idempotent. Makes future snapshot reads cleaner.

### 6.3 Process

1. Read all users with `isActive: true` and `subscription.packageId ∈ SUBSCRIPTION_PACKAGE_IDS` once (~8000 docs).
2. Read all `MembershipStatusHistory` rows from the last 100 days, indexed by `userId`.
3. Read all `MembershipRenewalCycle` rows from the last 100 days, indexed by `userId`.
4. For each of the last 90 days (in Sydney local time), walk users and tally counts per package.
5. Upsert one row per `(date, packageId)` with `confidence: "backfill"`.

`--dry-run` prints per-day counts and flags any user reconstructions that fell back to "current state assumptions" for spot-check.

## 7. Going-forward writes

To keep `MembershipStatusHistory` complete from this point onward (the precondition for accurate future snapshot reads), add an `active` history write at every place a subscription transitions to `active` or `trialing`:

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

**Precondition:** Extend `MembershipAnalyticsService` with a new method `getMembershipByPackageLiveForSnapshot()` (or extend `getMembershipByPackageLive` with an extra field) that returns all four counts the snapshot model needs:

- `activeCount` (active + trialing) — already computed by `getActiveSubscriptionFilter(false)`
- `pastDueCount` — already computed
- `scheduledCancelCount` — currently exposed as `cancelledCount` in the live DTO (`autoRenew=false` + `endDate` exists)
- `fullyCancelledCount` (NEW) — aggregates users with `subscription.status ∈ ["canceled", "cancelled"]` OR (`subscription.endDate <= now` AND `subscription.cancelledAt` set)

This avoids the cron writing `0` for fully-cancelled forward-going rows while backfill rows carry real values.

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
   - Checks the last 7 days for missing rows.
   - Read-only — does not write or fix.
   - Fix path: re-run `scripts/backfill-membership-daily-snapshot.ts --from <date> --to <date>` for the gap.

DJ explicitly chose not to add active alerting (Slack/email) at this stage.

## 11. Existing backfill script fixes

[scripts/backfill-membership-analytics.ts](scripts/backfill-membership-analytics.ts) has four bugs that must be fixed before the new snapshot backfill runs against it.

### Bug 1 — `dueAt` semantics mismatch ([line 47](scripts/backfill-membership-analytics.ts#L47))

`const dueAt = ev.timestamp ? new Date(ev.timestamp) : new Date()` uses *paid-at* time as the renewal due-at. The webhook ([membershipAnalyticsPersistence.ts line 39](src/services/admin/membershipAnalyticsPersistence.ts#L39)) uses `invoice.period_end`. These differ — the snapshot reconstruction queries `MembershipRenewalCycle.dueAt` to find the billing window.

**Fix:** extract `period_end` from the original `PaymentEvent.data` payload, fall back to `ev.timestamp` only if missing, and tag those rows `confidence: "backfill-fallback"` so they're distinguishable.

### Bug 2 — Cancel branch dead code ([lines 117–122](scripts/backfill-membership-analytics.ts#L117-L122))

Both branches of the inner ternary return `"scheduled_cancel"`, so the `autoRenew === false` check is uselessly checked. Reading the intent: this should distinguish users who *fully cancelled* vs. those who *scheduled cancel for end-of-period*.

**Fix:**
```ts
const status: MembershipNormalizedStatus =
  u.subscription?.status === "canceled" || u.subscription?.status === "cancelled"
    ? "canceled"
    : u.subscription?.endDate && u.subscription.endDate <= new Date()
      ? "canceled"           // scheduled cancel that has elapsed
      : "scheduled_cancel";  // scheduled but still active
```

### Bug 3 — One row per user per status (lossy)

The script writes only the most recent `pastDueAt` / `cancelledAt` per user, losing repeat transitions. Going forward, webhook + service writes will produce multiple rows per user. For backfill, the available data only carries the *last* state, so this is genuinely lossy and not fixable from current data.

**Fix:** document the limitation clearly in the script header. No code change.

### Bug 4 — `succeededAt` falls back to `new Date()` ([line 60](scripts/backfill-membership-analytics.ts#L60))

`succeededAt: ev.timestamp ?? new Date()` — defaulting a *historical* event's success time to *now* will produce nonsense if `ev.timestamp` is ever missing.

**Fix:** strict check — skip the row entirely if `ev.timestamp` is missing, log a warning. Better a missing row than a fabricated one.

### Plus: activation seed pass

Adds Section 6.2's logic. Idempotent; safe to re-run.

### Updated script summary report

`{ renewalCyclesWritten, activationSeedRows, pastDueRows, cancelRows, skippedDueToMissingTimestamp }`.

## 12. Testing

### 12.1 Reconstruction algorithm test

`scripts/test-membership-snapshot-reconstruction.ts`. Hand-built fixture users:
- Active throughout the window
- Past-due mid-window, never recovered
- Past-due mid-window, recovered (the lossy case — assert we acknowledge inaccuracy)
- Scheduled-cancel mid-window with future endDate
- Fully-cancelled before window
- Signed up mid-window

Walks 30 simulated days, asserts per-day state per user matches expected.

Wired into `package.json` as `test:membership-snapshot`.

### 12.2 DST transition test

Extends `scripts/test-dst-transitions.ts` (or new file `test-membership-snapshot-dst.ts`):
- Walks October 2026 AEDT-start boundary.
- Walks April 2027 AEDT-end boundary.
- Asserts the cron handler, when invoked at 14:00 UTC and 15:00 UTC on each side, writes a row keyed to the correct local date.
- Asserts no day is double-written or skipped.

### 12.3 End-to-end smoke (manual, documented in PR description)

After deploy:
1. Run backfill script `--dry-run` first; eyeball per-day counts.
2. Run live backfill.
3. Hit `GET /api/admin/health/membership-snapshot`, expect `{ ok: true }`.
4. Open dashboard, switch to "yesterday," confirm count differs from "today" if anything has changed in the live DB.
5. Switch to a custom range ending Mar 30 (a deeply backfilled date), confirm "as of Mar 30 (reconstructed)" badge shows + counts look plausible.
6. Switch to a future-dated custom range, confirm it falls back to live without errors.

### 12.4 Not testing

- Vercel cron scheduling itself — that's Vercel's job. We test the handler in isolation.
- Per-user drill-down modals — they continue to use live data, unchanged.

## 13. Migration / deployment order

To avoid the dashboard showing wrong data mid-deploy:

1. **PR 1 — model + going-forward writes:**
   - Add `MembershipDailySnapshot` model.
   - Add `appendMembershipStatusHistory` calls at activation paths (Section 7).
   - Update `CLAUDE.md` manifest.
   - No reads change yet. Existing dashboard behavior unchanged.

2. **PR 2 — backfill script + activation seed:**
   - Fix the four bugs in `backfill-membership-analytics.ts`.
   - Add activation seed pass.
   - Add `scripts/backfill-membership-daily-snapshot.ts`.
   - `package.json` entries `backfill:membership-snapshot`, `backfill:membership-snapshot:dry`.
   - **Deploy, then run `:dry`, eyeball, then run live.**

3. **PR 3 — cron + health check:**
   - Add cron route + `vercel.json` schedule.
   - Add health-check endpoint.
   - Cron immediately starts writing forward-going `confidence: "live"` rows.

4. **PR 4 — read path:**
   - Update `parseAdminDashboardDateRange` to dispatch.
   - Wire `getMembershipByPackageSnapshot` to read from the new collection.
   - Update lifecycle chart route.
   - Update Cancellations card route.
   - Light up the "as of {date}" badge in the breakdown UI.

This sequencing means the snapshot table is fully populated *before* the read path starts trusting it.

## 14. Open questions / explicitly deferred

- **Active alerting on cron failure** — deferred. Health-check endpoint exists; DJ to monitor manually for now.
- **Per-user drill-down modal point-in-time** — out of scope. Continues to query live `User.subscription`.
- **Older-than-90-day historical reconstruction** — explicitly out of scope; the source data quality drops sharply past 90 days.
- **Webhook-driven incremental snapshot updates** — explicitly skipped; daily cron + history log is sufficient.
