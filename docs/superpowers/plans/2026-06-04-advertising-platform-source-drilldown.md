# Advertising Platform Source Drill-down — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ Repo rule §1 (no auto-commit):** The `git commit` step at the end of each task is written for the TDD rhythm, but **do NOT run it** unless the user has authorized commits this session (keywords: `commit`, `push`, `merge`, `make a PR`, `ship it`). If not authorized, finish the task, run its verification, and pause for approval instead of committing. A `PreToolUse` hook also blocks unauthorized commits.

**Goal:** Make every row of the admin Overview "Advertising" card drill down — hover shows that platform's attributed revenue split by source category (bars); click opens a modal with those bars + a searchable, category-filterable buyer list — and mirror the new read to Norm.

**Architecture:** One live, on-demand read (`getPlatformRevenueBreakdown`) pulls a platform's net, acquisition-only `PaymentEvent`s once, classifies them in memory into 5 source categories (reusing `getRevenueDetails`' category definitions), and returns both the category summary (bars) and a paginated buyer list. An admin route + a Norm route (`withNorm`, PII-safe) both wrap that one service. The card gains row click/hover; a new modal composes the existing `RevenueDetailModal` primitives + `BarList`.

**Tech Stack:** Next.js 15 App Router, MongoDB/Mongoose aggregation, TanStack Query, Zod, Tailwind, `tsx` standalone tests (no jest).

**Spec:** [docs/superpowers/specs/2026-06-04-advertising-platform-source-drilldown-design.md](../specs/2026-06-04-advertising-platform-source-drilldown-design.md). Honors the [Advertising Analytics Suite master spec](../specs/2026-06-03-advertising-analytics-suite-master-spec.md) §3.1 invariants (group by `convertingPlatform`, renewals excluded via `billingReason`, whole-row refund netting).

---

## File map

| File | Responsibility | Task |
|------|----------------|------|
| `src/services/admin/platformRevenueBreakdown.ts` (new) | Pure classifier + bucketer + DB read | 1, 2 |
| `src/services/admin/__tests__/platformRevenueBreakdown.test.ts` (new) + `package.json` | Pure unit test | 1 |
| `src/app/api/admin/dashboard/revenue-details/by-platform/route.ts` (new) | Admin HTTP read | 3 |
| `src/hooks/queries/useAdminQueries.ts` (modify) | `usePlatformRevenueBreakdown` + types | 4 |
| `src/app/admin/component/overview/sections/advertisingCardModel.ts` (modify) | Add `platformKey` to row VM + export `ACQUISITION_CATEGORY_META` + `moneyExact` | 5 |
| `src/components/admin/ui/DataTable.tsx` (modify) | Optional row hover handlers | 5 |
| `src/components/modals/PlatformRevenueModal/index.tsx` (new) | Bars + filterable buyer list | 6 |
| `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx` (modify) | Row click + hover popover + modal | 7 |
| `src/app/admin/component/overview/DashboardOverview.tsx` (modify) | Thread date/onUserClick props | 7 |
| `src/lib/internal-norm/schemas/dashboard.ts` (modify) | `NormPlatformRevenueBreakdownSchema` | 8 |
| `src/lib/internal-norm/classification.ts` (modify) | Registry entry | 8 |
| `src/app/api/internal/norm/v1/dashboard/revenue-details/by-platform/route.ts` (new) | Norm HTTP read | 8 |
| `src/generated/normToolsManifest.json` (regen) | `npm run build:norm-manifest` | 8 |
| `docs/internal-norm/norm-context.md` (modify) | Norm tool description | 8 |
| `docs/admin/*` (modify) | Domain docs (doc-sync hook) | 9 |

---

## Task 1: Pure classifier + bucketer (TDD)

**Files:**
- Create: `src/services/admin/platformRevenueBreakdown.ts`
- Create: `src/services/admin/__tests__/platformRevenueBreakdown.test.ts`
- Modify: `package.json` (add `test:platform-revenue-breakdown`)

- [ ] **Step 1: Write the failing test**

Create `src/services/admin/__tests__/platformRevenueBreakdown.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  classifyAcquisitionCategory,
  buildByCategory,
  ACQUISITION_CATEGORIES,
} from "../platformRevenueBreakdown";

type Ev = Parameters<typeof classifyAcquisitionCategory>[0];
const ev = (partial: Partial<Ev>): Ev =>
  ({ userId: "u1", data: {}, timestamp: new Date("2026-05-01"), ...partial }) as Ev;

function run() {
  // classifier
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "membership", data: {} })), "membership-purchase");
  assert.equal(
    classifyAcquisitionCategory(ev({ packageType: "membership", data: { billingReason: "subscription_cycle" } })),
    null,
    "renewal excluded",
  );
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "one-time", packageId: "tradie-pack" })), "one-time-purchase");
  assert.equal(
    classifyAcquisitionCategory(ev({ packageType: "one-time", packageId: "additional-tradie-pack" })),
    "additional-one-time",
  );
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "one-time" })), "one-time-purchase", "no packageId → first");
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "mini-draw" })), "mini-draw");
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "upsell" })), "upsell");
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "weird" })), null, "unknown type excluded");

  // bucketer: zero-filled 5 buckets, distinct users, renewals excluded, stable order
  const events: Ev[] = [
    ev({ userId: "a", packageType: "membership", data: { price: 50 } }),
    ev({ userId: "b", packageType: "membership", data: { price: 50 } }),
    ev({ userId: "a", packageType: "membership", data: { price: 50, billingReason: "subscription_cycle" } }),
    ev({ userId: "a", packageType: "one-time", packageId: "tradie-pack", data: { price: 75 } }),
    ev({ userId: "c", packageType: "one-time", packageId: "additional-tradie-pack", data: { price: 25 } }),
    ev({ userId: "d", packageType: "upsell", data: { price: 10 } }),
  ];
  const bc = buildByCategory(events);
  assert.equal(bc.length, 5, "always 5 buckets");
  assert.deepEqual(bc.map((b) => b.category), ACQUISITION_CATEGORIES, "stable order");
  const m = bc.find((b) => b.category === "membership-purchase")!;
  assert.equal(m.revenue, 100, "renewal excluded from membership revenue");
  assert.equal(m.purchaseCount, 2);
  assert.equal(m.userCount, 2, "distinct users a,b");
  assert.equal(bc.find((b) => b.category === "one-time-purchase")!.revenue, 75);
  assert.equal(bc.find((b) => b.category === "additional-one-time")!.revenue, 25);
  assert.equal(bc.find((b) => b.category === "mini-draw")!.revenue, 0, "zero-filled");
  assert.equal(bc.find((b) => b.category === "upsell")!.revenue, 10);
  assert.equal(bc.reduce((s, b) => s + b.revenue, 0), 100 + 75 + 25 + 10, "bars sum to acquisition total");

  console.log("✓ platformRevenueBreakdown: all assertions passed");
}

run();
```

