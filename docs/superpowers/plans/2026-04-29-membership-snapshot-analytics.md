# Membership Snapshot Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin dashboard's membership-related cards (KPI Membership Statuses, per-package breakdown, Cancellations card, Lifecycle chart) display **point-in-time** counts for the selected date range — using the last day of the range as the "as of" date, falling back to live counts for today/future, with ~90 days of historical accuracy.

**Architecture:** New `MembershipDailySnapshot` collection (one row per local-Sydney date × packageId) populated by a one-shot 90-day backfill (`confidence: "backfill"`) and a nightly DST-safe cron (`confidence: "live"`). The admin dashboard date-range parser dispatches to a snapshot read or the existing live aggregation. Pricing is locked into each snapshot row so future price changes do not retroactively rewrite historical revenue.

**Tech Stack:** Next.js 15 App Router, Mongoose, `date-fns-tz` (`Australia/Sydney` IANA zone), Vercel Cron, TanStack Query (existing), Recharts (existing).

**Source spec:** [docs/superpowers/specs/2026-04-29-membership-snapshot-analytics-design.md](../specs/2026-04-29-membership-snapshot-analytics-design.md)

**Commit policy:** Per `CLAUDE.md` Hard Rule 1 (no auto-commit), no task in this plan runs `git commit`. Each PR boundary below ends with a **Stop** instruction — hand the work back to DJ for review and commit. DJ will explicitly authorize each commit.

---

## File Structure

**New files:**
- `src/models/MembershipDailySnapshot.ts` — Mongoose model for the new collection
- `src/app/api/cron/membership-daily-snapshot/route.ts` — nightly snapshot cron
- `src/app/api/admin/health/membership-snapshot/route.ts` — gap-detection health check
- `scripts/backfill-membership-daily-snapshot.ts` — one-shot 90-day historical fill
- `scripts/test-membership-snapshot-reconstruction.ts` — reconstruction algorithm test (tsx)
- `scripts/test-membership-snapshot-dst.ts` — DST boundary test (tsx)

**Modified files:**
- `CLAUDE.md` — manifest entries for new files
- `vercel.json` — add cron schedule(s)
- `package.json` — add `backfill:membership-snapshot`, `:dry`, `test:membership-snapshot`, `test:membership-snapshot-dst`
- `src/utils/admin/dashboardDateRange.ts` — replace hardcoded `mode = "live"` with real dispatch
- `src/services/admin/MembershipAnalyticsService.ts` — add `getMembershipByPackageLiveForSnapshot`; rewrite `getMembershipByPackageSnapshot` to read from snapshot table
- `src/app/api/stripe/webhook/route.ts` — append `active` history row in `handleSubscriptionCreated`
- `src/app/api/admin/dashboard/membership-by-package/route.ts` — dispatch on `mode`
- `src/app/api/admin/dashboard/stats/route.ts` — point cancellation-impact at snapshot when historical
- `src/app/api/admin/metrics/users/route.ts` — lifecycle chart membership counts dispatch on `mode`
- `src/services/metrics/UserMetricsService.ts` — accept `asOfDate` and read snapshot when present
- `src/app/admin/component/overview/MembershipBreakdownSection.tsx` — light up the "as of" / "reconstructed" badge
- `src/app/admin/component/overview/KPIMetricsGrid.tsx` — adjust card title when in snapshot mode
- `scripts/backfill-membership-analytics.ts` — fix four bugs + add activation seed pass
- `docs/subscription/models.md`, `docs/subscription/architecture.md` — document the new collection
- `docs/metrics-analytics/architecture.md` — document the snapshot read path

---

# PR 1 — Foundation: Model + Going-Forward Writes

Goal: ship the new collection and start writing `active` history rows at activation paths so the event log becomes complete from this point on. No reads change yet — dashboard behavior is identical until PR 4.

---

### Task 1.1: Create the `MembershipDailySnapshot` Mongoose model

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
  confidence: "live" | "backfill";
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
    confidence: { type: String, required: true, enum: ["live", "backfill"] },
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
Expected: PASS (zero errors)

---

### Task 1.2: Add the new model to the Domain Manifest in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (the `subscription` domain block inside the JSON manifest)

- [ ] **Step 1: Open `CLAUDE.md` and find the `subscription` domain entry**

Locate the line `"src/models/MembershipStatusHistory.ts"` inside `domains.subscription.paths`.

- [ ] **Step 2: Add the new model path after it**

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

- [ ] **Step 3: Bump `lastModified` at the top of the manifest to `2026-04-29`**

- [ ] **Step 4: Verify the manifest still parses**

Run: `node -e "const fs=require('fs');const t=fs.readFileSync('CLAUDE.md','utf8');const m=t.match(/\`\`\`json\n([\s\S]+?)\n\`\`\`/);JSON.parse(m[1]);console.log('OK')"`
Expected: prints `OK`.

---

### Task 1.3: Document the new collection in domain docs

**Files:**
- Modify: `docs/subscription/models.md`

- [ ] **Step 1: Add a new section describing `MembershipDailySnapshot`**

Append this section to `docs/subscription/models.md`:

```markdown
## MembershipDailySnapshot

[src/models/MembershipDailySnapshot.ts](../../src/models/MembershipDailySnapshot.ts)

Per-day, per-package roll-up of membership counts and revenue, used by the admin dashboard to display point-in-time membership data for any selected past date.

**Key fields:**
- `date` (string, `yyyy-MM-dd` in `Australia/Sydney`) — the local-Sydney calendar day this row describes.
- `packageId` — `tradie-subscription` | `foreman-subscription` | `boss-subscription`.
- `activeCount`, `pastDueCount`, `scheduledCancelCount`, `cancelledCount` — bucket counts.
- `unitPriceCents` — package price at snapshot time, locked in to make historical revenue immutable across future price changes.
- `activeRevenue`, `pastDueRevenue` — pre-computed `count × unitPriceCents / 100`.
- `confidence` — `"live"` (written by the nightly cron from real state) or `"backfill"` (reconstructed by the one-shot script from `MembershipStatusHistory` + `MembershipRenewalCycle` + current `User.subscription`).

**Writers:** `scripts/backfill-membership-daily-snapshot.ts` (one-shot, ~90 days), `src/app/api/cron/membership-daily-snapshot/route.ts` (nightly).

**Readers:** `MembershipAnalyticsService.getMembershipByPackageSnapshot(asOfDate)`.

**Indexes:** `{ date: 1, packageId: 1 }` unique; `{ date: 1 }`.
```

