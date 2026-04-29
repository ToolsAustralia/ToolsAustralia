# Membership Snapshot Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin dashboard's membership-related cards (KPI Membership Statuses, per-package breakdown, Cancellations card, Lifecycle chart) display **point-in-time** counts for the selected date range — using the last day of the range as the "as of" date, falling back to live counts for today/future. **No historical reconstruction** — accuracy starts from the cron's first successful run.

**Architecture:** New `MembershipDailySnapshot` collection (one row per local-Sydney date × packageId), populated *only* by a nightly DST-safe cron. Past-date reads with no snapshot row return live counts with a `snapshotMissing: true` flag (UI shows "Showing live counts — snapshot unavailable for this date"). Pre-existing backfill rows in `MembershipStatusHistory` and `MembershipRenewalCycle` are removed by a one-shot cleanup script, and the deprecated `scripts/backfill-membership-analytics.ts` is deleted.

**Tech Stack:** Next.js 15 App Router, Mongoose, `date-fns-tz` (`Australia/Sydney` IANA zone), Vercel Cron, TanStack Query (existing), Recharts (existing).

**Source spec:** [docs/superpowers/specs/2026-04-29-membership-snapshot-analytics-design.md](../specs/2026-04-29-membership-snapshot-analytics-design.md) (revised post-approval).

**Commit policy:** Per `CLAUDE.md` Hard Rule 1 (no auto-commit), no task in this plan runs `git commit`. Each PR boundary ends with a **STOP** instruction — hand back to DJ for review and commit.

---

## File Structure

**New files:**
- `src/models/MembershipDailySnapshot.ts` — Mongoose model
- `scripts/cleanup-membership-backfill-rows.ts` — one-shot cleanup of pre-existing backfill rows
- `src/app/api/cron/membership-daily-snapshot/route.ts` — nightly snapshot cron
- `src/app/api/admin/health/membership-snapshot/route.ts` — gap-detection health check
- `scripts/test-membership-snapshot-dst.ts` — DST boundary test (tsx)

**Deleted files:**
- `scripts/backfill-membership-analytics.ts` — deprecated, deleted in PR 1

**Modified files:**
- `CLAUDE.md` — manifest entries for new files
- `package.json` — add `cleanup:membership-backfill`, `:dry`, `test:membership-snapshot-dst`; remove the entry for the deleted backfill script
- `vercel.json` — add cron schedule(s)
- `src/utils/admin/dashboardDateRange.ts` — replace hardcoded `mode = "live"` with real dispatch
- `src/services/admin/MembershipAnalyticsService.ts` — add `getMembershipByPackageLiveForSnapshot`; rewrite `getMembershipByPackageSnapshot` to read from snapshot table
- `src/services/admin/membershipAnalyticsPersistence.ts` — add `appendActivationStatus` helper
- `src/app/api/stripe/webhook/route.ts` — append `active`/`trialing` history row in `handleSubscriptionCreated` and on `subscription.updated` recovery
- `src/app/api/admin/dashboard/membership-by-package/route.ts` — dispatch on `mode`
- `src/app/api/admin/dashboard/stats/route.ts` — point cancellation-impact at snapshot when historical
- `src/app/api/admin/metrics/users/route.ts` — lifecycle chart pass-through `asOfDate`
- `src/services/metrics/UserMetricsService.ts` — accept `asOfDate` and read snapshot when present
- `src/app/admin/component/overview/MembershipBreakdownSection.tsx` — light up the "as of" / "snapshot unavailable" badge
- `src/app/admin/component/overview/KPIMetricsGrid.tsx` — adjust card title when in snapshot mode
- `docs/subscription/models.md`, `docs/subscription/architecture.md` — document the new collection + activation writes
- `docs/metrics-analytics/architecture.md` — document the snapshot read path

---

# PR 1 — Cleanup + Foundation

Goal: clean up pre-existing backfill rows, delete the deprecated backfill script, ship the new collection, and start writing `active`/`trialing` history rows at activation paths so the event log is complete from deployment forward. No reads change yet.

---

### Task 1.1: Create the cleanup script