- [ ] **Step 2: Add the npm script**

In `package.json`, next to `"test:advertising-card-model"`, add:

```json
"test:platform-revenue-breakdown": "tsx src/services/admin/__tests__/platformRevenueBreakdown.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:platform-revenue-breakdown`
Expected: FAIL — `Cannot find module '../platformRevenueBreakdown'` (file not created yet).

- [ ] **Step 4: Write the pure parts of the module**

Create `src/services/admin/platformRevenueBreakdown.ts` with ONLY the pure pieces for now (the DB function is added in Task 2):

```ts
// src/services/admin/platformRevenueBreakdown.ts
// Per-platform acquisition-revenue breakdown by source category + the matching
// per-user buyer list. Powers the Advertising card's hover popover + click modal,
// and the Norm `dashboard.revenue-details.by-platform` tool.
//
// Honors the Advertising Analytics Suite invariants (master spec §3.1):
//  - platform basis = convertingPlatform (null/missing folded into "direct")
//  - renewals excluded via data.billingReason === "subscription_cycle" (NOT isRenewal)
//  - whole-row refund netting via fetchNetBenefitsGrantedWithMatch (added Task 2)

/** Lean projection of a net BenefitsGranted event used by the classifier/bucketer. */
export type LeanRevenueEvent = {
  _id?: string;
  userId?: unknown;
  packageType?: string;
  packageId?: string;
  packageName?: string;
  data?: { price?: number; billingReason?: string; [k: string]: unknown };
  timestamp?: Date;
};

/** The 5 acquisition source categories (renewals are excluded entirely). */
export type AcquisitionCategory =
  | "membership-purchase"
  | "one-time-purchase"
  | "additional-one-time"
  | "mini-draw"
  | "upsell";

export const ACQUISITION_CATEGORIES: AcquisitionCategory[] = [
  "membership-purchase",
  "one-time-purchase",
  "additional-one-time",
  "mini-draw",
  "upsell",
];

/**
 * Classify one net BenefitsGranted event into an acquisition category, or null to
 * exclude it (membership renewal, or an unknown package type). Mirrors the category
 * definitions in dashboardSlices.getRevenueDetails so the buckets reconcile with the
 * global Revenue-breakdown card.
 */
export function classifyAcquisitionCategory(event: LeanRevenueEvent): AcquisitionCategory | null {
  const pt = event.packageType;
  if (pt === "membership") {
    return event.data?.billingReason === "subscription_cycle" ? null : "membership-purchase";
  }
  if (pt === "mini-draw") return "mini-draw";
  if (pt === "upsell") return "upsell";
  if (pt === "one-time") {
    return (event.packageId ?? "").startsWith("additional-") ? "additional-one-time" : "one-time-purchase";
  }
  return null;
}

export interface PlatformByCategoryEntry {
  category: AcquisitionCategory;
  revenue: number;
  purchaseCount: number;
  userCount: number;
}

/** Zero-filled 5-bucket summary over a set of events (pure; the bars' source of truth). */
export function buildByCategory(events: LeanRevenueEvent[]): PlatformByCategoryEntry[] {
  const acc = new Map<AcquisitionCategory, { revenue: number; purchaseCount: number; users: Set<string> }>();
  for (const c of ACQUISITION_CATEGORIES) acc.set(c, { revenue: 0, purchaseCount: 0, users: new Set() });
  for (const e of events) {
    const cat = classifyAcquisitionCategory(e);
    if (!cat) continue;
    const bucket = acc.get(cat)!;
    bucket.revenue += e.data?.price ?? 0;
    bucket.purchaseCount += 1;
    const uid = e.userId?.toString();
    if (uid) bucket.users.add(uid);
  }
  return ACQUISITION_CATEGORIES.map((category) => {
    const b = acc.get(category)!;
    return { category, revenue: b.revenue, purchaseCount: b.purchaseCount, userCount: b.users.size };
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:platform-revenue-breakdown`
Expected: PASS — `✓ platformRevenueBreakdown: all assertions passed`.

- [ ] **Step 6: Commit** (see §1 caveat — only if authorized)

```bash
git add src/services/admin/platformRevenueBreakdown.ts src/services/admin/__tests__/platformRevenueBreakdown.test.ts package.json
git commit -m "feat(admin): pure acquisition-category classifier + bucketer for platform revenue drill-down"
```

---

## Task 2: Service DB read

**Files:**
- Modify: `src/services/admin/platformRevenueBreakdown.ts`

- [ ] **Step 1: Add imports at the top of the file**

Add below the file header comment (before `export type LeanRevenueEvent`):

```ts
import User from "@/models/User";
import { fetchNetBenefitsGrantedWithMatch } from "@/utils/payment/payment-event-net-queries";
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";
import type { RevenueDetailsUserRow, RevenueDetailsPurchase } from "@/services/admin/dashboardSlices";
```

- [ ] **Step 2: Append the DB function + its types to the same file**