- [ ] **Step 2: Update the manifest's `lastVerified` for `subscription` to `2026-04-29`**

In `CLAUDE.md`, set `domains.subscription.lastVerified` to `"2026-04-29"`.

---

### Task 1.4: Add an `appendActiveStatus` helper

**Files:**
- Modify: `src/services/admin/membershipAnalyticsPersistence.ts`

- [ ] **Step 1: Add the helper function below `appendMembershipStatusHistory`**

Add after the existing `appendMembershipStatusHistory` function:

```ts
/**
 * Append an "active" history row when a subscription becomes active or trialing.
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

### Task 1.5: Wire activation history write into Stripe webhook

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts` (around `handleSubscriptionCreated` at line 1517)

- [ ] **Step 1: Read `handleSubscriptionCreated` to find the place where we have `user._id`, `subscription.status`, and a `packageId`**

Run: `grep -n "handleSubscriptionCreated\|user._id\|packageId" src/app/api/stripe/webhook/route.ts | head -50`
Expected: shows the function body and the points where the user record is loaded.

Locate the `if (subscription.status === "active" || subscription.status === "trialing")` block (or the equivalent point where the function knows the user just became active).

- [ ] **Step 2: Add the import to the existing import block**

In the import block at the top of the file, change:

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

- [ ] **Step 3: Inside `handleSubscriptionCreated`, after the user record's subscription fields are persisted, append the activation row**

Add this block immediately before the function returns or at the end of its main success path (after the user save):

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

- [ ] **Step 4: Locate `customer.subscription.updated` handler (search for `case "customer.subscription.updated"`) and the `prevSubStatus`/`user.subscription.status` comparison block**

Run: `grep -n "customer.subscription.updated\|prevSubStatus" src/app/api/stripe/webhook/route.ts | head -20`
Expected: shows the updated handler body.

- [ ] **Step 5: Add an activation-on-recovery write in the updated handler**

Find the existing block that fires on `past_due → active` transition (similar shape to the past_due append). Immediately after the user save, when `prevSubStatus !== "active" && user.subscription?.status === "active"` (or the trialing equivalent), add:

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

### Task 1.6: Update domain docs with the activation-write change

**Files:**
- Modify: `docs/subscription/architecture.md` (or `docs/billing-stripe/architecture.md` — pick the file that already documents webhook subscription handlers)

- [ ] **Step 1: Find the right doc**

Run: `grep -l "handleSubscriptionCreated\|subscription.created" docs/`
Expected: returns 0–2 candidates.

- [ ] **Step 2: Add a paragraph documenting the new write**

Append to the relevant architecture doc:

```markdown
### Activation history writes (added 2026-04-29)

`handleSubscriptionCreated` and the `customer.subscription.updated` handler both append a row to `MembershipStatusHistory` (status `active` or `trialing`, source `webhook_subscription_created` / `webhook_subscription_updated_active`) whenever a subscription transitions into an active state. This makes the event log complete enough that `MembershipDailySnapshot` reconstructions (and future point-in-time queries) do not need to fall back to current state.
```

---

### PR 1 — STOP HERE

**Hand back to DJ.** Summary to include in the handoff message:
- New model added: `src/models/MembershipDailySnapshot.ts`
- Activation history writes added at two webhook paths
- Manifest + docs updated
- No read paths changed; dashboard behavior is identical

DJ reviews → DJ commits → DJ tells you when to start PR 2.

---

# PR 2 — Backfill Bug Fixes + Activation Seed + New Snapshot Backfill

Goal: make the existing analytics backfill correct, seed activation rows for all currently-active users, and write the new 90-day snapshot backfill script with reconstruction tests.

---

### Task 2.1: Fix Bug 1 in `backfill-membership-analytics.ts` — `dueAt` semantics

**Files:**
- Modify: `scripts/backfill-membership-analytics.ts:31-70`

- [ ] **Step 1: Read the current `backfillRenewalCyclesFromPaymentEvents` function**

Run: `sed -n '31,70p' scripts/backfill-membership-analytics.ts`
Expected: shows the function body using `ev.timestamp` as `dueAt`.

- [ ] **Step 2: Replace the function with the corrected version**

Replace the function body. The change extracts `period_end` from `ev.data` if present, falls back to `ev.timestamp` only when missing, and tags the row `confidence: "backfill-fallback"` in the fallback case:

```ts
async function backfillRenewalCyclesFromPaymentEvents(dryRun: boolean): Promise<{ written: number; fallback: number; skipped: number }> {
  const events = await PaymentEvent.find({
    eventType: "BenefitsGranted",
    packageType: "membership",
    "data.billingReason": "subscription_cycle",
  })
    .select("_id userId paymentIntentId timestamp data")
    .lean();

  let written = 0;
  let fallback = 0;
  let skipped = 0;

  for (const ev of events) {
    const invoiceId = extractInvoiceIdFromPaymentIntentId(ev.paymentIntentId);
    if (!invoiceId) {
      skipped += 1;
      continue;
    }

    if (!ev.timestamp) {
      console.warn(`Skipping renewal cycle for paymentIntentId=${ev.paymentIntentId} — missing ev.timestamp`);
      skipped += 1;
      continue;
    }

    const periodEndUnix = typeof ev.data?.invoicePeriodEnd === "number" ? ev.data.invoicePeriodEnd : null;
    const dueAt = periodEndUnix ? new Date(periodEndUnix * 1000) : new Date(ev.timestamp);
    const isFallback = !periodEndUnix;

    const price = typeof ev.data?.price === "number" ? ev.data.price : 0;
    const amountPaidCents = Math.round(price * 100);

    if (!dryRun) {
      await MembershipRenewalCycle.findOneAndUpdate(
        { stripeInvoiceId: invoiceId },
        {
          $set: {
            userId: ev.userId,
            billingReason: "subscription_cycle",
            status: "succeeded",
            dueAt,
            amountDueCents: amountPaidCents,
            amountPaidCents,
            succeededAt: ev.timestamp,
            confidence: isFallback ? "backfill-fallback" : "backfill",
          },
        },
        { upsert: true }
      );
    }
    written += 1;
    if (isFallback) fallback += 1;
  }
  return { written, fallback, skipped };
}
```

