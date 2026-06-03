# SHARED-1 — Per-platform hourly revenue aggregator (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.
>
> **⚠️ No-auto-commit:** commit steps run only with the user's standing authorization (they said "commit per part or phase"); otherwise stage + ask.

**Goal:** A live, server-side **hour-of-day (0–23, Australia/Sydney) × convertingPlatform** revenue+conversions aggregator, plus a permission-gated endpoint, that reconciles bit-for-bit with the daily snapshot's per-platform `newRevenue`. This is the keystone every per-platform hourly breakdown (Part B), the Klaviyo hourly (Part C), and the aggregate hourly (Part D) consume.

**Architecture:** One new `PaymentEventRepository` method that mirrors the daily aggregator's *exact* acquisition basis (renewals excluded via `billingReason`, refunds excluded whole-row all-time, `convertingPlatform ?? 'direct'`, exclusive `$lt` window) but `$group`s by `{hour, platform}`. A thin route exposes it (one platform, or `klaviyo` = email+sms merged, or `all`). A DB-backed `tsx` reconciliation test is the correctness gate.

**Tech Stack:** Mongoose aggregation (`$hour` w/ IANA tz), Next route handler + `requirePermission`, `tsx` + `node:assert/strict` (DB-backed, like `revenueAggregator.test.ts`).

**Spec:** master spec §4 (SHARED-1) + the 6 invariants in §3.1.

---

## Cross-cutting invariants this MUST honor (from the master spec, verified in code)

