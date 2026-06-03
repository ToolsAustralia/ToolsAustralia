# Part B — Per-platform hourly breakdown in the analytics tabs (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.
> **No-auto-commit:** commit per-phase under the user's standing authorization; else stage + ask.

**Goal:** Every ad-platform tab shows a **server-side hour-of-day revenue** breakdown on the accurate `convertingPlatform` basis. Facebook's existing hourly section is retrofitted to that basis (keeping its spend/ROAS columns and its separate Meta-reported insights table untouched). TikTok + Snapchat get a real hourly section (revenue + conversions) replacing their empty shells.

**Architecture:** One source of truth for hourly revenue = SHARED-1 (`aggregateRevenueByHourAndPlatform`). The FB `hourly-insights` route swaps its revenue source from the old `utm_source`-based `aggregateRevenueAndCountByHourOfDay` to SHARED-1's `meta` series (and we delete the now-dead old method — it is the exact utm-vs-platform divergence the master spec's invariant #1 forbids). TikTok/Snapchat consume the `/api/admin/analytics/hourly-revenue` endpoint via a new `useHourlyRevenue` hook + a shared `PlatformHourlyRevenueSection`.

**Scope guard (user instruction):** Do **not** change the FB tab's **Meta-API-reported** revenue/ROAS/conversions table (`useFacebookAdsInsights` → `/api/admin/facebook-ads/insights`) — it stays so Meta pixel/CAPI can be compared against server truth. Only the **hourly** revenue basis changes.

---

## Task 1: Retrofit FB hourly to the server-side (convertingPlatform) basis

**Files:**
- Modify: `src/app/api/admin/facebook-ads/hourly-insights/route.ts`
- Modify: `src/repositories/PaymentEventRepository.ts` (remove dead `aggregateRevenueAndCountByHourOfDay`)
- Modify: `src/services/admin/dashboard-stats/revenueAggregator.ts` (update the comment that names the removed method)
- Modify: `docs/admin/backend.md`, `docs/admin/models.md`, `docs/mongodb/architecture.md` (drop/redirect references to the removed method)

- [ ] **Step 1: Swap the revenue source in `hourly-insights/route.ts`**

In `handleHourlyInsights`, replace the inclusive AEST end-bound + the `aggregateRevenueAndCountByHourOfDay(... { utmSource })` call with SHARED-1 on an **exclusive** `$lt` next-midnight bound, taking the `meta` series.

Replace this block (the AEST bounds, ~lines 114-124):

```ts
    const startYear = parseInt(validatedQuery.startDate.slice(0, 4), 10);
    const startMonth = parseInt(validatedQuery.startDate.slice(5, 7), 10);
    const startDay = parseInt(validatedQuery.startDate.slice(8, 10), 10);
    const startOfRangeAEST = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);

    const endYear = parseInt(validatedQuery.endDate.slice(0, 4), 10);
    const endMonth = parseInt(validatedQuery.endDate.slice(5, 7), 10);
    const endDay = parseInt(validatedQuery.endDate.slice(8, 10), 10);
    const endOfRangeAEST = createAESTDateAsUTC(endYear, endMonth, endDay, 23, 59);
    endOfRangeAEST.setUTCSeconds(59, 999);
```

with:

```ts
    const startYear = parseInt(validatedQuery.startDate.slice(0, 4), 10);
    const startMonth = parseInt(validatedQuery.startDate.slice(5, 7), 10);
    const startDay = parseInt(validatedQuery.startDate.slice(8, 10), 10);
    const startOfRangeAEST = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);

    const endYear = parseInt(validatedQuery.endDate.slice(0, 4), 10);
    const endMonth = parseInt(validatedQuery.endDate.slice(5, 7), 10);
    const endDay = parseInt(validatedQuery.endDate.slice(8, 10), 10);
    // EXCLUSIVE next-midnight-AEST (matches the daily snapshot's $lt; reconciles with SHARED-1).
    // Roll the calendar day over via a UTC anchor — createAESTDateAsUTC builds from a string
    // and would reject a day-overflow like "2099-03-32".
    const endAnchor = new Date(Date.UTC(endYear, endMonth - 1, endDay, 12, 0, 0));
    endAnchor.setUTCDate(endAnchor.getUTCDate() + 1);
    const endOfRangeExclusiveAEST = createAESTDateAsUTC(
      endAnchor.getUTCFullYear(),
      endAnchor.getUTCMonth() + 1,
      endAnchor.getUTCDate(),
      0,
      0
    );
```

Replace the revenue aggregation call (~lines 165-171):

```ts
    const paymentEventRepo = new PaymentEventRepository();
    let dbHourlyData;
    try {
      dbHourlyData = await paymentEventRepo.aggregateRevenueAndCountByHourOfDay(startOfRangeAEST, endOfRangeAEST, {
        ...(validatedQuery.utmSource && { utmSource: validatedQuery.utmSource }),
      });
    } catch (error) {
```