- [ ] **Step 3: Update the `main()` summary to show the new return shape**

Change the existing summary line:

```ts
const renewalRows = await backfillRenewalCyclesFromPaymentEvents(dryRun);
const hist = await backfillStatusHistoryFromUsers(dryRun);

console.log("Backfill complete:", {
  renewalCyclesFromPaymentEvents: renewalRows,
  statusHistoryPastDue: hist.pastDue,
  statusHistoryCancelled: hist.cancelled,
});
```

To:

```ts
const renewalRows = await backfillRenewalCyclesFromPaymentEvents(dryRun);
const hist = await backfillStatusHistoryFromUsers(dryRun);

console.log("Backfill complete:", {
  renewalCyclesWritten: renewalRows.written,
  renewalCyclesFallbackDueAt: renewalRows.fallback,
  renewalCyclesSkipped: renewalRows.skipped,
  statusHistoryPastDue: hist.pastDue,
  statusHistoryCancelled: hist.cancelled,
});
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Dry-run the script to verify it executes**

Run: `npx tsx scripts/backfill-membership-analytics.ts --dry-run`
Expected: prints `DRY RUN — no writes` and a summary; no errors.

---

### Task 2.2: Fix Bug 2 — Cancel branch dead code

**Files:**
- Modify: `scripts/backfill-membership-analytics.ts:117-122`

- [ ] **Step 1: Locate the buggy lines**

Run: `sed -n '115,125p' scripts/backfill-membership-analytics.ts`
Expected: shows the `const status = ... ? "scheduled_cancel" : "scheduled_cancel"` ternary.

- [ ] **Step 2: Replace the dead-code ternary**

Change:
```ts
    const status =
      u.subscription?.status === "canceled" || u.subscription?.status === "cancelled"
        ? "canceled"
        : u.subscription?.autoRenew === false
          ? "scheduled_cancel"
          : "scheduled_cancel";
```

To:
```ts
    const now = new Date();
    const endDate = u.subscription?.endDate ?? null;
    const status: "canceled" | "scheduled_cancel" =
      u.subscription?.status === "canceled" || u.subscription?.status === "cancelled"
        ? "canceled"
        : endDate && endDate <= now
          ? "canceled"
          : "scheduled_cancel";
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 2.3: Fix Bug 4 — `succeededAt` fabricated fallback

Already covered in Task 2.1 (`succeededAt: ev.timestamp` with strict skip when missing). Confirm by re-reading the function.

- [ ] **Step 1: Confirm fix in place**

Run: `grep -n "succeededAt: new Date" scripts/backfill-membership-analytics.ts`
Expected: zero matches (any line with `succeededAt: new Date()` is a regression).

---

### Task 2.4: Document Bug 3 limitation in script header

**Files:**
- Modify: `scripts/backfill-membership-analytics.ts:1-9`

- [ ] **Step 1: Update the header comment block**

Replace the existing top-of-file comment block with:

```ts
/**
 * Backfill MembershipRenewalCycle and MembershipStatusHistory from existing data.
 *
 * Usage:
 *   npx tsx scripts/backfill-membership-analytics.ts           # live
 *   npx tsx scripts/backfill-membership-analytics.ts --dry-run
 *
 * Requires MONGODB_URI in `.env.local` or `.env` (same as Next.js app).
 *
 * Known limitations (2026-04-29):
 *  - One row per user per status: `User.subscription` only carries the latest
 *    `pastDueAt` / `cancelledAt`, so users who transitioned past_due → active → past_due
 *    multiple times historically will only have one history row per status type.
 *    This is unrecoverable from the current source data.
 *  - Renewal cycles fall back to `confidence: "backfill-fallback"` when the
 *    original PaymentEvent does not include `data.invoicePeriodEnd`. The dueAt in
 *    those cases is the paid-at timestamp, not the invoice period_end — slightly
 *    less accurate but still in the right billing window.
 */
```

---

### Task 2.5: Add the activation seed pass to `backfill-membership-analytics.ts`

**Files:**
- Modify: `scripts/backfill-membership-analytics.ts` (add new function + call from `main`)

- [ ] **Step 1: Add a new `backfillActivationSeed` function above `main`**

Insert before `async function main()`:

```ts
async function backfillActivationSeed(dryRun: boolean): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0;
  let skipped = 0;

  const activeUsers = await User.find({
    isActive: true,
    "subscription.status": { $in: ["active", "trialing"] },
    "subscription.packageId": { $in: ["tradie-subscription", "foreman-subscription", "boss-subscription"] },
  })
    .select("_id subscription createdAt")
    .lean();

  for (const u of activeUsers) {
    const userId = u._id;
    const existing = await MembershipStatusHistory.findOne({
      userId,
      membershipStatus: { $in: ["active", "trialing"] },
    }).lean();
    if (existing) {
      skipped += 1;
      continue;
    }

    const startSignal: Date | undefined =
      u.subscription?.startDate ??
      (await firstBenefitsGrantedTimestamp(userId)) ??
      u.createdAt;

    if (!startSignal) {
      skipped += 1;
      continue;
    }

    const isTrialing = u.subscription?.status === "trialing";
    const dedupeKey = `backfill_active_${userId.toString()}`;

    if (!dryRun) {
      try {
        await MembershipStatusHistory.create({
          userId,
          effectiveAt: startSignal,
          membershipStatus: isTrialing ? "trialing" : "active",
          actor: "system",
          source: "backfill_activation_seed",
          dedupeKey,
          subscriptionPackageId:
            u.subscription?.packageId != null ? String(u.subscription.packageId) : undefined,
          metadata: { backfill: true, seedSource: u.subscription?.startDate ? "startDate" : "fallback" },
        });
      } catch (e: unknown) {
        const code = e && typeof e === "object" && "code" in e ? (e as { code: number }).code : undefined;
        if (code !== 11000) throw e;
      }
    }
    seeded += 1;
  }
  return { seeded, skipped };
}

async function firstBenefitsGrantedTimestamp(userId: mongoose.Types.ObjectId): Promise<Date | undefined> {
  const ev = await PaymentEvent.findOne({
    userId,
    eventType: "BenefitsGranted",
    packageType: "membership",
  })
    .sort({ timestamp: 1 })
    .select("timestamp")
    .lean();
  return ev?.timestamp ?? undefined;
}
```