**Files:**
- Create: `scripts/cleanup-membership-backfill-rows.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the script**

```ts
/**
 * One-shot cleanup of pre-existing backfill rows in the analytics collections.
 *
 * Removes rows written by the now-deleted scripts/backfill-membership-analytics.ts:
 *   - MembershipStatusHistory rows with source matching /^backfill_/ OR metadata.backfill === true
 *   - MembershipRenewalCycle rows with confidence === "backfill"
 *
 * Webhook-written rows (real, captured at the time of the actual transition) are kept.
 *
 * Usage:
 *   npx tsx scripts/cleanup-membership-backfill-rows.ts --dry-run
 *   npx tsx scripts/cleanup-membership-backfill-rows.ts
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "DRY RUN — no deletes" : "LIVE — deleting backfill rows");

  await connectDB();

  const historyFilter = {
    $or: [
      { source: { $regex: /^backfill_/ } },
      { "metadata.backfill": true },
    ],
  };
  const renewalFilter = { confidence: "backfill" };

  const historyCount = await MembershipStatusHistory.countDocuments(historyFilter);
  const renewalCount = await MembershipRenewalCycle.countDocuments(renewalFilter);

  console.log(`MembershipStatusHistory rows matching backfill filter: ${historyCount}`);
  console.log(`MembershipRenewalCycle rows matching backfill filter:  ${renewalCount}`);

  if (!dryRun) {
    const histDelete = await MembershipStatusHistory.deleteMany(historyFilter);
    const renDelete = await MembershipRenewalCycle.deleteMany(renewalFilter);
    console.log(`Deleted: ${histDelete.deletedCount} history rows, ${renDelete.deletedCount} renewal rows`);
  } else {
    console.log("(dry run — no rows deleted)");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

Edit `package.json`. In `"scripts"`, add:

```json
"cleanup:membership-backfill": "tsx scripts/cleanup-membership-backfill-rows.ts",
"cleanup:membership-backfill:dry": "tsx scripts/cleanup-membership-backfill-rows.ts --dry-run",
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS (zero errors)

- [ ] **Step 4: Smoke-test the dry-run locally**

Run: `npm run cleanup:membership-backfill:dry`
Expected: connects to DB, prints both row counts, prints `(dry run — no rows deleted)`, exits 0.

---

### Task 1.2: Delete the deprecated `backfill-membership-analytics.ts`

**Files:**
- Delete: `scripts/backfill-membership-analytics.ts`
- Modify: `package.json` (remove the corresponding npm script entry, if present)

- [ ] **Step 1: Confirm whether `package.json` references the old script**

Run: `grep -n "backfill-membership-analytics\|backfill:membership-analytics" package.json`
Expected: zero matches OR a single `backfill:*` entry referencing the file.

- [ ] **Step 2: If the entry exists, remove it from `package.json`**

Edit `package.json` and remove the line.

- [ ] **Step 3: Delete the script file**

Run: `rm scripts/backfill-membership-analytics.ts`
Expected: file removed.

- [ ] **Step 4: Confirm no source code imports it**

Run: `grep -rn "backfill-membership-analytics" src scripts || echo "no references"`
Expected: prints `no references`.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 1.3: Create the `MembershipDailySnapshot` Mongoose model

**Files:**
- Create: `src/models/MembershipDailySnapshot.ts`

- [ ] **Step 1: Create the model file**

```ts
import mongoose, { Document, Schema } from "mongoose";

export const SNAPSHOT_SOURCE_VERSION = 1;

export interface IMembershipDailySnapshot extends Document {
  date: string;
  packageId: string;
  tz: "Australia/Sydney";
  activeCount: number;
  pastDueCount: number;
  scheduledCancelCount: number;
  cancelledCount: number;
  unitPriceCents: number;
  activeRevenue: number;
  pastDueRevenue: number;
  confidence: "live";
  computedAt: Date;
  sourceVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipDailySnapshotSchema = new Schema<IMembershipDailySnapshot>(
  {
    date: { type: String, required: true, index: true },
    packageId: { type: String, required: true },
    tz: { type: String, required: true, default: "Australia/Sydney" },
    activeCount: { type: Number, required: true, default: 0 },
    pastDueCount: { type: Number, required: true, default: 0 },
    scheduledCancelCount: { type: Number, required: true, default: 0 },
    cancelledCount: { type: Number, required: true, default: 0 },
    unitPriceCents: { type: Number, required: true, default: 0 },
    activeRevenue: { type: Number, required: true, default: 0 },
    pastDueRevenue: { type: Number, required: true, default: 0 },
    confidence: { type: String, required: true, enum: ["live"] },
    computedAt: { type: Date, required: true },
    sourceVersion: { type: Number, required: true, default: SNAPSHOT_SOURCE_VERSION },
  },
  {
    timestamps: true,
    collection: "membershipdailysnapshots",
  }
);

MembershipDailySnapshotSchema.index({ date: 1, packageId: 1 }, { unique: true });

export default (mongoose.models.MembershipDailySnapshot as mongoose.Model<IMembershipDailySnapshot>) ||
  mongoose.model<IMembershipDailySnapshot>("MembershipDailySnapshot", MembershipDailySnapshotSchema);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 1.4: Add the new model to the Domain Manifest in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (the `subscription` domain block inside the JSON manifest)

- [ ] **Step 1: Open `CLAUDE.md` and find the `subscription` domain entry**

Locate the line `"src/models/MembershipStatusHistory.ts"` inside `domains.subscription.paths`.

- [ ] **Step 2: Add the new model path right after it**

Change:
```json
"src/models/MembershipStatusHistory.ts",
"src/models/ChargeJobLock.ts",
```

To:
```json
"src/models/MembershipStatusHistory.ts",
"src/models/MembershipDailySnapshot.ts",
"src/models/ChargeJobLock.ts",
```

- [ ] **Step 3: Bump `lastModified` at the top of the JSON manifest to `2026-04-29`**

- [ ] **Step 4: Bump `domains.subscription.lastVerified` to `2026-04-29`**

- [ ] **Step 5: Verify the manifest still parses**

Run: `node -e "const fs=require('fs');const t=fs.readFileSync('CLAUDE.md','utf8');const m=t.match(/\`\`\`json\n([\s\S]+?)\n\`\`\`/);JSON.parse(m[1]);console.log('OK')"`
Expected: prints `OK`.

---

### Task 1.5: Document the new collection in domain docs

**Files:**
- Modify: `docs/subscription/models.md`

- [ ] **Step 1: Append the new section to `docs/subscription/models.md`**

```markdown
## MembershipDailySnapshot

[src/models/MembershipDailySnapshot.ts](../../src/models/MembershipDailySnapshot.ts)

Per-day, per-package roll-up of membership counts and revenue, used by the admin dashboard to display point-in-time membership data for any selected past date.

**Key fields:**
- `date` (string, `yyyy-MM-dd` in `Australia/Sydney`) — the local-Sydney calendar day this row describes.
- `packageId` — `tradie-subscription` | `foreman-subscription` | `boss-subscription`.
- `activeCount`, `pastDueCount`, `scheduledCancelCount`, `cancelledCount` — bucket counts at end-of-day local time.
- `unitPriceCents` — package price at snapshot time, locked in to make historical revenue immutable across future price changes.
- `activeRevenue`, `pastDueRevenue` — pre-computed `count × unitPriceCents / 100`.
- `confidence` — `"live"` only. The collection is populated exclusively by the nightly cron; no reconstruction is performed.

**Writers:** `src/app/api/cron/membership-daily-snapshot/route.ts` (nightly).

**Readers:** `MembershipAnalyticsService.getMembershipByPackageSnapshot(asOfDate)`.

**Behavior on missing rows:** When the snapshot reader is asked for a date with no row (e.g., any date before this collection was first populated, or a one-off cron outage), it falls back to live counts and sets `summary.snapshotMissing: true` so the UI can flag the result.

**Indexes:** `{ date: 1, packageId: 1 }` unique; `{ date: 1 }`.
```

---

### Task 1.6: Add the `appendActivationStatus` helper

**Files:**
- Modify: `src/services/admin/membershipAnalyticsPersistence.ts`

- [ ] **Step 1: Add the helper function at the bottom of the file**

```ts
/**
 * Append an "active" or "trialing" history row when a subscription becomes active.
 * Idempotent via stable dedupeKey. Safe to call from webhook + service paths.
 */