```ts
export interface PlatformRevenueBreakdownInput {
  platform: AttributedPlatformKey;
  startDate: Date;
  endDate: Date;
  category?: AcquisitionCategory; // omitted → list spans all 5
  page: number;
  limit: number;
  summaryOnly?: boolean; // hover path: skip the buyer-list hydration
}

export interface PlatformRevenueBreakdownData {
  platform: AttributedPlatformKey;
  byCategory: PlatformByCategoryEntry[]; // always full (all 5) — powers bars + header total
  totalRevenue: number; // list-scoped (respects category filter); == platform total when no filter
  totalPurchases: number;
  totalUsers: number;
  users: RevenueDetailsUserRow[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/** convertingPlatform clause; null/missing folds into "direct" (master-spec invariant #1). */
function platformMatchClause(platform: AttributedPlatformKey): Record<string, unknown> {
  if (platform === "direct") return { convertingPlatform: { $in: ["direct", null] } };
  return { convertingPlatform: platform };
}

export async function getPlatformRevenueBreakdown(
  input: PlatformRevenueBreakdownInput,
): Promise<PlatformRevenueBreakdownData> {
  const { platform, startDate, endDate, category, page, limit, summaryOnly } = input;

  const match: Record<string, unknown> = {
    timestamp: { $gte: startDate, $lte: endDate },
    ...platformMatchClause(platform),
    // Acquisition only: any non-membership acquisition type, OR a non-renewal membership.
    $or: [
      { packageType: { $in: ["one-time", "mini-draw", "upsell"] } },
      { packageType: "membership", "data.billingReason": { $ne: "subscription_cycle" } },
    ],
  };

  const events = (await fetchNetBenefitsGrantedWithMatch(match, {
    userId: 1,
    packageType: 1,
    packageId: 1,
    packageName: 1,
    data: 1,
    timestamp: 1,
    _id: 1,
  })) as LeanRevenueEvent[];

  const byCategory = buildByCategory(events);

  if (summaryOnly) {
    return {
      platform,
      byCategory,
      totalRevenue: byCategory.reduce((s, b) => s + b.revenue, 0),
      totalPurchases: byCategory.reduce((s, b) => s + b.purchaseCount, 0),
      totalUsers: 0,
      users: [],
      pagination: { currentPage: 1, totalPages: 0, totalCount: 0, limit, hasNextPage: false, hasPrevPage: false },
    };
  }

  // List scope: filter to the selected category (or all valid acquisition), newest first.
  const listEvents = events
    .filter((e) => {
      const cat = classifyAcquisitionCategory(e);
      return cat !== null && (category ? cat === category : true);
    })
    .sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime());

  const userEventsMap = new Map<string, LeanRevenueEvent[]>();
  for (const e of listEvents) {
    const uid = e.userId?.toString() || "";
    if (!uid) continue;
    if (!userEventsMap.has(uid)) userEventsMap.set(uid, []);
    userEventsMap.get(uid)!.push(e);
  }

  const userIds = Array.from(userEventsMap.keys());
  const totalUsers = userIds.length;
  const totalPurchases = listEvents.length;
  const totalRevenue = listEvents.reduce((s, e) => s + (e.data?.price ?? 0), 0);

  const startIndex = (page - 1) * limit;
  const paginatedUserIds = userIds.slice(startIndex, startIndex + limit);

  const userDocs = await User.find({ _id: { $in: paginatedUserIds } })
    .select("firstName lastName email mobile")
    .lean();

  const users: RevenueDetailsUserRow[] = paginatedUserIds.map((userId) => {
    const user = userDocs.find((u) => u._id.toString() === userId);
    const userEvents = userEventsMap.get(userId) || [];
    const purchases: RevenueDetailsPurchase[] = userEvents.map((e) => ({
      paymentEventId: e._id?.toString() ?? "",
      timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : "",
      amount: e.data?.price ?? 0,
      packageId: e.packageId,
      packageName: e.packageName,
      billingReason: e.data?.billingReason,
    }));
    return {
      userId,
      userInfo: user
        ? {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            email: user.email || "",
            mobile: user.mobile || undefined,
          }
        : { firstName: "Unknown", lastName: "", email: "", mobile: undefined },
      purchases,
      totalContributed: purchases.reduce((s, p) => s + p.amount, 0),
      purchaseCount: purchases.length,
    };
  });

  const totalPages = Math.ceil(totalUsers / limit);
  return {
    platform,
    byCategory,
    totalRevenue,
    totalPurchases,
    totalUsers,
    users,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount: totalUsers,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
```

- [ ] **Step 3: Verify type-check + pure test still pass**