- [ ] **Step 2: Call it from `main` and add to the summary**

In `main()`, after the existing two backfill calls, add:

```ts
const seed = await backfillActivationSeed(dryRun);
```

And update the `console.log("Backfill complete:", { ... })` to include:

```ts
  activationSeedRows: seed.seeded,
  activationSeedSkipped: seed.skipped,
```

- [ ] **Step 3: Type-check + dry-run**

Run: `npm run type-check`
Expected: PASS

Run: `npx tsx scripts/backfill-membership-analytics.ts --dry-run`
Expected: prints summary including `activationSeedRows` and `activationSeedSkipped`.

---

### Task 2.6: Add a reconstruction algorithm test

**Files:**
- Create: `scripts/test-membership-snapshot-reconstruction.ts`
- Modify: `package.json` (add `test:membership-snapshot` script)

- [ ] **Step 1: Read an existing tsx test to match style**

Run: `cat scripts/test-dst-transitions.ts | head -80`
Expected: shows the existing pattern (top-of-file env loading, `connectDB()`, console-based assertions, `mongoose.disconnect()`).

If `scripts/test-dst-transitions.ts` doesn't exist or differs, fall back to: `ls scripts/test-*.ts` and pick any. The convention in this repo is "tsx scripts that print PASS/FAIL and exit non-zero on failure."

- [ ] **Step 2: Create the test file**

Create `scripts/test-membership-snapshot-reconstruction.ts` with this content:

```ts
/**
 * Tests the reconstruction algorithm in scripts/backfill-membership-daily-snapshot.ts
 * by feeding hand-built fixture users and asserting per-day bucket assignment.
 *
 * Usage: npx tsx scripts/test-membership-snapshot-reconstruction.ts
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { reconstructUserStatusOnDate } from "./backfill-membership-daily-snapshot";

interface FixtureUser {
  name: string;
  subscription: {
    startDate?: Date;
    cancelledAt?: Date;
    pastDueAt?: Date;
    endDate?: Date;
    autoRenew?: boolean;
    status?: string;
    packageId: string;
  };
  createdAt: Date;
  history?: Array<{ effectiveAt: Date; membershipStatus: string }>;
  renewals?: Array<{ status: "succeeded" | "failed"; succeededAt?: Date; failedAt?: Date; dueAt: Date }>;
}

const D = (s: string) => new Date(`${s}T00:00:00Z`);

const cases: Array<{ user: FixtureUser; date: Date; expected: string }> = [
  {
    user: {
      name: "active throughout",
      subscription: { startDate: D("2026-01-01"), packageId: "tradie-subscription", status: "active" },
      createdAt: D("2026-01-01"),
    },
    date: D("2026-03-15"),
    expected: "active",
  },
  {
    user: {
      name: "past_due mid-window, never recovered",
      subscription: {
        startDate: D("2026-01-01"),
        pastDueAt: D("2026-03-10"),
        status: "past_due",
        packageId: "tradie-subscription",
      },
      createdAt: D("2026-01-01"),
      history: [{ effectiveAt: D("2026-03-10"), membershipStatus: "past_due" }],
    },
    date: D("2026-03-15"),
    expected: "past_due",
  },
  {
    user: {
      name: "scheduled cancel with future endDate",
      subscription: {
        startDate: D("2026-01-01"),
        cancelledAt: D("2026-03-05"),
        endDate: D("2026-04-01"),
        autoRenew: false,
        status: "active",
        packageId: "boss-subscription",
      },
      createdAt: D("2026-01-01"),
      history: [{ effectiveAt: D("2026-03-05"), membershipStatus: "scheduled_cancel" }],
    },
    date: D("2026-03-20"),
    expected: "scheduled_cancel",
  },
  {
    user: {
      name: "fully cancelled before window",
      subscription: {
        startDate: D("2025-06-01"),
        cancelledAt: D("2025-12-01"),
        endDate: D("2026-01-01"),
        status: "canceled",
        packageId: "tradie-subscription",
      },
      createdAt: D("2025-06-01"),
      history: [{ effectiveAt: D("2025-12-01"), membershipStatus: "canceled" }],
    },
    date: D("2026-03-15"),
    expected: "canceled",
  },
  {
    user: {
      name: "signed up mid-window",
      subscription: { startDate: D("2026-03-20"), packageId: "tradie-subscription", status: "active" },
      createdAt: D("2026-03-20"),
    },
    date: D("2026-03-15"),
    expected: "none",
  },
  {
    user: {
      name: "lossy: past_due that recovered (pre-going-forward writes)",
      subscription: { startDate: D("2026-01-01"), packageId: "tradie-subscription", status: "active" },
      createdAt: D("2026-01-01"),
      history: [{ effectiveAt: D("2026-03-10"), membershipStatus: "past_due" }],
    },
    date: D("2026-03-15"),
    expected: "past_due",
  },
];

async function main() {
  let pass = 0;
  let fail = 0;

  for (const c of cases) {
    const actual = reconstructUserStatusOnDate(c.user, c.date);
    if (actual === c.expected) {
      console.log(`PASS  ${c.user.name} on ${c.date.toISOString()} → ${actual}`);
      pass += 1;
    } else {
      console.error(`FAIL  ${c.user.name} on ${c.date.toISOString()} → got ${actual}, expected ${c.expected}`);
      fail += 1;
    }
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script**

Edit `package.json`. Inside `"scripts": { ... }`, add:

```json
"test:membership-snapshot": "tsx scripts/test-membership-snapshot-reconstruction.ts",
```

- [ ] **Step 4: The test will fail until Task 2.7 creates the import target — confirm that's the expected state**

Run: `npm run test:membership-snapshot`
Expected: FAIL with "Cannot find module './backfill-membership-daily-snapshot'" or similar.

This is the TDD red phase — Task 2.7 implements the green phase.

---

### Task 2.7: Create `backfill-membership-daily-snapshot.ts` with the reconstruction algorithm

**Files:**
- Create: `scripts/backfill-membership-daily-snapshot.ts`
- Modify: `package.json` (add `backfill:membership-snapshot`, `:dry`)

- [ ] **Step 1: Create the script with a pure `reconstructUserStatusOnDate` function (testable) and the orchestrator**

```ts
/**
 * Backfill MembershipDailySnapshot for the last N days (default 90) by
 * reconstructing each user's status on each historical day from
 * MembershipStatusHistory + MembershipRenewalCycle + User.subscription.
 *
 * Usage:
 *   npx tsx scripts/backfill-membership-daily-snapshot.ts --dry-run
 *   npx tsx scripts/backfill-membership-daily-snapshot.ts                # live, last 90 days
 *   npx tsx scripts/backfill-membership-daily-snapshot.ts --from 2026-02-01 --to 2026-04-29
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import MembershipDailySnapshot, { SNAPSHOT_SOURCE_VERSION } from "@/models/MembershipDailySnapshot";
import { getPackageById } from "@/data/membershipPackages";

const TZ = "Australia/Sydney";
const SUBSCRIPTION_PACKAGE_IDS = ["tradie-subscription", "foreman-subscription", "boss-subscription"] as const;

export type ReconstructedStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "scheduled_cancel"
  | "canceled"
  | "none";

export interface ReconstructionInput {
  subscription: {
    startDate?: Date | null;
    cancelledAt?: Date | null;
    pastDueAt?: Date | null;
    endDate?: Date | null;
    autoRenew?: boolean | null;
    status?: string | null;
    packageId?: string | null;
  };
  createdAt?: Date | null;
  history?: Array<{ effectiveAt: Date; membershipStatus: string }>;
  renewals?: Array<{ status: "succeeded" | "failed"; succeededAt?: Date | null; failedAt?: Date | null; dueAt: Date }>;
}

/**
 * Pure function: given a user's signals, return their status on date D.
 * Exported for unit testing.
 */