1. Platform basis = `convertingPlatform ?? 'direct'` — NOT `data.utmSource`.
2. Renewal exclusion = `$nor: [{ packageType:'membership', 'data.billingReason':'subscription_cycle' }]` — NOT `isRenewal`.
3. Refunds = whole-row, all-time (`excludeRefundedBenefitsGrantedStages()` — `$lookup` matches any `RefundProcessed` for the pid).
4. Window = exclusive `$lt` next-midnight-AEST (matches `aggregateRevenueForDay`, not the FB hourly route's `$lte`).
5. Zero-fill against the fixed 8-key `ATTRIBUTED_PLATFORM_KEYS`.

---

## Task 1: Repository method `aggregateRevenueByHourAndPlatform` (TDD)

**Files:**
- Test: `src/services/admin/dashboard-stats/__tests__/hourly-revenue-reconciliation.test.ts` (new)
- Modify: `src/repositories/PaymentEventRepository.ts` (add method + imports)
- Modify: `package.json` (add `test:hourly-revenue`)

- [ ] **Step 1: Write the failing reconciliation test**

Create `src/services/admin/dashboard-stats/__tests__/hourly-revenue-reconciliation.test.ts`:

```ts
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import assert from "node:assert/strict";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import {
  aggregateRevenueForDay,
  loadRefundedPaymentIntentIds,
} from "@/services/admin/dashboard-stats/revenueAggregator";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { ATTRIBUTED_PLATFORM_KEYS } from "@/models/DashboardStatsDailySnapshot";

// Far-future day to avoid collisions with real dev data.
const PIDS = [
  "pi_h_meta1", "pi_h_meta2", "pi_h_tt", "pi_h_snap",
  "pi_h_kem", "pi_h_ksms", "pi_h_null", "pi_h_renewal", "pi_h_refunded",
];
const u = (hex: string) => new mongoose.Types.ObjectId(hex.padEnd(24, hex.slice(-1)));

function row(pid: string, over: Record<string, unknown>) {
  return {
    _id: `BenefitsGranted-${pid}`,
    eventType: "BenefitsGranted",
    paymentIntentId: pid,
    userId: u("a1"),
    packageType: "one-time",
    packageId: "x",
    processedBy: "webhook",
    ...over,
  };
}

async function seed() {
  const at = (h: number) => createAESTDateAsUTC(2099, 3, 5, h, 0);
  await PaymentEvent.create([
    row("pi_h_meta1", { data: { price: 100 }, convertingPlatform: "meta", attributionConfidence: "click", timestamp: at(9) }),
    row("pi_h_meta2", { data: { price: 50 }, convertingPlatform: "meta", attributionConfidence: "utm_only", timestamp: at(9) }),
    row("pi_h_tt", { packageType: "upsell", data: { price: 30 }, convertingPlatform: "tiktok", attributionConfidence: "click", timestamp: at(14) }),
    row("pi_h_snap", { packageType: "mini-draw", data: { price: 5 }, convertingPlatform: "snapchat", attributionConfidence: "click", timestamp: at(14) }),
    row("pi_h_kem", { data: { price: 40 }, convertingPlatform: "klaviyo_email", attributionConfidence: "utm_only", timestamp: at(20) }),
    row("pi_h_ksms", { data: { price: 25 }, convertingPlatform: "klaviyo_sms", attributionConfidence: "utm_only", timestamp: at(20) }),
    // null platform → coalesced to "direct"
    row("pi_h_null", { data: { price: 10 }, timestamp: at(3) }),
    // membership renewal → excluded from acquisition by BOTH methods
    row("pi_h_renewal", { packageType: "membership", packageId: "apprentice", data: { price: 49, billingReason: "subscription_cycle" }, convertingPlatform: "meta", attributionConfidence: "click", timestamp: at(9) }),
    // refunded row → excluded whole-row by BOTH
    row("pi_h_refunded", { data: { price: 999 }, convertingPlatform: "meta", attributionConfidence: "click", timestamp: at(11) }),
    { _id: "RefundProcessed-pi_h_refunded", eventType: "RefundProcessed", paymentIntentId: "pi_h_refunded", userId: u("a1"), packageType: "one-time", processedBy: "webhook", data: { refundAmount: 99900 }, timestamp: at(12) },
  ]);
}

async function cleanup() {
  await PaymentEvent.deleteMany({ paymentIntentId: { $in: PIDS } });
}

async function run() {
  await connectDB();
  await cleanup();
  await seed();
  try {
    const dayStart = createAESTDateAsUTC(2099, 3, 5, 0, 0);
    const dayEnd = createAESTDateAsUTC(2099, 3, 6, 0, 0); // exclusive next-midnight AEST

    const repo = new PaymentEventRepository();
    const hourly = await repo.aggregateRevenueByHourAndPlatform(dayStart, dayEnd);

    const refunded = await loadRefundedPaymentIntentIds();
    const daily = await aggregateRevenueForDay(dayStart, dayEnd, refunded);

    // RECONCILIATION: per platform, Σ hourly == daily snapshot newRevenue/conversions.
    for (const p of ATTRIBUTED_PLATFORM_KEYS) {
      const sumRev = hourly[p].reduce((s, b) => s + b.revenue, 0);
      const sumConv = hourly[p].reduce((s, b) => s + b.conversions, 0);
      assert.equal(sumRev, daily.byPlatform[p].newRevenue, `revenue reconciles for ${p}`);
      assert.equal(sumConv, daily.byPlatform[p].conversions, `conversions reconcile for ${p}`);
    }

    // Spot checks on bucketing + exclusions.
    assert.equal(hourly.meta[9].revenue, 150, "meta 9am = 100+50");
    assert.equal(hourly.meta[9].conversions, 2, "meta 9am 2 conversions");
    assert.equal(hourly.meta[11].revenue, 0, "refunded row excluded from its hour");
    assert.equal(hourly.direct[3].revenue, 10, "null platform → direct bucket");
    assert.equal(hourly.klaviyo_email[20].revenue, 40, "klaviyo_email 8pm");
    assert.equal(hourly.klaviyo_sms[20].revenue, 25, "klaviyo_sms 8pm");
    assert.equal(hourly.tiktok[14].revenue, 30, "tiktok 2pm");
    assert.equal(hourly.meta.length, 24, "24 buckets");

    console.log("hourly-revenue reconciliation tests passed");
  } finally {
    await cleanup();
    await mongoose.connection.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm script** — in `package.json`, after `test:advertising-card-model`:

```json
    "test:hourly-revenue": "tsx src/services/admin/dashboard-stats/__tests__/hourly-revenue-reconciliation.test.ts",
```

- [ ] **Step 3: Run → expect fail** — `npm run test:hourly-revenue` → FAIL: `repo.aggregateRevenueByHourAndPlatform is not a function`.

- [ ] **Step 4: Add the method + imports to `PaymentEventRepository.ts`**

Ensure these imports exist at the top (add what's missing — `excludeRefundedBenefitsGrantedStages` is already imported for the existing hourly method; add the model keys):

```ts
import { ATTRIBUTED_PLATFORM_KEYS, type AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";
```

Add this method inside the `PaymentEventRepository` class (e.g. after `aggregateRevenueAndCountByHourOfDay`):

```ts
  /**
   * Hour-of-day (AEST, 0-23) revenue + conversions grouped by convertingPlatform,
   * over [startUTC, endUTC). SHARED aggregator behind every per-platform hourly view.
   *
   * Same acquisition basis as the daily snapshot aggregator (aggregateRevenueForDay):
   * excludes membership renewals (billingReason "subscription_cycle"), excludes whole
   * rows with any RefundProcessed (all-time), coalesces null platform → "direct".
   * `endUTC` is EXCLUSIVE (next-midnight-AEST-in-UTC) so it reconciles bit-for-bit
   * with the daily snapshot's $lt boundary.
   *
   * @returns per-platform map keyed by AttributedPlatformKey; each value = 24 zero-filled buckets.
   */
  async aggregateRevenueByHourAndPlatform(
    startUTC: Date,
    endUTC: Date
  ): Promise<Record<AttributedPlatformKey, { hour: number; revenue: number; conversions: number }[]>> {
    const AEST_TIMEZONE = "Australia/Sydney";

    const result = await PaymentEvent.aggregate<{
      _id: { hour: number; platform: string };
      revenue: number;
      conversions: number;
    }>([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: { $gte: startUTC, $lt: endUTC },
          // Acquisition basis: exclude membership renewals (matches aggregateRevenueForDay).
          $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: {
            hour: { $hour: { date: "$timestamp", timezone: AEST_TIMEZONE } },
            platform: { $ifNull: ["$convertingPlatform", "direct"] },
          },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
          conversions: { $sum: 1 },
        },
      },
    ]).exec();

    // Zero-fill all 8 platforms × 24 hours.
    const out = {} as Record<AttributedPlatformKey, { hour: number; revenue: number; conversions: number }[]>;
    for (const p of ATTRIBUTED_PLATFORM_KEYS) {
      out[p] = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0, conversions: 0 }));
    }
    for (const r of result) {
      const platform = r._id.platform as AttributedPlatformKey;
      const hour = r._id.hour;
      if (!out[platform] || hour < 0 || hour > 23) continue; // ignore any out-of-enum / bad hour
      out[platform][hour] = { hour, revenue: r.revenue, conversions: r.conversions };
    }
    return out;
  }