Run: `npm run type-check`
Expected: no errors.
Run: `npm run test:platform-revenue-breakdown`
Expected: PASS (the pure test still imports cleanly even with the mongoose model imports present).

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add src/services/admin/platformRevenueBreakdown.ts
git commit -m "feat(admin): getPlatformRevenueBreakdown live read (net, acquisition-only, per convertingPlatform)"
```

---

## Task 3: Admin API route

**Files:**
- Create: `src/app/api/admin/dashboard/revenue-details/by-platform/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { resolveRevenueDetailsRange, type RevenueDetailsDateRange } from "@/services/admin/dashboardSlices";
import {
  getPlatformRevenueBreakdown,
  ACQUISITION_CATEGORIES,
  type AcquisitionCategory,
} from "@/services/admin/platformRevenueBreakdown";
import { ATTRIBUTED_PLATFORM_KEYS, type AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

/**
 * GET /api/admin/dashboard/revenue-details/by-platform
 * Acquisition revenue for one convertingPlatform, split by source category, with a
 * paginated buyer list (optionally filtered to one category). `summaryOnly=true`
 * returns just the category bars (hover path).
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const sp = request.nextUrl.searchParams;
    const platform = sp.get("platform") as AttributedPlatformKey | null;
    const categoryParam = sp.get("category");
    const dateRange = (sp.get("dateRange") as RevenueDetailsDateRange) || "today";
    const startDateParam = sp.get("startDate");
    const endDateParam = sp.get("endDate");
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10)));
    const summaryOnly = sp.get("summaryOnly") === "true";

    if (!platform || !ATTRIBUTED_PLATFORM_KEYS.includes(platform)) {
      return NextResponse.json({ error: "valid platform parameter is required" }, { status: 400 });
    }

    let category: AcquisitionCategory | undefined;
    if (categoryParam) {
      if (!ACQUISITION_CATEGORIES.includes(categoryParam as AcquisitionCategory)) {
        return NextResponse.json({ error: "invalid category parameter" }, { status: 400 });
      }
      category = categoryParam as AcquisitionCategory;
    }

    const rangeResult = resolveRevenueDetailsRange({ dateRange, startDateParam, endDateParam });
    if (!rangeResult.ok) {
      return NextResponse.json({ error: rangeResult.error }, { status: rangeResult.status });
    }

    const data = await getPlatformRevenueBreakdown({
      platform,
      startDate: rangeResult.value.startDate,
      endDate: rangeResult.value.endDate,
      category,
      page,
      limit,
      summaryOnly,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching platform revenue breakdown:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch platform revenue breakdown",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: no errors.
(Manual HTTP verification happens via the UI in Task 7 — the route is auth-gated.)

- [ ] **Step 3: Commit** (only if authorized)

```bash
git add "src/app/api/admin/dashboard/revenue-details/by-platform/route.ts"
git commit -m "feat(admin): GET revenue-details/by-platform route"
```

---

## Task 4: Client hook

**Files:**
- Modify: `src/hooks/queries/useAdminQueries.ts`

- [ ] **Step 1: Add types + hook**

Append near the existing `useRevenueDetails` / `RevenueDetailUser` definitions:

```ts
export interface PlatformByCategoryEntry {
  category: "membership-purchase" | "one-time-purchase" | "additional-one-time" | "mini-draw" | "upsell";
  revenue: number;
  purchaseCount: number;
  userCount: number;
}

export interface PlatformRevenueBreakdownData {
  platform: string;
  byCategory: PlatformByCategoryEntry[];
  totalRevenue: number;
  totalPurchases: number;
  totalUsers: number;
  users: RevenueDetailUser[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Per-platform acquisition revenue split by source category + paginated buyer list.
 * `summaryOnly` (hover) returns just the bars and uses a longer staleTime.
 */
export function usePlatformRevenueBreakdown(
  platform: string | null,
  dateRange: string,
  startDate: string | undefined,
  endDate: string | undefined,
  category: string | undefined,
  page: number,
  summaryOnly: boolean,
  enabled = true,
) {
  return useQuery<PlatformRevenueBreakdownData>({
    queryKey: [
      "admin",
      "dashboard",
      "revenue-details-by-platform",
      platform,
      dateRange,
      startDate,
      endDate,
      category ?? "all",
      page,
      summaryOnly,
    ],
    queryFn: async (): Promise<PlatformRevenueBreakdownData> => {
      const params = new URLSearchParams({ platform: platform as string, dateRange, page: String(page), limit: "50" });
      if ((dateRange === "custom" || dateRange === "current-draw" || dateRange === "last-draw") && startDate && endDate) {
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }
      if (category) params.append("category", category);
      if (summaryOnly) params.append("summaryOnly", "true");

      const res = await fetch(`/api/admin/dashboard/revenue-details/by-platform?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch platform revenue breakdown: ${res.statusText}`);
      const result = await res.json();
      if (!result.success) throw new Error("Failed to fetch platform revenue breakdown");
      return result.data;
    },
    enabled: enabled && !!platform,
    staleTime: summaryOnly ? 5 * 60 * 1000 : 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: no errors. (`useQuery` and `RevenueDetailUser` already exist in this file.)

- [ ] **Step 3: Commit** (only if authorized)

```bash
git add src/hooks/queries/useAdminQueries.ts
git commit -m "feat(admin): usePlatformRevenueBreakdown query hook"
```

---

## Task 5: Row VM `platformKey` + shared category meta + DataTable hover props

**Files:**
- Modify: `src/app/admin/component/overview/sections/advertisingCardModel.ts`
- Modify: `src/components/admin/ui/DataTable.tsx`

- [ ] **Step 1: Add `platformKey` to the row VM + export shared meta**

In `advertisingCardModel.ts`:

1. Add the import at the top:
```ts
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";
```

2. Add `platformKey` to the `AdvertisingRowVM` interface (after `id: string;`):
```ts
  platformKey: AttributedPlatformKey; // convertingPlatform key for drill-down (meta, …, direct)
```

3. Type `RowConfig.key` as the platform key — change `key: string;` to:
```ts
  key: AttributedPlatformKey; // attributedRevenue map key (convertingPlatform)
```

4. In `buildAdvertisingRows`, add `platformKey: cfg.key,` to the returned row object (next to `id: cfg.id,`).

5. In `buildDirectRow`, add `platformKey: "direct",` to the returned object (next to `id: "direct",`).

6. At the bottom of the file, export the shared category presentation meta + money formatter (reused by the modal and the hover popover):
```ts
/** Shared label/color/unit per acquisition source category — used by the drill-down bars. */
export const ACQUISITION_CATEGORY_META: {
  id: "membership-purchase" | "one-time-purchase" | "additional-one-time" | "mini-draw" | "upsell";
  label: string;
  color: string;
  unit: string;
}[] = [
  { id: "membership-purchase", label: "Membership New", color: "#f97316", unit: "subscriptions" },
  { id: "one-time-purchase", label: "One-Time First", color: "#3b82f6", unit: "purchases" },
  { id: "additional-one-time", label: "One-Time Add'l", color: "#6366f1", unit: "purchases" },
  { id: "mini-draw", label: "Mini Draws", color: "#a855f7", unit: "entries" },
  { id: "upsell", label: "Upsells", color: "#ec4899", unit: "purchases" },
];

/** Exact AUD money for the drill-down bars (matches RevenueBreakdownCard). */
export const moneyExact = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
```

- [ ] **Step 2: Add optional hover handlers to DataTable**

In `src/components/admin/ui/DataTable.tsx`:

1. Change the react import on line 2 to include the event type:
```ts
import { useMemo, useState, type ReactNode, type MouseEvent } from "react";
```

2. Extend the props (the destructure + its type) to:
```ts
export function DataTable<T extends Record<string, unknown> & { id?: string | number }>({
  columns, rows, renderCell, onRowClick, onRowMouseEnter, onRowMouseLeave,
}: {
  columns: Column[];
  rows: T[];
  renderCell?: (key: string, row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  onRowMouseEnter?: (row: T, e: MouseEvent<HTMLTableRowElement>) => void;
  onRowMouseLeave?: () => void;
}) {
```

3. On the `<tr>` element, add the two handlers next to `onClick`:
```tsx
            <tr key={row.id ?? ri}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onMouseEnter={onRowMouseEnter ? (e) => onRowMouseEnter(row, e) : undefined}
              onMouseLeave={onRowMouseLeave}
              className={`border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}>
```

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: no errors.
Run: `npm run test:advertising-card-model`
Expected: PASS (adding `platformKey` is additive; existing assertions check sub-fields, not whole-row equality).

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add src/app/admin/component/overview/sections/advertisingCardModel.ts src/components/admin/ui/DataTable.tsx
git commit -m "feat(admin): row platformKey + shared category meta + DataTable hover handlers"
```

---

## Task 6: PlatformRevenueModal

**Files:**
- Create: `src/components/modals/PlatformRevenueModal/index.tsx`

- [ ] **Step 1: Create the modal**

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, Users } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { ModalContainer, ModalHeader, ModalContent } from "@/components/modals/ui";
import { BarList, type BarItem } from "@/components/admin/ui";
import { usePlatformRevenueBreakdown } from "@/hooks/queries/useAdminQueries";
import UserList from "@/components/modals/RevenueDetailModal/UserList";
import Pagination from "@/components/modals/RevenueDetailModal/Pagination";
import type { SortKey, SortOrder } from "@/components/modals/RevenueDetailModal/TableHeader";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import {
  ACQUISITION_CATEGORY_META,
  moneyExact,
} from "@/app/admin/component/overview/sections/advertisingCardModel";

type AcqCategory = (typeof ACQUISITION_CATEGORY_META)[number]["id"];

export default function PlatformRevenueModal({
  isOpen,
  onClose,
  platform,
  platformLabel,
  dateRange,
  startDate,
  endDate,
  onUserClick,
}: {
  isOpen: boolean;
  onClose: () => void;
  platform: string | null;
  platformLabel: string;
  dateRange: DateRange;
  startDate?: string;
  endDate?: string;
  onUserClick?: (userId: string) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<AcqCategory | "all">("all");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("amount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data, isLoading, error } = usePlatformRevenueBreakdown(
    isOpen ? platform : null,
    dateRange,
    startDate,
    endDate,
    selectedCategory === "all" ? undefined : selectedCategory,
    page,
    false,
    isOpen,
  );

  useEffect(() => {
    if (!isOpen) {
      setSelectedCategory("all");
      setPage(1);
      setSearchQuery("");
      setExpandedUsers(new Set());
      setSortBy("amount");
      setSortOrder("desc");
    }
  }, [isOpen]);
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, debouncedSearch]);

  const platformTotal = useMemo(
    () => (data ? data.byCategory.reduce((s, b) => s + b.revenue, 0) : 0),
    [data],
  );

  const barItems: BarItem[] = (
    data?.byCategory ??
    ACQUISITION_CATEGORY_META.map((c) => ({ category: c.id, revenue: 0, purchaseCount: 0, userCount: 0 }))
  ).map((b) => {
    const meta = ACQUISITION_CATEGORY_META.find((c) => c.id === b.category)!;
    return { id: b.category, label: meta.label, value: b.revenue, color: meta.color, count: b.purchaseCount, unit: meta.unit };
  });

  const filteredUsers = useMemo(() => {
    const users = data?.users ?? [];
    let list = users;
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((u) => {
        const full = `${u.userInfo.firstName} ${u.userInfo.lastName}`.toLowerCase();
        return (
          u.userInfo.email.toLowerCase().includes(q) ||
          full.includes(q) ||
          u.userId.toLowerCase().includes(q) ||
          (u.userInfo.mobile || "").toLowerCase().includes(q)
        );
      });
    }
    return [...list].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortBy) {
        case "name":
          av = `${a.userInfo.firstName} ${a.userInfo.lastName}`.toLowerCase();
          bv = `${b.userInfo.firstName} ${b.userInfo.lastName}`.toLowerCase();
          break;
        case "count":
          av = a.purchaseCount;
          bv = b.purchaseCount;
          break;
        case "date":
          av = a.purchases[0] ? new Date(a.purchases[0].timestamp).getTime() : 0;
          bv = b.purchases[0] ? new Date(b.purchases[0].timestamp).getTime() : 0;
          break;
        default:
          av = a.totalContributed;
          bv = b.totalContributed;
      }
      if (sortOrder === "asc") return av > bv ? 1 : av < bv ? -1 : 0;
      return av < bv ? 1 : av > bv ? -1 : 0;
    });
  }, [data?.users, debouncedSearch, sortBy, sortOrder]);

  const toggleUser = (id: string) =>
    setExpandedUsers((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const handleSort = (k: SortKey) => {
    if (sortBy === k) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setSortOrder("desc");
    }
  };

  const chipClass = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
      active
        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent"
        : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
    }`;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1200px]">
      <ModalHeader
        title={`${platformLabel} — revenue breakdown`}
        subtitle={
          data
            ? `${moneyExact(platformTotal)} attributed • ${data.totalUsers.toLocaleString()} ${
                selectedCategory === "all" ? "buyers" : "in this category"
              }`
            : "Loading..."
        }
        onClose={onClose}
      />
      <ModalContent padding="none">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <BarList
            items={barItems}
            fmt={moneyExact}
            fmtCount={(n) => n.toLocaleString("en-AU")}
            onItemClick={(id) => setSelectedCategory((prev) => (prev === id ? "all" : (id as AcqCategory)))}
          />

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelectedCategory("all")} className={chipClass(selectedCategory === "all")}>
              All
            </button>
            {ACQUISITION_CATEGORY_META.map((c) => (
              <button key={c.id} onClick={() => setSelectedCategory(c.id)} className={chipClass(selectedCategory === c.id)}>
                {c.label}
              </button>
            ))}
          </div>

          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, mobile…"
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/45 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-red-700 dark:text-red-300 text-sm">
                {error instanceof Error ? error.message : "Failed to load"}
              </span>
            </div>
          )}
          {isLoading && !data && (
            <div className="p-8 text-center">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-gray-400 animate-spin" />
              <p className="text-gray-600 dark:text-neutral-400">Loading…</p>
            </div>
          )}
          {data && !isLoading && filteredUsers.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">
              <Users className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-neutral-600" />
              <p>No buyers found</p>
            </div>
          )}
          {data && filteredUsers.length > 0 && (
            <>
              <UserList
                users={filteredUsers}
                expandedUsers={expandedUsers}
                onToggleExpanded={toggleUser}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                onUserClick={onUserClick}
              />
              <Pagination
                isServerPaginationActive={data.pagination.totalCount > 50}
                filteredCount={filteredUsers.length}
                totalCount={data.pagination.totalCount}
                hasActiveFilters={!!debouncedSearch.trim()}
                currentPage={data.pagination.currentPage}
                totalPages={data.pagination.totalPages}
                page={page}
                onPageChange={setPage}
                isLoading={isLoading}
              />
            </>
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: no errors.
Run: `npm run lint`
Expected: clean (no unused vars / no-unused-expressions).

- [ ] **Step 3: Commit** (only if authorized)

```bash
git add "src/components/modals/PlatformRevenueModal/index.tsx"
git commit -m "feat(admin): PlatformRevenueModal — source bars + filterable buyer list"
```

---

## Task 7: Wire the Advertising card (click + hover popover) + overview props

**Files:**
- Modify: `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx`
- Modify: `src/app/admin/component/overview/DashboardOverview.tsx`

- [ ] **Step 1: Pass props from DashboardOverview**

In `DashboardOverview.tsx`, change the `<AdvertisingPlatformCard ... />` usage (currently `stats`/`loading` only) to:

```tsx
        <AdvertisingPlatformCard
          stats={dashboardStats}
          loading={statsLoading}
          dateRange={dateRange}
          startDate={customStartDate || undefined}
          endDate={customEndDate || undefined}
          onUserClick={openUserModal}
        />