export function reconstructUserStatusOnDate(user: ReconstructionInput, date: Date): ReconstructedStatus {
  const startSignal = user.subscription.startDate ?? user.createdAt ?? null;
  if (startSignal && startSignal > date) return "none";

  const historyAtOrBefore = (user.history ?? [])
    .filter((h) => h.effectiveAt <= date)
    .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime());

  const renewalAtOrBefore = (user.renewals ?? [])
    .filter((r) => {
      const ts = r.status === "succeeded" ? r.succeededAt : r.failedAt;
      return ts != null && ts <= date;
    })
    .sort((a, b) => {
      const aTs = (a.status === "succeeded" ? a.succeededAt : a.failedAt)!.getTime();
      const bTs = (b.status === "succeeded" ? b.succeededAt : b.failedAt)!.getTime();
      return bTs - aTs;
    });

  const latestHistory = historyAtOrBefore[0];
  const latestRenewal = renewalAtOrBefore[0];

  if (latestHistory) {
    const status = latestHistory.membershipStatus as ReconstructedStatus;
    if (status === "scheduled_cancel" && user.subscription.endDate && user.subscription.endDate <= date) {
      return "canceled";
    }
    return status;
  }

  if (latestRenewal) {
    if (latestRenewal.status === "failed") return "past_due";
    return "active";
  }

  if (user.subscription.cancelledAt && user.subscription.cancelledAt <= date) {
    if (user.subscription.endDate && user.subscription.endDate <= date) return "canceled";
    return "scheduled_cancel";
  }
  if (user.subscription.pastDueAt && user.subscription.pastDueAt <= date) return "past_due";

  return "active";
}

function bucket(status: ReconstructedStatus): "active" | "pastDue" | "scheduledCancel" | "cancelled" | "none" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "pastDue";
  if (status === "scheduled_cancel") return "scheduledCancel";
  if (status === "canceled") return "cancelled";
  return "none";
}

interface CliArgs {
  dryRun: boolean;
  from?: string;
  to?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const dryRun = argv.includes("--dry-run");
  const fromIdx = argv.indexOf("--from");
  const toIdx = argv.indexOf("--to");
  return {
    dryRun,
    from: fromIdx >= 0 ? argv[fromIdx + 1] : undefined,
    to: toIdx >= 0 ? argv[toIdx + 1] : undefined,
  };
}