```

- [ ] **Step 5: Run → expect pass** — `npm run test:hourly-revenue` → prints `hourly-revenue reconciliation tests passed`.

  *If it cannot connect to Mongo (no reachable dev DB in this environment), the method is still verified by the spot-checks once a DB is available; report the connection issue rather than marking the gate green without output.*

- [ ] **Step 6: Commit** *(per-phase, if authorized)* — `feat(admin): hourly revenue aggregator (per convertingPlatform) + reconciliation test`.

---

## Task 2: Hourly-revenue endpoint

**Files:**
- Create: `src/app/api/admin/analytics/hourly-revenue/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // which series: a single platform, "klaviyo" (email+sms merged), or "all" (sum of every platform).
  platform: z
    .enum(["meta", "tiktok", "snapchat", "klaviyo", "all"])
    .optional()
    .default("all"),
});

// Maps the `platform` query value → the convertingPlatform keys to sum.
const PLATFORM_GROUPS: Record<string, AttributedPlatformKey[]> = {
  meta: ["meta"],
  tiktok: ["tiktok"],
  snapchat: ["snapchat"],
  klaviyo: ["klaviyo_email", "klaviyo_sms"],
  all: ["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "google", "direct", "other"],
};

export async function GET(request: NextRequest) {
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Invalid query parameters", details: e instanceof z.ZodError ? e.issues : "Validation failed" },
      { status: 400 }
    );
  }

  await connectDB();

  // AEST day bounds: start = midnight of startDate; end = EXCLUSIVE midnight of the day AFTER endDate.
  const [sy, sm, sd] = q.startDate.split("-").map(Number);
  const [ey, em, ed] = q.endDate.split("-").map(Number);
  const startUTC = createAESTDateAsUTC(sy, sm, sd, 0, 0);
  // Roll the calendar day over via a UTC anchor (createAESTDateAsUTC builds from a string and won't normalize day overflow).
  const endAnchor = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
  endAnchor.setUTCDate(endAnchor.getUTCDate() + 1);
  const endUTC = createAESTDateAsUTC(endAnchor.getUTCFullYear(), endAnchor.getUTCMonth() + 1, endAnchor.getUTCDate(), 0, 0);

  if (endUTC.getTime() <= startUTC.getTime()) {
    return NextResponse.json({ success: false, error: "endDate must be on or after startDate" }, { status: 400 });
  }

  try {
    const byPlatform = await new PaymentEventRepository().aggregateRevenueByHourAndPlatform(startUTC, endUTC);
    const keys = PLATFORM_GROUPS[q.platform];

    // Merge the requested platform group into one 24-bucket series.
    const hourly = Array.from({ length: 24 }, (_, hour) => {
      let revenue = 0;
      let conversions = 0;
      for (const k of keys) {
        revenue += byPlatform[k][hour].revenue;
        conversions += byPlatform[k][hour].conversions;
      }
      return { hour, revenue, conversions };
    });

    const totalRevenue = hourly.reduce((s, h) => s + h.revenue, 0);
    const totalConversions = hourly.reduce((s, h) => s + h.conversions, 0);

    return NextResponse.json({
      success: true,
      data: { hourly, totalRevenue, totalConversions, platform: q.platform, dateRange: { start: q.startDate, end: q.endDate } },
    });
  } catch (e) {
    console.error("❌ [hourly-revenue] aggregation failed:", e);
    return NextResponse.json(
      { success: false, error: "Failed to aggregate hourly revenue", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check + lint** — `npm run type-check` and `npx eslint src/app/api/admin/analytics/hourly-revenue/route.ts` → clean.

- [ ] **Step 3: Commit** *(per-phase, if authorized)* — `feat(admin): GET /api/admin/analytics/hourly-revenue (per-platform hour-of-day)`.

---

## Task 3: Docs (doc-sync — two domains)

**Files:**
- Modify: `docs/mongodb/*` — document `PaymentEventRepository.aggregateRevenueByHourAndPlatform` (basis + exclusive `$lt` + reconciliation guarantee). Grep `docs/mongodb` for the repository section.
- Modify: `docs/admin/api.md` (or `backend.md`) — document `GET /api/admin/analytics/hourly-revenue` (params `startDate`/`endDate`/`platform`; `klaviyo` merges email+sms; gated `facebookAds.view`; live, no rollup).

- [ ] **Step 1:** add the two doc entries (concise — endpoint contract + the reconciliation/merge rules).
- [ ] **Step 2:** confirm the doc-sync Stop hook is satisfied for both the `src/repositories/**` (mongodb) and `src/app/api/admin/**` (admin) changes.

---

## Final verification

- [ ] `npm run test:hourly-revenue` → PASS (or report DB-connection blocker with output).
- [ ] `npm run type-check` → PASS · `npx eslint <changed files>` → clean.
- [ ] Fresh-eyes diff review of the changed files.
- [ ] doc-sync satisfied (mongodb + admin).

## Notes / gotchas

- **Refund exclusion via `$lookup`** (`excludeRefundedBenefitsGrantedStages`) matches the daily aggregator's all-time semantics → reconciliation holds. For very large ranges the per-row `$lookup` is the perf hot-spot; a later optimization could pass a preloaded refunded-pid Set, but keep the all-time semantics.
- **Exclusive `$lt`** is deliberate (the FB hourly route's `$lte` is a 1ms right-edge gap — not propagated here).
- **`klaviyo_email`+`klaviyo_sms` merge** lives in the endpoint's `PLATFORM_GROUPS`, stated once (per the master-spec merge rule), so Part B/C/D don't re-derive it.
- Part B (the per-platform hourly UI in the FB/TikTok/Snapchat tabs) consumes this endpoint via a `useHourlyRevenue` hook — separate plan. The Klaviyo series waits for the Klaviyo tab (Part C).