```

- [ ] **Step 2: Rewrite AdvertisingPlatformCard to add click + hover**

Replace the file's imports + component signature + return so it: accepts the new props, opens `PlatformRevenueModal` on row click, and shows a hover popover. Apply these edits:

1. Replace the top imports block with:

```tsx
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { TrendingUp } from "lucide-react";
import {
  Card,
  SectionTitle,
  DataTable,
  PlatformLogo,
  BarList,
  type BarItem,
  type Column,
} from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import { usePlatformRevenueBreakdown } from "@/hooks/queries/useAdminQueries";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import PlatformRevenueModal from "@/components/modals/PlatformRevenueModal";
import {
  buildAdvertisingRows,
  buildDirectRow,
  computeBlendedRoas,
  computeTotalAttributedRevenue,
  ACQUISITION_CATEGORY_META,
  moneyExact,
  type AdvertisingRowVM,
} from "./advertisingCardModel";
```

2. Change the component signature + add interaction state. Replace:

```tsx
export default function AdvertisingPlatformCard({
  stats,
  loading = false,
}: {
  stats: AdminDashboardStats | undefined;
  loading?: boolean;
}) {
  const { formatCurrency } = useMetricsFormatting();
```

with:

```tsx
export default function AdvertisingPlatformCard({
  stats,
  loading = false,
  dateRange = "today",
  startDate,
  endDate,
  onUserClick,
}: {
  stats: AdminDashboardStats | undefined;
  loading?: boolean;
  dateRange?: DateRange;
  startDate?: string;
  endDate?: string;
  onUserClick?: (userId: string) => void;
}) {
  const { formatCurrency } = useMetricsFormatting();

  // Click → modal; hover (pointer-fine) → floating source-breakdown popover.
  const [modal, setModal] = useState<{ key: string; label: string } | null>(null);
  const [hovered, setHovered] = useState<{ key: string; label: string; top: number; left: number } | null>(null);

  const { data: hoverData } = usePlatformRevenueBreakdown(
    hovered?.key ?? null,
    dateRange,
    startDate,
    endDate,
    undefined,
    1,
    true,
    !!hovered,
  );

  const hoverBars: BarItem[] = (hoverData?.byCategory ?? []).map((b) => {
    const meta = ACQUISITION_CATEGORY_META.find((c) => c.id === b.category)!;
    return { id: b.category, label: meta.label, value: b.revenue, color: meta.color, count: b.purchaseCount, unit: meta.unit };
  });
```

3. At the very end of the component, replace the closing `</Card>` + `);` + `}` region (the `return ( ... )`) so the JSX `<DataTable .../>` gets row handlers and the modal + popover are rendered. Specifically, change the `<DataTable ... />` line to:

```tsx
      <DataTable<AdvertisingRowVM>
        columns={COLUMNS}
        rows={rows}
        renderCell={renderCell}
        onRowClick={(row) => setModal({ key: row.platformKey, label: row.platform })}
        onRowMouseEnter={(row, e) => {
          if (typeof window !== "undefined" && !window.matchMedia("(pointer: fine)").matches) return;
          const r = e.currentTarget.getBoundingClientRect();
          setHovered({ key: row.platformKey, label: row.platform, top: r.bottom + 6, left: r.left });
        }}
        onRowMouseLeave={() => setHovered(null)}
      />