with (revenue is now Meta-attributed via convertingPlatform, from SHARED-1):

```ts
    const paymentEventRepo = new PaymentEventRepository();
    let dbHourlyData;
    try {
      const byPlatform = await paymentEventRepo.aggregateRevenueByHourAndPlatform(
        startOfRangeAEST,
        endOfRangeExclusiveAEST
      );
      dbHourlyData = byPlatform.meta; // 24 buckets of { hour, revenue, conversions }
    } catch (error) {
```

Then drop the now-unused `utmSource` from the query schema + `parseAndValidate` (delete the `utmSource` lines in `hourlyInsightsQuerySchema` and the POST/GET parsing), since revenue is no longer utm-filtered. The merge loop and response are unchanged (it still reads `dbHourlyData[hour].revenue/conversions`).

- [ ] **Step 2: Remove the dead method** in `PaymentEventRepository.ts` — delete the entire `aggregateRevenueAndCountByHourOfDay(...)` method (and `formatHourLabel` is in the route, not here — leave route helpers). Confirm no other importer: `grep -rn "aggregateRevenueAndCountByHourOfDay" src` → only the (now-updated) route + this definition.

- [ ] **Step 3: Fix the stale reference** in `revenueAggregator.ts` — the comment at ~line 78 names `aggregateRevenueAndCountByHourOfDay` as the predicate twin. Update it to name `aggregateRevenueByHourAndPlatform` instead.

- [ ] **Step 4: type-check + lint** — `npm run type-check`; `npx eslint src/app/api/admin/facebook-ads/hourly-insights/route.ts src/repositories/PaymentEventRepository.ts src/services/admin/dashboard-stats/revenueAggregator.ts` → clean. (`createAESTDateAsUTC` is already imported in the route; if `PaymentEventRepository` import in the route is now only used for the new method, keep it.)

- [ ] **Step 5: Re-run the reconciliation test** — `npm run test:hourly-revenue` → still PASS (unaffected; proves the meta series the FB route now uses is correct).

---

## Task 2: `useHourlyRevenue` query hook

**Files:**
- Create: `src/hooks/queries/admin/useHourlyRevenue.ts`

- [ ] **Step 1: Create the hook** (mirrors `useHourlyInsights` conventions — staleTime 1m, refetch on focus + 2m interval, retry 2):

```ts
import { useQuery } from "@tanstack/react-query";

export type HourlyRevenuePlatform = "meta" | "tiktok" | "snapchat" | "klaviyo" | "all";

export interface HourlyRevenueBucket {
  hour: number;
  revenue: number;
  conversions: number;
}
export interface HourlyRevenueData {
  hourly: HourlyRevenueBucket[];
  totalRevenue: number;
  totalConversions: number;
  platform: HourlyRevenuePlatform;
  dateRange: { start: string; end: string };
}

/**
 * Hour-of-day (Australia/Sydney) server-side attributed revenue + conversions for one
 * platform (or "klaviyo" = email+sms, "all" = every channel). Source: SHARED-1
 * (GET /api/admin/analytics/hourly-revenue).
 */
export function useHourlyRevenue(params: {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  platform: HourlyRevenuePlatform;
  enabled?: boolean;
}) {
  const { startDate, endDate, platform, enabled = true } = params;
  return useQuery<HourlyRevenueData>({
    queryKey: ["admin", "analytics", "hourly-revenue", platform, startDate, endDate],
    enabled: enabled && !!startDate && !!endDate,
    queryFn: async (): Promise<HourlyRevenueData> => {
      if (!startDate || !endDate) throw new Error("startDate and endDate are required");
      const sp = new URLSearchParams({ startDate, endDate, platform });
      const res = await fetch(`/api/admin/analytics/hourly-revenue?${sp.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.details || `Failed to fetch hourly revenue: ${res.statusText}`);
      }
      const json = await res.json();
      if (!json.success || !json.data) throw new Error(json.error || "No data returned");
      return json.data as HourlyRevenueData;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 2 * 60 * 1000,
    retry: 2,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 30000),
  });
}
```

- [ ] **Step 2: type-check** → clean.

---

## Task 3: `PlatformHourlyRevenueSection` + wire TikTok / Snapchat tabs

**Files:**
- Create: `src/components/admin/PlatformHourlyRevenueSection.tsx`
- Modify: `src/components/admin/TikTokAdsManagement.tsx`
- Modify: `src/components/admin/SnapchatAdsManagement.tsx`

- [ ] **Step 1: Create the shared section.** A self-contained card: a date-range (reuse the admin date toolbar pattern is overkill here — default to "last 30 days" computed client-side, with the platform's hourly revenue + conversions as a 24-row `DataTable` plus header totals; a one-line "Ad spend & ROAS arrive when the <platform> Marketing-API sync ships" note). It owns its own date range (`useState`) so the empty-shell tabs need no toolbar plumbing.

```tsx
"use client";