function eachLocalDay(fromDate: Date, toDate: Date): string[] {
  const days: string[] = [];
  let cursor = new Date(fromDate);
  while (cursor <= toDate) {
    days.push(formatInTimeZone(cursor, TZ, "yyyy-MM-dd"));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

async function main() {
  const args = parseArgs(process.argv);
  const today = new Date();
  const defaultFrom = subDays(today, 90);

  const fromDate = args.from ? new Date(`${args.from}T00:00:00Z`) : defaultFrom;
  const toDate = args.to ? new Date(`${args.to}T23:59:59Z`) : new Date(today.getTime() - 24 * 60 * 60 * 1000);

  console.log(args.dryRun ? "DRY RUN — no writes" : "LIVE — writing to MongoDB");
  console.log(`Range: ${formatInTimeZone(fromDate, TZ, "yyyy-MM-dd")} → ${formatInTimeZone(toDate, TZ, "yyyy-MM-dd")}`);

  await connectDB();

  const users = await User.find({
    isActive: true,
    "subscription.packageId": { $in: SUBSCRIPTION_PACKAGE_IDS },
  })
    .select("_id subscription createdAt")
    .lean();

  const userIds = users.map((u) => u._id);

  const histories = await MembershipStatusHistory.find({
    userId: { $in: userIds },
    effectiveAt: { $gte: subDays(fromDate, 30) },
  })
    .select("userId effectiveAt membershipStatus")
    .lean();

  const renewals = await MembershipRenewalCycle.find({
    userId: { $in: userIds },
    $or: [
      { succeededAt: { $gte: subDays(fromDate, 30) } },
      { failedAt: { $gte: subDays(fromDate, 30) } },
    ],
  })
    .select("userId status succeededAt failedAt dueAt")
    .lean();

  const histByUser = new Map<string, Array<{ effectiveAt: Date; membershipStatus: string }>>();
  for (const h of histories) {
    const key = h.userId.toString();
    if (!histByUser.has(key)) histByUser.set(key, []);
    histByUser.get(key)!.push({ effectiveAt: h.effectiveAt, membershipStatus: h.membershipStatus });
  }
  const renByUser = new Map<string, Array<{ status: "succeeded" | "failed"; succeededAt?: Date; failedAt?: Date; dueAt: Date }>>();
  for (const r of renewals) {
    const key = r.userId.toString();
    if (!renByUser.has(key)) renByUser.set(key, []);
    renByUser.get(key)!.push({
      status: r.status as "succeeded" | "failed",
      succeededAt: r.succeededAt ?? undefined,
      failedAt: r.failedAt ?? undefined,
      dueAt: r.dueAt,
    });
  }

  const days = eachLocalDay(fromDate, toDate);
  let rowsWritten = 0;

  for (const dateKey of days) {
    const dayMidnight = new Date(`${dateKey}T23:59:59+10:00`);
    const tally = new Map<string, { active: number; pastDue: number; scheduledCancel: number; cancelled: number }>();
    for (const id of SUBSCRIPTION_PACKAGE_IDS) {
      tally.set(id, { active: 0, pastDue: 0, scheduledCancel: 0, cancelled: 0 });
    }

    for (const u of users) {
      const pkgId = u.subscription?.packageId ? String(u.subscription.packageId) : null;
      if (!pkgId || !SUBSCRIPTION_PACKAGE_IDS.includes(pkgId as (typeof SUBSCRIPTION_PACKAGE_IDS)[number])) continue;
      const recon: ReconstructionInput = {
        subscription: {
          startDate: u.subscription?.startDate ?? null,
          cancelledAt: u.subscription?.cancelledAt ?? null,
          pastDueAt: u.subscription?.pastDueAt ?? null,
          endDate: u.subscription?.endDate ?? null,
          autoRenew: u.subscription?.autoRenew ?? null,
          status: u.subscription?.status ?? null,
          packageId: pkgId,
        },
        createdAt: u.createdAt ?? null,
        history: histByUser.get(u._id.toString()) ?? [],
        renewals: renByUser.get(u._id.toString()) ?? [],
      };
      const status = reconstructUserStatusOnDate(recon, dayMidnight);
      const b = bucket(status);
      if (b === "none") continue;
      const t = tally.get(pkgId)!;
      if (b === "active") t.active += 1;
      else if (b === "pastDue") t.pastDue += 1;
      else if (b === "scheduledCancel") t.scheduledCancel += 1;
      else if (b === "cancelled") t.cancelled += 1;
    }

    for (const pkgId of SUBSCRIPTION_PACKAGE_IDS) {
      const t = tally.get(pkgId)!;
      const pkg = getPackageById(pkgId);
      const unitPriceCents = Math.round((pkg?.price ?? 0) * 100);
      const activeRevenue = Math.round(t.active * unitPriceCents) / 100;
      const pastDueRevenue = Math.round(t.pastDue * unitPriceCents) / 100;

      if (!args.dryRun) {
        await MembershipDailySnapshot.findOneAndUpdate(
          { date: dateKey, packageId: pkgId },
          {
            $set: {
              tz: TZ,
              activeCount: t.active,
              pastDueCount: t.pastDue,
              scheduledCancelCount: t.scheduledCancel,
              cancelledCount: t.cancelled,
              unitPriceCents,
              activeRevenue,
              pastDueRevenue,
              confidence: "backfill",
              computedAt: new Date(),
              sourceVersion: SNAPSHOT_SOURCE_VERSION,
            },
          },
          { upsert: true }
        );
      }
      rowsWritten += 1;
    }

    if (args.dryRun) {
      console.log(
        `${dateKey}: ` +
          SUBSCRIPTION_PACKAGE_IDS.map((id) => {
            const t = tally.get(id)!;
            return `${id}=${t.active}/${t.pastDue}/${t.scheduledCancel}/${t.cancelled}`;
          }).join("  ")
      );
    }
  }

  console.log(`Rows written: ${rowsWritten} (${days.length} days × 3 packages)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

Edit `package.json`. In `"scripts"`:

```json
"backfill:membership-snapshot": "tsx scripts/backfill-membership-daily-snapshot.ts",
"backfill:membership-snapshot:dry": "tsx scripts/backfill-membership-daily-snapshot.ts --dry-run",
```

- [ ] **Step 3: Re-run the reconstruction test — should now pass**

Run: `npm run test:membership-snapshot`
Expected: `Results: 6 passed, 0 failed`

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Dry-run the snapshot backfill**

Run: `npm run backfill:membership-snapshot:dry`
Expected: prints `DRY RUN — no writes`, the date range, one line per day with per-package counts, and `Rows written: ~270 (~90 days × 3 packages)`. No errors.

---

### PR 2 — STOP HERE

**Hand back to DJ.** Summary:
- Existing `backfill-membership-analytics.ts` bugs fixed (Bug 1, 2, 3 documented, 4)
- Activation seed pass added
- New `backfill-membership-daily-snapshot.ts` with pure reconstruction function + tests
- 6 reconstruction-algorithm tests passing
- Dry-runs verified

DJ reviews → DJ commits → DJ runs the live `backfill-membership-analytics` and `backfill:membership-snapshot` against production once satisfied → DJ tells you when to start PR 3.

---

# PR 3 — Cron + Health Check

Goal: stand up the nightly cron (twice-fired for redundancy, DST-safe) and the health-check endpoint. From this point onward, every day's snapshot is `confidence: "live"`.

---

### Task 3.1: Add `getMembershipByPackageLiveForSnapshot` to `MembershipAnalyticsService`

**Files:**
- Modify: `src/services/admin/MembershipAnalyticsService.ts` (after `getMembershipByPackageLive`)

- [ ] **Step 1: Add the new method below `getMembershipByPackageLive`**

```ts
  /**
   * Like `getMembershipByPackageLive` but returns all four counts the snapshot
   * model needs (including fully-cancelled). Used only by the cron writer.
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

### Task 3.2: Create the cron route

**Files:**
- Create: `src/app/api/cron/membership-daily-snapshot/route.ts`

- [ ] **Step 1: Read an existing cron route to match patterns (auth, response shape)**

Run: `ls src/app/api/cron/`
Expected: lists existing cron routes.

Run: `cat src/app/api/cron/<one-of-them>/route.ts`
Expected: shows the auth pattern (`CRON_SECRET` header check) used elsewhere.

- [ ] **Step 2: Create the route file matching that auth pattern**

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

### Task 3.3: Add the cron schedule(s) to `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Read existing `vercel.json`**

Run: `cat vercel.json`
Expected: shows the existing `crons` array (or other config).

- [ ] **Step 2: Add two entries to `crons`**

Inside `"crons"` array, append:

```json
{ "path": "/api/cron/membership-daily-snapshot", "schedule": "0 14 * * *" },
{ "path": "/api/cron/membership-daily-snapshot", "schedule": "0 15 * * *" }
```

If the project's Vercel plan does not allow two crons on the same path, drop the 15:00 entry and document the loss of redundancy in `docs/subscription/architecture.md`.

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('OK')"`
Expected: prints `OK`.

---

### Task 3.4: Create the health-check endpoint

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

### Task 3.5: Add the DST transition test

**Files:**
- Create: `scripts/test-membership-snapshot-dst.ts`
- Modify: `package.json` (add `test:membership-snapshot-dst`)

- [ ] **Step 1: Create the test**

```ts
/**
 * Walks both Australia/Sydney DST boundaries and asserts the cron handler's
 * date-key computation produces one row per local day with no skips/dupes.
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
  // AEDT starts at 02:00 local on 2026-10-04 (jumps to 03:00). Day length = 23h.
  {
    name: "Oct 5 cron (AEDT just started — yesterday=Oct 4 in Sydney)",
    cronTimes: ["2026-10-05T14:00:00Z", "2026-10-05T15:00:00Z"],
    expectedDateKey: "2026-10-04",
  },
  // AEDT ends at 03:00 local on 2027-04-04 (falls back to 02:00). Day length = 25h.
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

### PR 3 — STOP HERE

**Hand back to DJ.** Summary:
- Cron route + Vercel schedule(s)
- Health-check endpoint
- DST test passing
- `getMembershipByPackageLiveForSnapshot` added to service

DJ commits → DJ deploys → DJ verifies the cron fires (check Vercel logs the next morning) → DJ tells you when to start PR 4.

---

# PR 4 — Read Path: Wire the Snapshot into the Dashboard

Goal: route reads through the snapshot collection when `asOfDate < today`, light up the UI badge, and update the lifecycle chart + cancellations card.

---

### Task 4.1: Update `parseAdminDashboardDateRange` to dispatch on date

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

- [ ] **Step 2: Update the JSDoc on `MembershipAsOfMode`**

In the same file, update the comment block on the `asOfDate` field of `ParsedAdminDashboardDateRange` to:

```ts
  /** End-of-day (Sydney) for snapshot reads; null when mode is "live". */
  asOfDate: Date | null;
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 4.2: Rewrite `getMembershipByPackageSnapshot` to read from the snapshot table

**Files:**
- Modify: `src/services/admin/MembershipAnalyticsService.ts:203-340`

- [ ] **Step 1: Replace the existing `getMembershipByPackageSnapshot` method**

Replace the entire method body with:

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
    let confidence: "live" | "backfill" = "live";

    const packages: MembershipByPackageItemDTO[] = SUBSCRIPTION_PACKAGE_IDS.map((packageId) => {
      const row = byPackage.get(packageId);
      const activeCount = row?.activeCount ?? 0;
      const pastDueCount = row?.pastDueCount ?? 0;
      const cancelledCount = row?.scheduledCancelCount ?? 0; // dashboard's "cancelled" = scheduled
      const activeRevenue = row?.activeRevenue ?? 0;
      const pastDueRevenue = row?.pastDueRevenue ?? 0;

      if (row?.confidence === "backfill") confidence = "backfill";

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
        snapshotConfidence: confidence,
      },
    };
  }
```

- [ ] **Step 2: Add the necessary imports at the top of the file**

```ts
import { formatInTimeZone } from "date-fns-tz";
import MembershipDailySnapshot, { type IMembershipDailySnapshot } from "@/models/MembershipDailySnapshot";
```

- [ ] **Step 3: Extend `MembershipByPackageSummaryDTO` with the new optional fields**

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
  /** True when some users had no status history and fell back to current subscription fields */
  snapshotPartial?: boolean;
  /** Set when caller asked for a snapshot date but no snapshot row existed for that date; live data returned instead. */
  snapshotMissing?: boolean;
  /** Confidence of the snapshot data: "live" if produced by the cron, "backfill" if reconstructed. */
  snapshotConfidence?: "live" | "backfill";
}
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 4.3: Wire the membership-by-package route to dispatch

**Files:**
- Modify: `src/app/api/admin/dashboard/membership-by-package/route.ts:34-48`

- [ ] **Step 1: Replace the hardcoded `getMembershipByPackageLive` call**

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

### Task 4.4: Update the cancellations route (`/api/admin/dashboard/stats`)

**Files:**
- Modify: `src/app/api/admin/dashboard/stats/route.ts`

- [ ] **Step 1: Locate the cancellation-impact computation**

Run: `grep -n "cancellationImpact\|cancelledMemberships\|scheduledCancel" src/app/api/admin/dashboard/stats/route.ts`
Expected: shows the lines that compute the cancellation count and revenue impact.

- [ ] **Step 2: Where the route currently uses `getMembershipByPackageLive` (or computes from `User.subscription`), branch on `membershipAsOfMode`**

For the **count** of cancellations *in range* (a delta), keep the existing range-delta query — that semantics doesn't change.

For the **standing count** of users currently scheduled-to-cancel and the *cancellation-impact revenue*, change to:

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

(Adapt to whatever variable names the existing code uses.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 4.5: Update the Lifecycle chart route

**Files:**
- Modify: `src/services/metrics/UserMetricsService.ts`
- Modify: `src/app/api/admin/metrics/users/route.ts`

- [ ] **Step 1: Add imports at the top of `UserMetricsService.ts`**

Add to the import block:

```ts
import { formatInTimeZone } from "date-fns-tz";
import MembershipDailySnapshot from "@/models/MembershipDailySnapshot";
```

- [ ] **Step 2: Add an `asOfDate` parameter to `UserMetricsService.getUserMetrics` (or the method that builds `membershipStatus`)**

Run: `grep -n "membershipStatus\|getUserMetrics" src/services/metrics/UserMetricsService.ts`
Expected: shows the function signature and the loop that increments `membershipStatus` buckets.

Add an optional `asOfDate?: Date` parameter to the method signature. Then wrap the existing User-loop computation: if `asOfDate` is provided and is in the past, read three buckets from `MembershipDailySnapshot` for that `dateKey` and overwrite the live values:

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
      { active: 0, cancelled: 0, pastDue: 0, renewed: 0 }
    );
    membershipStatus.active = totals.active;
    membershipStatus.cancelled = totals.cancelled;
    membershipStatus.pastDue = totals.pastDue;
    // `renewed` stays as-is (it's a delta count from PaymentEvent, range-driven, not point-in-time)
  }
}
```

(Insert this block immediately after the existing User-loop that populates `membershipStatus`, so the snapshot values overwrite the live computation when in snapshot mode.)

- [ ] **Step 3: In the route at `src/app/api/admin/metrics/users/route.ts`, pass `asOfDate` from `parseAdminDashboardDateRange` to the service**

Run: `grep -n "getUserMetrics\|parseAdminDashboardDateRange\|asOfDate" src/app/api/admin/metrics/users/route.ts`
Expected: shows the route handler.

Pass `asOfDate` (from the parsed range) into the `getUserMetrics` call.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 4.6: Light up the "as of" badge in `MembershipBreakdownSection`

**Files:**
- Modify: `src/app/admin/component/overview/MembershipBreakdownSection.tsx:30-33` and `:48-52`

- [ ] **Step 1: Replace the existing `snapshotLabel` block**

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
    if (summary?.snapshotMissing) {
      return "Showing live counts (snapshot unavailable for this date)";
    }
    if (meta?.membershipAsOfMode === "snapshot" && meta.asOf) {
      const dateLabel = format(new Date(meta.asOf), "MMM d, yyyy");
      return summary?.snapshotConfidence === "backfill"
        ? `Status as of ${dateLabel} (reconstructed)`
        : `Status as of ${dateLabel}`;
    }
    return "Current membership status";
  })();
```

- [ ] **Step 2: Update the type used by the hook**

Find: `src/hooks/queries/useAdminQueries.ts` (or wherever `MembershipByPackageData` is defined).

Run: `grep -n "MembershipByPackageData" src/hooks/queries/useAdminQueries.ts`

Add `snapshotMissing?: boolean; snapshotConfidence?: "live" | "backfill";` to the `summary` field of the type, mirroring the service-side change in Task 4.2 step 3.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS

---

### Task 4.7: Update the KPI card title for snapshot mode

**Files:**
- Modify: `src/app/admin/component/overview/KPIMetricsGrid.tsx:175-200`

- [ ] **Step 1: Pass the `asOfDate` and `mode` through to the card**

Add to `KPIMetricsGridProps`:

```ts
  membershipAsOfMode?: "live" | "snapshot";
  membershipAsOf?: string | null;  // ISO date or null
```

In the parent component (find the place that renders `<KPIMetricsGrid ... />`), pass `membershipAsOfMode={membershipByPackageData?.meta?.membershipAsOfMode}` and `membershipAsOf={membershipByPackageData?.meta?.asOf}`.

- [ ] **Step 2: Replace the static `title="Membership Statuses"` with a dynamic title**

Change:

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

(Add a `format` import from `date-fns` at the top of the file if not already there.)

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: PASS

Run: `npm run lint`
Expected: PASS

---

### Task 4.8: Update domain docs with the read-path change

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

Snapshot reads return `summary.snapshotConfidence: "live" | "backfill"` so the UI can flag reconstructed days.

When a snapshot row is missing for a queried date (e.g., backfill window edge or cron gap), the service returns live data with `summary.snapshotMissing: true`.
```

- [ ] **Step 2: Bump `lastVerified` for `metrics-analytics` to `2026-04-29` in `CLAUDE.md`**

---

### PR 4 — STOP HERE

**Hand back to DJ.** Summary:
- `parseAdminDashboardDateRange` now dispatches on date
- `getMembershipByPackageSnapshot` reads from the snapshot table
- Three routes (membership-by-package, stats, user-metrics) dispatch on `mode`
- UI badge lights up with "as of {date}" / "(reconstructed)" / "Showing live counts (snapshot unavailable)"
- KPI card title updates dynamically
- Docs updated

DJ runs the smoke tests in Section 12.3 of the spec → DJ commits → ship.

---

## End-to-End Smoke Test (Manual, by DJ)

After PR 4 ships:

1. Open the admin dashboard, ensure date range "today" — Membership Statuses shows current counts (mode=live, no badge).
2. Switch to "yesterday" — count differs from today if anything has changed in the live DB. Badge: "Status as of {yesterday's date}".
3. Switch to a custom range ending Mar 30 — count reflects Mar 30. Badge: "Status as of Mar 30, 2026 (reconstructed)" (because Mar 30 is in the backfill window).
4. Switch to a future-dated custom range — falls back to live, no errors, no badge.
5. Hit `GET /api/admin/health/membership-snapshot` — expect `{ ok: true, missingDays: [] }` if the cron has been running. If `ok: false`, run `npm run backfill:membership-snapshot -- --from <missing-date> --to <missing-date>` to fill the gap.
6. Lifecycle chart bars match the snapshot values for the selected date.

---

## Rollback Plan

If anything goes wrong:

- **PR 4 only:** revert the changes to `parseAdminDashboardDateRange` (set mode back to `"live"`); the rest stays in place. Dashboard returns to current behavior.
- **PR 3:** disable the cron entries in `vercel.json`. Backfill rows remain.
- **PR 2:** the new collection has no consumers without PR 4; rows can be deleted with `db.membershipdailysnapshots.drop()`.
- **PR 1:** activation history rows are additive and harmless. The new model is unused without consumers.