```

4. Immediately before the final `</Card>`, add the hover popover; and after `</Card>` (before the component's closing `);`) add the modal:

```tsx
      {hovered &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{ position: "fixed", top: hovered.top, left: hovered.left, width: 300, zIndex: 60 }}
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl p-3 pointer-events-none"
          >
            <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">{hovered.label} — source breakdown</p>
            {hoverData ? (
              hoverBars.length > 0 ? (
                <BarList items={hoverBars} fmt={moneyExact} fmtCount={(n) => n.toLocaleString("en-AU")} />
              ) : (
                <p className="text-xs text-neutral-400">No attributed revenue in range.</p>
              )
            ) : (
              <p className="text-xs text-neutral-400">Loading…</p>
            )}
          </div>,
          document.body,
        )}
    </Card>
```

…and after the `</Card>` add the modal so the final return looks like:

```tsx
  return (
    <>
      <Card className="p-5 h-full min-w-0">
        {/* …existing SectionTitle, DataTable (now with row handlers), direct footnote, popover… */}
      </Card>
      <PlatformRevenueModal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        platform={modal?.key ?? null}
        platformLabel={modal?.label ?? ""}
        dateRange={dateRange}
        startDate={startDate}
        endDate={endDate}
        onUserClick={onUserClick}
      />
    </>
  );