import { useMemo, useState } from "react";
import { Card, SectionTitle, DataTable, type Column } from "@/components/admin/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useHourlyRevenue, type HourlyRevenueBucket } from "@/hooks/queries/admin/useHourlyRevenue";
import { Clock, TrendingUp, Target } from "lucide-react";

interface Row extends Record<string, unknown> {
  id: number;
  label: string;
  revenue: number;
  conversions: number;
}

const COLUMNS: Column[] = [
  { key: "label", label: "Hour (AEST)", align: "left", sortable: false },
  { key: "revenue", label: "Revenue", align: "right", sortable: false },
  { key: "conversions", label: "Conversions", align: "right", sortable: false },
];

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

// Last-30-days window as YYYY-MM-DD in local terms (the API re-interprets as AEST days).
function defaultRange(now: Date): { start: string; end: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  return { start: fmt(start), end: fmt(end) };
}

export default function PlatformHourlyRevenueSection({
  platform,
  platformLabel,
}: {
  platform: "tiktok" | "snapchat";
  platformLabel: string;
}) {
  const { fmtCompact } = useMetricsFormatting();
  const [range] = useState(() => defaultRange(new Date()));
  const { data, isLoading } = useHourlyRevenue({ platform, startDate: range.start, endDate: range.end });

  const rows: Row[] = useMemo(
    () =>
      (data?.hourly ?? Array.from({ length: 24 }, (_, h): HourlyRevenueBucket => ({ hour: h, revenue: 0, conversions: 0 }))).map(
        (b) => ({ id: b.hour, label: hourLabel(b.hour), revenue: b.revenue, conversions: b.conversions })
      ),
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Ad Spend" value="—" icon={Clock} />
        <MetricCard title="Attributed Revenue" value={data ? fmtCompact(data.totalRevenue) : "—"} icon={TrendingUp} color="emerald" loading={isLoading} />
        <MetricCard title="Conversions" value={data ? data.totalConversions.toLocaleString() : "—"} icon={Target} color="purple" loading={isLoading} />
        <MetricCard title="ROAS" value="—" icon={TrendingUp} color="indigo" />
      </div>

      <Card className="p-5">
        <SectionTitle
          title={`${platformLabel} — revenue by hour (server-side)`}
          subtitle={`Attributed acquisition revenue · last 30 days (AEST). Ad spend & ROAS arrive when the ${platformLabel} Marketing-API sync ships.`}
          icon={Clock}
        />
        <DataTable<Row> columns={COLUMNS} rows={rows} renderCell={(key, row) => {
          if (key === "label") return <span className="font-medium">{row.label}</span>;
          if (key === "revenue") return <span className="num font-semibold">{fmtCompact(row.revenue)}</span>;
          return <span className="num">{row.conversions.toLocaleString()}</span>;
        }} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire TikTok** — replace `TikTokAdsManagement.tsx` body with `<PlatformHourlyRevenueSection platform="tiktok" platformLabel="TikTok" />` (keep `"use client"`).

- [ ] **Step 3: Wire Snapchat** — same with `platform="snapchat" platformLabel="Snapchat"`.

- [ ] **Step 4: type-check + lint** the three files → clean. Verify `MetricCard` accepts a `loading` prop (it does — used by the overview cards); if a prop name differs, drop it.

---

## Task 4: Docs + verify + diff review + commit

- [ ] **Step 1: Docs** — update `docs/admin/frontend.md` (TikTok/Snapchat tabs now render `PlatformHourlyRevenueSection`; FB hourly is server-side `convertingPlatform`), `docs/admin/api.md` (hourly-insights revenue now from SHARED-1, `utmSource` param removed), and the `docs/mongodb`/`docs/admin` references to the removed method. `docs/client-state` if a hook doc lists query hooks (the new `useHourlyRevenue` lives in `src/hooks/queries/admin/` → client-state domain — add it).
- [ ] **Step 2: Final verify** — `npm run type-check` clean; `npm run test:hourly-revenue` PASS; eslint changed files clean.
- [ ] **Step 3: Fresh-eyes diff review** of the changed files.
- [ ] **Step 4: Commit** (per-phase) — e.g. backend retrofit + frontend tabs as one `feat(admin): per-platform hourly breakdown (FB server-side basis + TikTok/Snapchat tabs)`, with the plan doc committed alongside.

## Notes / gotchas

- **FB Meta-reported insights table is intentionally untouched** (user wants pixel/CAPI vs server comparison).
- The hourly-insights route now uses **exclusive `$lt`** bounds (fixes the prior 1ms `$lte` edge) and **convertingPlatform=meta** revenue — both align it with the daily snapshot + SHARED-1.
- TikTok/Snapchat show **revenue+conversions only**; spend/ROAS are "—" with a note until their Marketing-API sync (a separate future project) lands.
- `useHourlyRevenue` lives under `src/hooks/queries/admin/` → **client-state** domain for doc-sync (the route is **admin** domain; the repo method removal touches **mongodb**).