export async function appendActivationStatus(input: {
  userId: mongoose.Types.ObjectId;
  effectiveAt: Date;
  source: string;
  subscriptionPackageId?: string;
  isTrialing?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const status: MembershipNormalizedStatus = input.isTrialing ? "trialing" : "active";
  const dedupeKey = `${input.source}_${input.userId.toString()}_${input.effectiveAt.getTime()}_${status}`;

  await appendMembershipStatusHistory({
    userId: input.userId,
    effectiveAt: input.effectiveAt,
    membershipStatus: status,
    actor: "stripe",
    source: input.source,
    dedupeKey,
    subscriptionPackageId: input.subscriptionPackageId,
    metadata: input.metadata,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 1.7: Wire activation history writes into Stripe webhook

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts` (around `handleSubscriptionCreated` at line 1517 and the `customer.subscription.updated` handler)

- [ ] **Step 1: Update the imports**

In the existing import block at the top of the file, change:

```ts
import {
  appendMembershipStatusHistory,
  upsertRenewalCycleFromFailedInvoice,
  upsertRenewalCycleFromPaidInvoice,
} from "@/services/admin/membershipAnalyticsPersistence";
```

To:

```ts
import {
  appendActivationStatus,
  appendMembershipStatusHistory,
  upsertRenewalCycleFromFailedInvoice,
  upsertRenewalCycleFromPaidInvoice,
} from "@/services/admin/membershipAnalyticsPersistence";
```

- [ ] **Step 2: Locate `handleSubscriptionCreated` body**

Run: `grep -n "async function handleSubscriptionCreated" src/app/api/stripe/webhook/route.ts`
Expected: shows line ~1517.

Read the function from that line forward to find the point where the user's subscription is persisted (typically after `await user.save()` or equivalent).

- [ ] **Step 3: Append the activation row at the end of the success path**

Immediately after the user's subscription persistence, add:

```ts
if (subscription.status === "active" || subscription.status === "trialing") {
  try {
    const pkgId = user.subscription?.packageId != null ? String(user.subscription.packageId) : undefined;
    await appendActivationStatus({
      userId: new mongoose.Types.ObjectId(String(user._id)),
      effectiveAt: new Date(subscription.created * 1000),
      source: "webhook_subscription_created",
      subscriptionPackageId: pkgId,
      isTrialing: subscription.status === "trialing",
      metadata: { stripeSubscriptionId: subscription.id, status: subscription.status },
    });
  } catch (err) {
    console.error("Failed to append activation history from subscription.created:", err);
  }
}
```

- [ ] **Step 4: Locate the `customer.subscription.updated` handler**

Run: `grep -n "customer.subscription.updated\|prevSubStatus" src/app/api/stripe/webhook/route.ts | head -10`
Expected: shows the handler body and the existing `prevSubStatus` comparison logic.

- [ ] **Step 5: Add an activation-on-recovery write in the updated handler**

Immediately after the user save in the updated handler, add (placement: near the existing `prevSubStatus !== "past_due"` block, but as a new sibling block):

```ts
if (
  (user.subscription?.status === "active" || user.subscription?.status === "trialing") &&
  prevSubStatus !== "active" &&
  prevSubStatus !== "trialing"
) {
  try {
    const pkgId = user.subscription?.packageId != null ? String(user.subscription.packageId) : undefined;
    await appendActivationStatus({
      userId: new mongoose.Types.ObjectId(String(user._id)),
      effectiveAt: new Date(),
      source: "webhook_subscription_updated_active",
      subscriptionPackageId: pkgId,
      isTrialing: user.subscription?.status === "trialing",
      metadata: { stripeSubscriptionId: subscription.id, fromStatus: prevSubStatus, toStatus: user.subscription.status },
    });
  } catch (err) {
    console.error("Failed to append activation history from subscription.updated:", err);
  }
}
```

- [ ] **Step 6: Type-check + lint**

Run: `npm run type-check`
Expected: PASS

Run: `npm run lint`
Expected: PASS

---

### Task 1.8: Document the activation-write change

**Files:**
- Modify: `docs/subscription/architecture.md` (or `docs/billing-stripe/architecture.md` — pick whichever already documents webhook subscription handlers)

- [ ] **Step 1: Find the right doc**

Run: `grep -l "handleSubscriptionCreated\|subscription.created" docs/`
Expected: returns 0–2 candidates; pick the most relevant.

- [ ] **Step 2: Append a paragraph documenting the new write**

```markdown
### Activation history writes (added 2026-04-29)

`handleSubscriptionCreated` and the `customer.subscription.updated` handler both append a row to `MembershipStatusHistory` (status `active` or `trialing`, source `webhook_subscription_created` / `webhook_subscription_updated_active`) whenever a subscription transitions into an active state. This makes the event log complete from this date forward, so future tooling can reconstruct membership state from history alone if needed.
```

---

### PR 1 — STOP HERE

**Hand back to DJ.** Summary:
- Cleanup script added; **DJ must run `:dry` then live to clean pre-existing backfill rows**.
- Deprecated `backfill-membership-analytics.ts` deleted.
- New `MembershipDailySnapshot` model + manifest entry + docs.
- Activation history writes wired into webhook.
- No read paths changed; dashboard behavior unchanged.

DJ reviews → DJ commits → DJ runs `npm run cleanup:membership-backfill:dry`, eyeballs counts, runs `npm run cleanup:membership-backfill` live → DJ tells you when to start PR 2.

---

# PR 2 — Cron + Health Check

Goal: stand up the nightly cron (DST-safe, redundantly fired) and the health-check endpoint. From this point onward, every successful cron run produces one accurate snapshot row per package.

---

### Task 2.1: Add `getMembershipByPackageLiveForSnapshot` to the analytics service

**Files:**
- Modify: `src/services/admin/MembershipAnalyticsService.ts` (add method below `getMembershipByPackageLive`)

- [ ] **Step 1: Add the new method**

Insert immediately after the closing brace of `getMembershipByPackageLive`:

```ts
  /**
   * Returns the four counts the snapshot model needs (including fully-cancelled).
   * Used by the cron writer; not exposed to dashboard read paths.
   */
  async getMembershipByPackageLiveForSnapshot(): Promise<{
    packages: Array<{
      packageId: string;
      activeCount: number;
      pastDueCount: number;
      scheduledCancelCount: number;
      fullyCancelledCount: number;
    }>;
  }> {
    const baseMatch = {
      "subscription.packageId": { $in: [...SUBSCRIPTION_PACKAGE_IDS] },
    };
    const now = new Date();

    const [activeResults, scheduledResults, pastDueResults, fullyCancelledResults] = await Promise.all([
      User.aggregate([
        { $match: { ...baseMatch, isActive: true, ...getActiveSubscriptionFilter(false) } },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            isActive: true,
            "subscription.status": { $in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
            "subscription.autoRenew": false,
            "subscription.endDate": { $exists: true, $ne: null },
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            isActive: true,
            "subscription.status": "past_due",
            "subscription.packageId": { $exists: true, $nin: [null, ""] },
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            $or: [
              { "subscription.status": { $in: ["canceled", "cancelled"] } },
              {
                "subscription.endDate": { $lte: now, $ne: null },
                "subscription.cancelledAt": { $ne: null },
              },
            ],
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (rows: Array<{ _id: string; count: number }>) =>
      Object.fromEntries(rows.map((r) => [String(r._id), r.count]));

    const a = toMap(activeResults);
    const s = toMap(scheduledResults);
    const p = toMap(pastDueResults);
    const c = toMap(fullyCancelledResults);

    return {
      packages: SUBSCRIPTION_PACKAGE_IDS.map((packageId) => ({
        packageId,
        activeCount: a[packageId] ?? 0,
        pastDueCount: p[packageId] ?? 0,
        scheduledCancelCount: s[packageId] ?? 0,
        fullyCancelledCount: c[packageId] ?? 0,
      })),
    };
  }
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 2.2: Create the cron route

**Files:**
- Create: `src/app/api/cron/membership-daily-snapshot/route.ts`

- [ ] **Step 1: Read an existing cron route for the auth pattern**

Run: `ls src/app/api/cron/`
Expected: lists existing cron routes.

Run: `cat src/app/api/cron/<one-of-them>/route.ts`
Expected: shows the `Bearer ${CRON_SECRET}` auth pattern.

- [ ] **Step 2: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";
import MembershipDailySnapshot, { SNAPSHOT_SOURCE_VERSION } from "@/models/MembershipDailySnapshot";
import { getPackageById } from "@/data/membershipPackages";

const TZ = "Australia/Sydney";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return unauthorized();
  }

  try {
    await connectDB();

    const now = new Date();
    const yesterdayDate = new Date(now);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayInSydney = formatInTimeZone(yesterdayDate, TZ, "yyyy-MM-dd");

    const live = await new MembershipAnalyticsService().getMembershipByPackageLiveForSnapshot();

    let written = 0;
    for (const pkg of live.packages) {
      const unitPriceCents = Math.round((getPackageById(pkg.packageId)?.price ?? 0) * 100);
      const activeRevenue = Math.round(pkg.activeCount * unitPriceCents) / 100;
      const pastDueRevenue = Math.round(pkg.pastDueCount * unitPriceCents) / 100;

      await MembershipDailySnapshot.findOneAndUpdate(
        { date: yesterdayInSydney, packageId: pkg.packageId },
        {
          $set: {
            tz: TZ,
            activeCount: pkg.activeCount,
            pastDueCount: pkg.pastDueCount,
            scheduledCancelCount: pkg.scheduledCancelCount,
            cancelledCount: pkg.fullyCancelledCount,
            unitPriceCents,
            activeRevenue,
            pastDueRevenue,
            confidence: "live",
            computedAt: now,
            sourceVersion: SNAPSHOT_SOURCE_VERSION,
          },
        },
        { upsert: true }
      );
      written += 1;
    }

    console.log("[cron membership-daily-snapshot] wrote rows", { date: yesterdayInSydney, written });
    return NextResponse.json({ ok: true, date: yesterdayInSydney, written });
  } catch (err) {
    console.error("[cron membership-daily-snapshot] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 2.3: Add the cron schedule(s) to `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Read existing `vercel.json`**

Run: `cat vercel.json`
Expected: shows existing `crons` array (or other config).

- [ ] **Step 2: Add two entries to `crons`**

Inside `"crons"` array, append:

```json
{ "path": "/api/cron/membership-daily-snapshot", "schedule": "0 14 * * *" },
{ "path": "/api/cron/membership-daily-snapshot", "schedule": "0 15 * * *" }
```

If the project's Vercel plan does not allow two crons on the same path, drop the 15:00 entry and note the loss of redundancy in `docs/subscription/architecture.md`.

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('OK')"`
Expected: prints `OK`.

---

### Task 2.4: Create the health-check endpoint

**Files:**
- Create: `src/app/api/admin/health/membership-snapshot/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import MembershipDailySnapshot from "@/models/MembershipDailySnapshot";

const TZ = "Australia/Sydney";
const SUBSCRIPTION_PACKAGE_IDS = ["tradie-subscription", "foreman-subscription", "boss-subscription"] as const;

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const now = new Date();
  const checkDates: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    checkDates.push(formatInTimeZone(d, TZ, "yyyy-MM-dd"));
  }

  const rows = await MembershipDailySnapshot.find({ date: { $in: checkDates } })
    .select("date packageId")
    .lean();

  const presentByDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!presentByDate.has(r.date)) presentByDate.set(r.date, new Set());
    presentByDate.get(r.date)!.add(r.packageId);
  }

  const missingDays: Array<{ date: string; missingPackages: string[] }> = [];
  for (const date of checkDates) {
    const present = presentByDate.get(date) ?? new Set();
    const missing = SUBSCRIPTION_PACKAGE_IDS.filter((id) => !present.has(id));
    if (missing.length > 0) missingDays.push({ date, missingPackages: missing });
  }

  return NextResponse.json({
    ok: missingDays.length === 0,
    checked: checkDates,
    missingDays,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 2.5: Add the DST transition test

**Files:**
- Create: `scripts/test-membership-snapshot-dst.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the test**

```ts
/**
 * Tests the cron handler's date-key computation across Australia/Sydney DST boundaries.
 * Asserts both the 14:00 UTC and 15:00 UTC fires produce the correct local date in
 * AEST winter, AEDT summer, and on both transition days.
 *
 * Usage: npx tsx scripts/test-membership-snapshot-dst.ts
 */

import { formatInTimeZone } from "date-fns-tz";

const TZ = "Australia/Sydney";

function dateKeyForCronAt(utcInstant: Date): string {
  const yesterday = new Date(utcInstant);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return formatInTimeZone(yesterday, TZ, "yyyy-MM-dd");
}

interface DstCase {
  name: string;
  cronTimes: string[];
  expectedDateKey: string;
}

const cases: DstCase[] = [
  {
    name: "Oct 5 cron (AEDT just started — yesterday=Oct 4 in Sydney)",
    cronTimes: ["2026-10-05T14:00:00Z", "2026-10-05T15:00:00Z"],
    expectedDateKey: "2026-10-04",
  },
  {
    name: "Apr 5 cron (AEST just resumed — yesterday=Apr 4 in Sydney)",
    cronTimes: ["2027-04-05T14:00:00Z", "2027-04-05T15:00:00Z"],
    expectedDateKey: "2027-04-04",
  },
  {
    name: "Mid-AEST winter day",
    cronTimes: ["2026-07-15T14:00:00Z", "2026-07-15T15:00:00Z"],
    expectedDateKey: "2026-07-14",
  },
  {
    name: "Mid-AEDT summer day",
    cronTimes: ["2026-12-15T14:00:00Z", "2026-12-15T15:00:00Z"],
    expectedDateKey: "2026-12-14",
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const keys = c.cronTimes.map((t) => dateKeyForCronAt(new Date(t)));
  const allMatch = keys.every((k) => k === c.expectedDateKey);
  if (allMatch) {
    console.log(`PASS  ${c.name} → ${c.expectedDateKey}`);
    pass += 1;
  } else {
    console.error(`FAIL  ${c.name} → got ${keys.join(", ")}, expected ${c.expectedDateKey}`);
    fail += 1;
  }
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Add the npm script**

Edit `package.json`:

```json
"test:membership-snapshot-dst": "tsx scripts/test-membership-snapshot-dst.ts",
```

- [ ] **Step 3: Run the test**

Run: `npm run test:membership-snapshot-dst`
Expected: `Results: 4 passed, 0 failed`

---

### PR 2 — STOP HERE

**Hand back to DJ.** Summary:
- `getMembershipByPackageLiveForSnapshot` added to service
- Cron route + Vercel schedule(s)
- Health-check endpoint
- DST test passing (4 cases)
- The collection starts populating from the first cron fire after deployment

DJ commits → DJ deploys → DJ verifies the cron fires (check Vercel logs the next morning, or manually invoke with `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/membership-daily-snapshot`) → DJ tells you when to start PR 3.

---

# PR 3 — Read Path: Wire the Snapshot into the Dashboard

Goal: route reads through the snapshot collection when `asOfDate < today`, light up the UI badge, and update the lifecycle chart + cancellations card. When no snapshot row exists for a queried date, fall back to live counts and flag `snapshotMissing: true`.

---

### Task 3.1: Update `parseAdminDashboardDateRange` to dispatch on date

**Files:**
- Modify: `src/utils/admin/dashboardDateRange.ts:122-134`

- [ ] **Step 1: Replace the hardcoded `mode = "live"` lines**

Find:

```ts
  const membershipAsOfMode: MembershipAsOfMode = "live";
  const asOfDate = null;

  return {
    ok: true,
    value: {
      startDate,
      endDate,
      dateRange,
      membershipAsOfMode,
      asOfDate,
    },
  };
```

Replace with:

```ts
  const todayEndMs = endOfToday.getTime();
  const asOfDateMs = Math.min(endDate.getTime(), todayEndMs);
  const asOfDate = new Date(asOfDateMs);
  const isFuture = endDate.getTime() > todayEndMs;
  const isToday = dateRange === "today" || asOfDateMs === todayEndMs;

  const membershipAsOfMode: MembershipAsOfMode =
    isToday || isFuture || dateRange === "all-time" ? "live" : "snapshot";

  return {
    ok: true,
    value: {
      startDate,
      endDate,
      dateRange,
      membershipAsOfMode,
      asOfDate: membershipAsOfMode === "snapshot" ? asOfDate : null,
    },
  };
```

- [ ] **Step 2: Update the JSDoc on `asOfDate`**

In the same file, update the comment block on `asOfDate` field of `ParsedAdminDashboardDateRange` to:

```ts
  /** End-of-day (Sydney) for snapshot reads; null when mode is "live". */
  asOfDate: Date | null;
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 3.2: Rewrite `getMembershipByPackageSnapshot` to read from the snapshot table

**Files:**
- Modify: `src/services/admin/MembershipAnalyticsService.ts:203-340`

- [ ] **Step 1: Add the necessary imports at the top of the file**

```ts
import { formatInTimeZone } from "date-fns-tz";
import MembershipDailySnapshot, { type IMembershipDailySnapshot } from "@/models/MembershipDailySnapshot";
```

- [ ] **Step 2: Replace the entire existing `getMembershipByPackageSnapshot` method body**

```ts
  async getMembershipByPackageSnapshot(asOfDate: Date): Promise<MembershipByPackageDataDTO> {
    const dateKey = formatInTimeZone(asOfDate, "Australia/Sydney", "yyyy-MM-dd");
    const rows = await MembershipDailySnapshot.find({ date: dateKey }).lean();

    if (rows.length === 0) {
      const live = await this.getMembershipByPackageLive();
      return {
        ...live,
        summary: { ...live.summary, snapshotMissing: true },
      };
    }

    const byPackage = new Map<string, IMembershipDailySnapshot>();
    for (const r of rows) byPackage.set(r.packageId, r as IMembershipDailySnapshot);

    let totalActiveCount = 0;
    let totalPastDueCount = 0;
    let totalActiveRevenue = 0;
    let totalPastDueRevenue = 0;

    const packages: MembershipByPackageItemDTO[] = SUBSCRIPTION_PACKAGE_IDS.map((packageId) => {
      const row = byPackage.get(packageId);
      const activeCount = row?.activeCount ?? 0;
      const pastDueCount = row?.pastDueCount ?? 0;
      const cancelledCount = row?.scheduledCancelCount ?? 0; // dashboard's "cancelled" = scheduled
      const activeRevenue = row?.activeRevenue ?? 0;
      const pastDueRevenue = row?.pastDueRevenue ?? 0;

      totalActiveCount += activeCount;
      totalPastDueCount += pastDueCount;
      totalActiveRevenue += activeRevenue;
      totalPastDueRevenue += pastDueRevenue;

      return {
        packageId,
        packageName: getPackageById(packageId)?.name ?? packageId,
        activeCount,
        cancelledCount,
        pastDueCount,
        activeRevenue,
        pastDueRevenue,
      };
    });

    return {
      packages,
      summary: {
        totalActiveCount,
        totalPastDueCount,
        totalActiveRevenue: Math.round(totalActiveRevenue * 100) / 100,
        totalPastDueRevenue: Math.round(totalPastDueRevenue * 100) / 100,
      },
    };
  }
```

- [ ] **Step 3: Extend `MembershipByPackageSummaryDTO` with the new optional field**

In the same file, find the existing `MembershipByPackageSummaryDTO` interface and change:

```ts
export interface MembershipByPackageSummaryDTO {
  totalActiveCount: number;
  totalPastDueCount: number;
  totalActiveRevenue: number;
  totalPastDueRevenue: number;
  /** True when some users had no status history and fell back to current subscription fields */
  snapshotPartial?: boolean;
}
```

To:

```ts
export interface MembershipByPackageSummaryDTO {
  totalActiveCount: number;
  totalPastDueCount: number;
  totalActiveRevenue: number;
  totalPastDueRevenue: number;
  /** Legacy field — kept for compatibility with the deprecated per-user snapshot reader. */
  snapshotPartial?: boolean;
  /** Set when caller asked for a snapshot date but no snapshot row existed; live data returned instead. */
  snapshotMissing?: boolean;
}
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 3.3: Wire the membership-by-package route to dispatch

**Files:**
- Modify: `src/app/api/admin/dashboard/membership-by-package/route.ts:34-48`

- [ ] **Step 1: Replace the hardcoded live call**

Find:

```ts
    const { membershipAsOfMode, asOfDate } = parsed.value;
    const service = new MembershipAnalyticsService();

    // MembershipStatusHistory is a partial event log today, not a complete state ledger.
    // Use current User.subscription state for active MRR until historical snapshots are complete.
    const data = await service.getMembershipByPackageLive();
```

Replace with:

```ts
    const { membershipAsOfMode, asOfDate } = parsed.value;
    const service = new MembershipAnalyticsService();

    const data =
      membershipAsOfMode === "snapshot" && asOfDate
        ? await service.getMembershipByPackageSnapshot(asOfDate)
        : await service.getMembershipByPackageLive();
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 3.4: Update the cancellations route (`/api/admin/dashboard/stats`)

**Files:**
- Modify: `src/app/api/admin/dashboard/stats/route.ts`

- [ ] **Step 1: Locate the cancellation-impact computation**

Run: `grep -n "cancellationImpact\|cancelledMemberships\|getMembershipByPackageLive" src/app/api/admin/dashboard/stats/route.ts`
Expected: shows the lines that compute the cancellation count and revenue impact.

- [ ] **Step 2: Where the route uses `getMembershipByPackageLive` for the *standing* count of users currently scheduled-to-cancel, branch on `membershipAsOfMode`**

Keep range-delta queries (e.g., "cancellations in this date range") unchanged.

For the standing-count + impact-revenue computation, change to:

```ts
const baseData =
  membershipAsOfMode === "snapshot" && asOfDate
    ? await service.getMembershipByPackageSnapshot(asOfDate)
    : await service.getMembershipByPackageLive();

const standingScheduledCancel = baseData.packages.reduce((sum, p) => sum + (p.cancelledCount ?? 0), 0);
const cancellationImpactRevenue = baseData.packages.reduce((sum, p) => {
  const pkg = getPackageById(p.packageId);
  return sum + (p.cancelledCount ?? 0) * (pkg?.price ?? 0);
}, 0);
```

(Adapt to the existing variable names in the route. The shape of the change is: replace any current `getMembershipByPackageLive()` call used for *standing* counts with the dispatching version above.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 3.5: Update the lifecycle chart (UserMetricsService + route)

**Files:**
- Modify: `src/services/metrics/UserMetricsService.ts`
- Modify: `src/app/api/admin/metrics/users/route.ts`

- [ ] **Step 1: Add imports at the top of `UserMetricsService.ts`**

```ts
import { formatInTimeZone } from "date-fns-tz";
import MembershipDailySnapshot from "@/models/MembershipDailySnapshot";
```

- [ ] **Step 2: Add an optional `asOfDate` parameter to the method that computes `membershipStatus`**

Run: `grep -n "membershipStatus\|getUserMetrics" src/services/metrics/UserMetricsService.ts`
Expected: shows the function signature and the loop that increments `membershipStatus` buckets.

Add `asOfDate?: Date` to the method signature. Immediately after the existing User-loop that populates `membershipStatus.active`/`cancelled`/`pastDue` from current `User.subscription`, add this override block:

```ts
if (asOfDate) {
  const dateKey = formatInTimeZone(asOfDate, "Australia/Sydney", "yyyy-MM-dd");
  const snapshotRows = await MembershipDailySnapshot.find({ date: dateKey }).lean();
  if (snapshotRows.length > 0) {
    const totals = snapshotRows.reduce(
      (acc, r) => {
        acc.active += r.activeCount;
        acc.cancelled += r.cancelledCount + r.scheduledCancelCount;
        acc.pastDue += r.pastDueCount;
        return acc;
      },
      { active: 0, cancelled: 0, pastDue: 0 }
    );
    membershipStatus.active = totals.active;
    membershipStatus.cancelled = totals.cancelled;
    membershipStatus.pastDue = totals.pastDue;
    // membershipStatus.renewed stays as-is — it's a delta from PaymentEvent, range-driven, not point-in-time.
  }
}
```

- [ ] **Step 3: Pass `asOfDate` from the route into the service**

Run: `grep -n "getUserMetrics\|parseAdminDashboardDateRange\|asOfDate" src/app/api/admin/metrics/users/route.ts`
Expected: shows the route handler.

In the route, take `asOfDate` from the parsed range and pass it into the `getUserMetrics` call (or whichever method now accepts it).

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 3.6: Light up the "as of" badge in `MembershipBreakdownSection`

**Files:**
- Modify: `src/app/admin/component/overview/MembershipBreakdownSection.tsx:30-33`
- Modify: the type definition for `MembershipByPackageData` (search for it)

- [ ] **Step 1: Find the type definition for `MembershipByPackageData`**

Run: `grep -rn "MembershipByPackageData" src/hooks src/app | head -10`
Expected: shows the file where the type is declared.

- [ ] **Step 2: Add `snapshotMissing?: boolean` to the `summary` field of that type**

In the type declaration, change:

```ts
summary: {
  totalActiveCount: number;
  totalPastDueCount: number;
  // ...existing fields
};
```

To:

```ts
summary: {
  totalActiveCount: number;
  totalPastDueCount: number;
  // ...existing fields
  snapshotMissing?: boolean;
};
```

- [ ] **Step 3: Replace the existing `snapshotLabel` block in `MembershipBreakdownSection.tsx`**

Find:

```tsx
  const snapshotLabel =
    membershipByPackageData?.meta?.membershipAsOfMode === "snapshot" && membershipByPackageData.meta.asOf
      ? `Status as of ${format(new Date(membershipByPackageData.meta.asOf), "MMM d, yyyy")}`
      : "Current membership status";
```

Replace with:

```tsx
  const snapshotLabel = (() => {
    const meta = membershipByPackageData?.meta;
    const summary = membershipByPackageData?.summary;
    if (meta?.membershipAsOfMode === "snapshot" && summary?.snapshotMissing) {
      return "Showing live counts (snapshot unavailable for this date)";
    }
    if (meta?.membershipAsOfMode === "snapshot" && meta.asOf) {
      return `Status as of ${format(new Date(meta.asOf), "MMM d, yyyy")}`;
    }
    return "Current membership status";
  })();
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 3.7: Update the KPI card title for snapshot mode

**Files:**
- Modify: `src/app/admin/component/overview/KPIMetricsGrid.tsx:175-200`
- Modify: the parent component that renders `<KPIMetricsGrid ... />` (search for it)

- [ ] **Step 1: Add new optional props to `KPIMetricsGridProps`**

```ts
  membershipAsOfMode?: "live" | "snapshot";
  membershipAsOf?: string | null;  // ISO date or null
```

- [ ] **Step 2: Find the parent component that renders `<KPIMetricsGrid ... />`**

Run: `grep -rn "<KPIMetricsGrid" src/app/admin | head -5`
Expected: shows the parent file.

In that parent, pass `membershipAsOfMode={membershipByPackageData?.meta?.membershipAsOfMode}` and `membershipAsOf={membershipByPackageData?.meta?.asOf}` into the component.

- [ ] **Step 3: Replace the static title in the Membership Statuses card**

In `KPIMetricsGrid.tsx`, change:

```tsx
            <MetricCard
              title="Membership Statuses"
```

To:

```tsx
            <MetricCard
              title={
                membershipAsOfMode === "snapshot" && membershipAsOf
                  ? `Membership Statuses (as of ${format(new Date(membershipAsOf), "MMM d")})`
                  : "Membership Statuses"
              }
```

(Add `import { format } from "date-fns";` to the top of the file if not already present.)

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check`
Expected: PASS

Run: `npm run lint`
Expected: PASS

---

### Task 3.8: Update domain docs with the read-path change

**Files:**
- Modify: `docs/metrics-analytics/architecture.md`

- [ ] **Step 1: Append a section on the snapshot read path**

```markdown
## Membership snapshot dispatch (added 2026-04-29)

The admin dashboard's membership-related cards (KPI Membership Statuses, per-package breakdown, Cancellations card, Lifecycle chart) read **point-in-time** counts when the selected date range ends in the past.

`parseAdminDashboardDateRange` (in [src/utils/admin/dashboardDateRange.ts](../../src/utils/admin/dashboardDateRange.ts)) computes:
- `membershipAsOfMode = "live"` when the range ends today, in the future, or covers all time.
- `membershipAsOfMode = "snapshot"` and `asOfDate = end of the range's last day in Australia/Sydney` otherwise.

Three routes dispatch on this:
- `/api/admin/dashboard/membership-by-package`
- `/api/admin/dashboard/stats` (cancellation-impact only; range deltas remain live)
- `/api/admin/metrics/users` (lifecycle chart's standing buckets only; `renewed` remains a range delta)

The snapshot reader returns `summary.snapshotMissing: true` and falls back to live counts when no snapshot row exists for the queried date — for example, any date before the cron's first successful run. The dashboard UI surfaces this via "Showing live counts (snapshot unavailable for this date)".
```

- [ ] **Step 2: Bump `lastVerified` for `metrics-analytics` to `2026-04-29` in `CLAUDE.md`**

---

### PR 3 — STOP HERE

**Hand back to DJ.** Summary:
- `parseAdminDashboardDateRange` dispatches on date
- `getMembershipByPackageSnapshot` reads from snapshot table (live fallback when row missing)
- Three routes dispatch on `mode`
- UI badge shows "Status as of {date}" or "Showing live counts (snapshot unavailable)" appropriately
- KPI card title updates dynamically
- Docs updated

DJ runs the smoke tests below → DJ commits → ship.

---

## End-to-End Smoke Test (Manual, by DJ)

After PR 3 ships:

1. Open the admin dashboard, ensure date range "today" — Membership Statuses shows current counts (mode=live, no badge).
2. Switch to "yesterday" after the cron has run for at least one day — counts reflect end-of-yesterday in Sydney. Badge: "Status as of {yesterday's date}".
3. Switch to a custom range ending two weeks ago (a date before the cron started) — badge reads "Showing live counts (snapshot unavailable for this date)". This is the correct, explicit behavior.
4. Switch to a future-dated custom range — falls back to live, no errors, no badge.
5. Hit `GET /api/admin/health/membership-snapshot` — expect `{ ok: false, missingDays: [...] }` if the cron hasn't been running long; days where the cron has run will not be in `missingDays`.
6. Lifecycle chart bars match the snapshot values for the selected date when one exists, otherwise live values.

---

## Rollback Plan

If anything goes wrong:

- **PR 3 only:** revert the changes to `parseAdminDashboardDateRange` (set `mode` back to `"live"`); the rest stays in place. Dashboard returns to current behavior.
- **PR 2:** disable the cron entries in `vercel.json`. Snapshot rows already written remain.
- **PR 1:** the cleanup is destructive but only deletes rows tagged as backfill (real webhook rows are kept). Activation history rows from Task 1.7 are additive and harmless. The new `MembershipDailySnapshot` collection is empty without the cron and harmless.