```

> Note: wrap the existing `<Card>…</Card>` in the `<>…</>` fragment shown above and append `<PlatformRevenueModal/>` as a sibling. Keep the existing `SectionTitle`, blended-ROAS `right` block, and the Direct footnote exactly as they are.

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: no errors.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Manual verification (dev server)**

Run: `npm run dev`, open `/admin` (Overview), with a date range that has data (e.g. Last Draw).
Expected:
- Hovering "Facebook Ads" shows a popover with source bars; the bar values sum to the row's revenue.
- Clicking a row opens the modal: bars on top summing to the platform total, category chips filter the buyer list, search works, pagination works.
- Direct and Klaviyo rows also open the modal.
- Switching the date filter re-scopes both popover and modal.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx src/app/admin/component/overview/DashboardOverview.tsx
git commit -m "feat(admin): Advertising card row click modal + hover source-breakdown popover"
```

---

## Task 8: Norm mirror (CLAUDE §10 lockstep)

**Files:**
- Modify: `src/lib/internal-norm/schemas/dashboard.ts`
- Modify: `src/lib/internal-norm/classification.ts`
- Create: `src/app/api/internal/norm/v1/dashboard/revenue-details/by-platform/route.ts`
- Regenerate: `src/generated/normToolsManifest.json`
- Modify: `docs/internal-norm/norm-context.md`

- [ ] **Step 1: Add the Zod schema**

Append to `src/lib/internal-norm/schemas/dashboard.ts` (after `NormRevenueDetailsSchema`, which defines `NormRevenueDetailsUserRowSchema` used here):

```ts
// ─── dashboard.revenue-details.by-platform ───────────────────────────────────
// Per-platform acquisition revenue split by source category + PII-safe buyer list.

const NormAcquisitionCategorySchema = z.enum([
  "membership-purchase",
  "one-time-purchase",
  "additional-one-time",
  "mini-draw",
  "upsell",
]);

const NormPlatformByCategorySchema = z.object({
  category: NormAcquisitionCategorySchema,
  revenue: z.number().describe("AUD; acquisition revenue for this source on this platform"),
  purchaseCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
});

export const NormPlatformRevenueBreakdownSchema = z.object({
  platform: z
    .string()
    .describe("convertingPlatform key (meta, tiktok, snapchat, klaviyo_email, klaviyo_sms, google, direct, other)"),
  byCategory: z
    .array(NormPlatformByCategorySchema)
    .describe("The 5 acquisition source buckets, zero-filled; sums to the platform's acquisition revenue"),
  totalRevenue: z.number().describe("AUD; list-scoped (filtered category, or all when none)"),
  totalPurchases: z.number().int().nonnegative(),
  totalUsers: z.number().int().nonnegative(),
  users: z.array(NormRevenueDetailsUserRowSchema),
  pagination: NormRevenueDetailsSchema.shape.pagination,
});
```

- [ ] **Step 2: Add the registry entry**

In `src/lib/internal-norm/classification.ts`: add `NormPlatformRevenueBreakdownSchema` to the import from `./schemas/dashboard`, then add this entry right after `"dashboard.revenue-details"`:

```ts
  "dashboard.revenue-details.by-platform": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/dashboard/revenue-details/by-platform",
    method: "GET",
    summary:
      "One platform's acquisition revenue split by source category (membership new / one-time / mini-draw / upsell) + PII-safe buyer list (firstName + opaque userId)",
    responseSchema: NormPlatformRevenueBreakdownSchema,
  },
```

- [ ] **Step 3: Create the Norm route**

```ts
import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPlatformRevenueBreakdownSchema } from "@/lib/internal-norm/schemas/dashboard";
import { resolveRevenueDetailsRange, type RevenueDetailsDateRange } from "@/services/admin/dashboardSlices";
import {
  getPlatformRevenueBreakdown,
  type AcquisitionCategory,
} from "@/services/admin/platformRevenueBreakdown";
import { type AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

const QuerySchema = z.object({
  platform: z.enum(["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "google", "direct", "other"]),
  category: z
    .enum(["membership-purchase", "one-time-purchase", "additional-one-time", "mini-draw", "upsell"])
    .optional(),
  dateRange: z.enum(["today", "yesterday", "all-time", "custom", "current-draw", "last-draw"]).default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  summaryOnly: z.coerce.boolean().default(false),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "dashboard.revenue-details.by-platform",
    requiredPermission: "overview.view",
    responseSchema: NormPlatformRevenueBreakdownSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const rangeResult = resolveRevenueDetailsRange({
      dateRange: parsed.data.dateRange as RevenueDetailsDateRange,
      startDateParam: parsed.data.startDate ?? null,
      endDateParam: parsed.data.endDate ?? null,
    });
    if (!rangeResult.ok) return ctx.error(rangeResult.status, "bad_query", rangeResult.error);

    const data = await getPlatformRevenueBreakdown({
      platform: parsed.data.platform as AttributedPlatformKey,
      startDate: rangeResult.value.startDate,
      endDate: rangeResult.value.endDate,
      category: parsed.data.category as AcquisitionCategory | undefined,
      page: parsed.data.page,
      limit: parsed.data.limit,
      summaryOnly: parsed.data.summaryOnly,
    });

    return ctx.ok({
      platform: data.platform,
      byCategory: data.byCategory,
      totalRevenue: data.totalRevenue,
      totalPurchases: data.totalPurchases,
      totalUsers: data.totalUsers,
      // PII-safe projection: firstName + opaque userId only.
      users: data.users.map((u) => ({
        userId: u.userId,
        firstName: u.userInfo.firstName || "Unknown",
        purchases: u.purchases.map((p) => ({
          paymentEventId: p.paymentEventId,
          timestamp: p.timestamp,
          amount: p.amount,
          packageId: p.packageId ?? null,
          packageName: p.packageName ?? null,
          billingReason: p.billingReason ?? null,
        })),
        totalContributed: u.totalContributed,
        purchaseCount: u.purchaseCount,
      })),
      pagination: data.pagination,
    });
  },
);
```

- [ ] **Step 4: Regenerate the manifest**

Run: `npm run build:norm-manifest`
Expected: `src/generated/normToolsManifest.json` updated to include `dashboard.revenue-details.by-platform`.

- [ ] **Step 5: Update the Norm context brief**

In `docs/internal-norm/norm-context.md`, add a line for the new tool in the dashboard tools section (mirror the existing `dashboard.revenue-details` entry's wording), e.g.:

```md
- `dashboard.revenue-details.by-platform` — one platform's acquisition revenue split by source category (membership new / one-time first / one-time add'l / mini draws / upsells) plus a PII-safe buyer list. Use this to answer "what is <platform>'s revenue made of"; renewals are excluded (acquisition-only).
```

- [ ] **Step 6: Verify Norm end-to-end**

Run: `npm run type-check` → no errors.
Run: `npm run norm:smoke` → passes (catches any schema↔output drift, which would be a runtime 500).
Run: `npm run lint` → clean.

- [ ] **Step 7: Commit** (only if authorized)

```bash
git add src/lib/internal-norm/schemas/dashboard.ts src/lib/internal-norm/classification.ts "src/app/api/internal/norm/v1/dashboard/revenue-details/by-platform/route.ts" src/generated/normToolsManifest.json docs/internal-norm/norm-context.md
git commit -m "feat(internal-norm): mirror revenue-details/by-platform read for OpenClaw"
```

---

## Task 9: Docs + final verification

**Files:**
- Modify: `docs/admin/*` (the doc-sync hook requires it for `src/app/admin/**` + `src/app/api/admin/**` + `src/services/admin/**` changes)

- [ ] **Step 1: Update admin docs**

In the relevant `docs/admin/` files, document:
- `docs/admin/api.md` (or equivalent) — the new `GET /api/admin/dashboard/revenue-details/by-platform` read (params: `platform`, `category?`, `dateRange`, `startDate?`, `endDate?`, `page`, `limit`, `summaryOnly`).
- `docs/admin/backend.md` — `getPlatformRevenueBreakdown` (acquisition-only, per `convertingPlatform`, null→direct, whole-row refund netting; reconciles to the card's snapshot for settled ranges, may differ for the in-progress day).
- `docs/admin/frontend.md` — the Advertising card hover popover + `PlatformRevenueModal` (bars + category-filtered buyer list).

- [ ] **Step 2: Full verification sweep**

Run each and confirm clean:
```bash
npm run type-check
npm run lint
npm run test:platform-revenue-breakdown
npm run test:advertising-card-model
npm run norm:smoke
```
Expected: all pass.

- [ ] **Step 3: Resolve any Stop-hook doc/business blocks**

If the doc-sync Stop hook reports `STALE DOCS` for a domain you touched, update that domain's `docs/<domain>/`. This feature flips **no** business-level fact (it's an internal admin analytics drill-down), so README.md / BUSINESS.md should not need changes; if the hook raises `STALE BUSINESS DOCS` on a trigger glob, make a one-line clarifying touch to the relevant BUSINESS.md section to clear it (per CLAUDE §5).

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add docs/admin
git commit -m "docs(admin): document platform revenue drill-down read + modal"
```

---

## Self-review notes (author)

- **Spec coverage:** hover popover (Task 7), click modal with bars + category filter (Task 6/7), all rows incl. Direct/Klaviyo (Task 5 `platformKey` on every row incl. direct; Task 7 row handlers on all rows), renewals excluded (Task 1 classifier + Task 2 `$or` query), reconciliation (Task 1 sum test + Task 7 manual), Norm mirror (Task 8), docs (Task 9). All spec sections map to a task.
- **Type consistency:** `AcquisitionCategory` (5 values) is defined once in `platformRevenueBreakdown.ts` and re-stated structurally in the hook types + `ACQUISITION_CATEGORY_META` + the two Zod enums — all five values match across all sites. `platformKey: AttributedPlatformKey` flows row VM → `onRowClick` → modal `platform` → hook → route → service. `PlatformRevenueBreakdownData` fields match between service, hook type, admin route response, and the Norm projection.
- **Two file additions beyond the original spec Files table** were identified during planning and are intentional: `DataTable.tsx` (optional hover handlers — backward-compatible) and `advertisingCardModel.ts` (row `platformKey` + shared `ACQUISITION_CATEGORY_META`/`moneyExact` to avoid duplication between card and modal).
