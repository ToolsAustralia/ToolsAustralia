# Admin Overview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the admin Overview page (`/admin` → `overview`) to the Claude Design mockup faithfully, reusing all existing data hooks, fully responsive mobile → desktop.

**Architecture:** A new presentational UI kit (`src/components/admin/ui/`) ported pixel-faithfully from the mockup's hand-rolled SVG/Tailwind primitives, consumed by reworked section components in `src/app/admin/component/overview/` that keep the existing TanStack data hooks. Charts are hand-rolled SVG (not recharts) to match the mockup exactly.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v3 (`darkMode: "class"`), `AdminThemeContext`, `lucide-react`, TanStack Query. Inter/Poppins already loaded.

---

## Pre-flight notes (read once)

- **Spec:** `docs/superpowers/specs/2026-06-01-admin-overview-redesign-design.md` is the source of truth. The mockup source was extracted to `c:\tmp\design-extract\tools-australia\project\` (files `admin/primitives.jsx`, `admin/charts.jsx`, `admin/sections.jsx`, `admin/topbar.jsx`) — exact class strings used below are copied from there; if that temp dir is gone, the strings inline here are authoritative.
- **No test runner.** UI is verified with `npm run type-check`, `npm run lint`, and a manual visual pass (`npm run dev` → open `http://localhost:3000/admin`, toggle theme + resize). Only `fmtCompact` (pure fn) gets a real `tsx` test.
- **Commits:** every "Commit" step is gated on the user having authorized commits this session (repo rule #1). If not authorized, pause and ask "Want me to commit this?" before running `git`.
- **doc-sync Stop hook:** any edit under `src/` requires updating the matching `docs/<domain>/` in the SAME task or the Stop hook blocks. Domains touched: `docs/shared-ui/` (tailwind config, globals.css, `src/components/admin/ui/**`), `docs/metrics-analytics/` (formatters), `docs/admin/` (everything under `src/app/admin/**` and `src/components/admin/**`). Doc updates are explicit tasks in Phases 1 and 5.
- **Worktree:** work happens in the existing worktree `c:\Codes\ToolsAustralia\.worktrees\admin-dashboard-revamp` (current dir). Do not create a new one.
- **Icons:** use `lucide-react`. Mapping used throughout: `DollarSign, TrendingUp, BarChart3, Target, Users, UserCheck, UserX, RefreshCw, Crown, Megaphone, Calendar, Check, ChevronDown, ChevronUp, ChevronRight, ArrowUp, ArrowDown, ArrowRight, Activity, Trophy, Zap, Download, LineChart` etc.

---

## File structure

**Create (UI kit — presentational, no hooks/API):**
- `src/components/admin/ui/Card.tsx` — `Card`, `SectionTitle`
- `src/components/admin/ui/Badge.tsx` — `Badge`, `TrendPill`
- `src/components/admin/ui/MetricCard.tsx` — KPI tile + `TONES`
- `src/components/admin/ui/Popover.tsx` — portal-to-body anchored popover
- `src/components/admin/ui/Sparkline.tsx`
- `src/components/admin/ui/BarList.tsx`
- `src/components/admin/ui/Donut.tsx`
- `src/components/admin/ui/RevenueAreaChart.tsx`
- `src/components/admin/ui/DataTable.tsx`
- `src/components/admin/ui/StatusDot.tsx`
- `src/components/admin/ui/index.ts` — barrel
- `src/components/admin/overview/DateRangeDropdown.tsx` — new date control

**Create (overview sections):**
- `src/app/admin/component/overview/sections/KpiGrid.tsx`
- `src/app/admin/component/overview/sections/RevenueChartCard.tsx`
- `src/app/admin/component/overview/sections/MembershipCard.tsx`
- `src/app/admin/component/overview/sections/RevenueBreakdownCard.tsx`
- `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx`
- `src/app/admin/component/overview/sections/PrizePerformanceCard.tsx`
- `src/app/admin/component/overview/sections/TopDrawsCard.tsx`
- `src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx`
- `src/app/admin/component/overview/sections/ActivityCard.tsx`
- `src/app/admin/component/overview/sections/QuickActionsCard.tsx`

**Modify:**
- `tailwind.config.ts` — `display` font alias + `2xs` size
- `src/app/globals.css` — `.lift`/`.lift-lg`/`.fade-up`/`.num`
- `src/utils/metrics/formatters.ts` + `src/hooks/useMetricsFormatting.ts` — `fmtCompact`
- `src/app/admin/component/overview/DashboardOverview.tsx` — new row layout
- `src/app/admin/component/overview/OverviewToolbar.tsx` — use `DateRangeDropdown`
- `package.json` — `test:fmt-compact` script

**Delete (Phase 5, confirmed orphan-dead):**
- `src/app/admin/component/MembershipStats.tsx`, `AdminStatsCard.tsx`, `RecentOrders.tsx`, `TopProducts.tsx`, `index.ts` (dead barrel)
- `src/components/admin/RevenueOverview.tsx` (replaced)
- old `KPIMetricsGrid.tsx`, `RevenueBreakdownSection.tsx`, `MembershipBreakdownSection.tsx`, `AdvertisingBreakdownSection.tsx`, `RenewalsDashboardSection.tsx`, `UpcomingRenewalsSection.tsx`, `MembershipRenewalPeriodStats.tsx`, `RecentActivityFeed.tsx`, `QuickActionsPanel.tsx` (replaced by `sections/*`) — **only after** their replacements render and `UsersBreakdownSection.tsx` is verified independent.

---

## Phase 1 — Foundations (tokens, CSS, formatter, UI kit)

### Task 1: Tailwind tokens (`font-display`, `2xs`)

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Read the current config**

Run: open `tailwind.config.ts`, find `theme.extend.fontFamily` (the `sans`/`poppins` keys ~line 112) and `theme.extend.fontSize` (add if absent).

- [ ] **Step 2: Add the `display` alias and `2xs` size**

In `theme.extend.fontFamily` add:
```ts
display: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
```
In `theme.extend.fontSize` (create the key if it doesn't exist) add:
```ts
"2xs": ["0.6875rem", { lineHeight: "0.95rem" }],
```

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: no new errors. (`brand-tier` and `red-600` already exist — do not re-add.)

- [ ] **Step 4: Update doc + commit (gated)**

Append a line to `docs/shared-ui/` (the tokens/overview doc) noting the new `font-display` alias (Poppins) and `text-2xs` size for admin.
Commit only if authorized:
```bash
git add tailwind.config.ts docs/shared-ui
git commit -m "feat(admin): add font-display alias and 2xs size for overview redesign"
```

### Task 2: Global CSS utilities (`.lift`, `.lift-lg`, `.fade-up`, `.num`)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append the utilities**

Add near the existing custom utilities (plain CSS is fine in Tailwind v3 globals):
```css
.num { font-variant-numeric: tabular-nums; }

.lift { box-shadow: 0 1px 0 rgba(0,0,0,0.02), 0 10px 28px -18px rgba(0,0,0,0.22); }
.dark .lift { box-shadow: 0 1px 0 rgba(255,255,255,0.03), 0 16px 40px -22px rgba(0,0,0,0.8); }
.lift-lg { box-shadow: 0 2px 4px rgba(0,0,0,0.03), 0 20px 48px -24px rgba(0,0,0,0.28); }
.dark .lift-lg { box-shadow: 0 1px 0 rgba(255,255,255,0.04), 0 24px 56px -26px rgba(0,0,0,0.85); }

@keyframes adminFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.fade-up { animation: adminFadeUp .3s ease both; }
```
(Reuse the existing `.admin-scrollbar` utility for thin scrollbars — do NOT add `.frame-scroll`.)

- [ ] **Step 2: Verify build picks it up**

Run: `npm run type-check` (CSS isn't typed, but confirms no import breakage). A full visual check happens at the Phase 2 boundary.

- [ ] **Step 3: Commit (gated)**
```bash
git add src/app/globals.css docs/shared-ui
git commit -m "feat(admin): add lift/fade-up/num utilities for overview redesign"
```

### Task 3: `fmtCompact` formatter + test

**Files:**
- Modify: `src/utils/metrics/formatters.ts`
- Modify: `src/hooks/useMetricsFormatting.ts`
- Create: `src/utils/metrics/__tests__/fmtCompact.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/utils/metrics/__tests__/fmtCompact.test.ts`:
```ts
import assert from "node:assert";
import { fmtCompact } from "../formatters";

assert.equal(fmtCompact(0), "$0");
assert.equal(fmtCompact(820), "$820");
assert.equal(fmtCompact(214830), "$214.8k");
assert.equal(fmtCompact(4218600), "$4.22M");
assert.equal(fmtCompact(-1500), "-$1.5k");

console.log("fmtCompact: all assertions passed");
```

- [ ] **Step 2: Wire the npm script + run to verify it fails**

In `package.json` `scripts` add:
```json
"test:fmt-compact": "tsx src/utils/metrics/__tests__/fmtCompact.test.ts"
```
Run: `npm run test:fmt-compact`
Expected: FAIL (`fmtCompact` is not exported).

- [ ] **Step 3: Implement `fmtCompact`**

In `src/utils/metrics/formatters.ts` add:
```ts
/** Compact AUD money for chart axes/totals, e.g. $4.22M, $214.8k, $820. */
export function fmtCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:fmt-compact`
Expected: `fmtCompact: all assertions passed`.

- [ ] **Step 5: Expose via the hook**

In `src/hooks/useMetricsFormatting.ts` add `fmtCompact` to the imports and the returned object (mirror how `formatCurrency`/`formatNumber` are returned).

- [ ] **Step 6: Verify + doc + commit (gated)**

Run: `npm run type-check` → no errors.
Add a line to `docs/metrics-analytics/` noting `fmtCompact`.
```bash
git add src/utils/metrics/formatters.ts src/utils/metrics/__tests__/fmtCompact.test.ts src/hooks/useMetricsFormatting.ts package.json docs/metrics-analytics
git commit -m "feat(metrics): add fmtCompact compact-currency formatter + test"
```

### Task 4: `Card` + `SectionTitle`

**Files:**
- Create: `src/components/admin/ui/Card.tsx`

- [ ] **Step 1: Implement**
```tsx
import type { ElementType, ReactNode } from "react";

export function Card({
  children, className = "", as: As = "div", ...rest
}: { children: ReactNode; className?: string; as?: ElementType } & Record<string, unknown>) {
  return (
    <As className={`rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({
  title, subtitle, icon: Icon, right,
}: { title: string; subtitle?: string; icon?: ElementType; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && (
          <div className="shrink-0 w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center">
            <Icon className="w-4 h-4" strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-display font-bold text-[15px] sm:text-base text-neutral-900 dark:text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check` → no errors.

### Task 5: `Badge` + `TrendPill`

**Files:**
- Create: `src/components/admin/ui/Badge.tsx`

- [ ] **Step 1: Implement**
```tsx
import type { ReactNode } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

const TONES = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
} as const;

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}

/** Hidden when value == null (e.g. all-time). invert=true → a drop is "good" (cancellations). */
export function TrendPill({ value, invert = false }: { value?: number | null; invert?: boolean }) {
  if (value == null) return null;
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-bold num ${
      good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
           : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"}`}>
      {up ? <ArrowUp className="w-3 h-3" strokeWidth={2.5} /> : <ArrowDown className="w-3 h-3" strokeWidth={2.5} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check` → no errors.

### Task 6: `Popover` (portal to body, re-anchor on scroll/resize)

**Files:**
- Create: `src/components/admin/ui/Popover.tsx`

- [ ] **Step 1: Implement**
```tsx
"use client";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function Popover({
  open, onClose, anchorRef, children, align = "end", width = 280,
}: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode; align?: "start" | "end"; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      let left = align === "end" ? a.right - width : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setPos({ top: a.bottom + 8, left });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, align, width, anchorRef, onClose]);

  if (!open || !pos) return null;
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, width }}
      className="z-[80] rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 lift-lg fade-up overflow-hidden">
      {children}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check` → no errors.

### Task 7: `Sparkline`

**Files:**
- Create: `src/components/admin/ui/Sparkline.tsx`

- [ ] **Step 1: Implement** (port of `primitives.jsx:55`)
```tsx
import { useId } from "react";

export function Sparkline({ data, color = "#ee0000", w = 80, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 4) - 2] as const);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L ${w} ${h} L 0 ${h} Z`;
  const gid = useId();
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.22" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
    </svg>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 8: `MetricCard` (+ TONES)

**Files:**
- Create: `src/components/admin/ui/MetricCard.tsx`

- [ ] **Step 1: Implement** (port of `primitives.jsx:76-113`)
```tsx
import type { ElementType } from "react";
import { ChevronRight } from "lucide-react";
import { TrendPill } from "./Badge";

export const TONES = {
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
} as const;

export type Tone = keyof typeof TONES;

export function MetricCard({
  title, value, sub, icon: Icon, tone = "red", trend, invert = false, onClick, active = false,
}: {
  title: string; value: string; sub?: string; icon: ElementType; tone?: Tone;
  trend?: number | null; invert?: boolean; onClick?: () => void; active?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`group relative text-left w-full rounded-2xl border bg-white dark:bg-neutral-900 transition-all p-4 sm:p-[18px] ${
        active ? "border-neutral-900 dark:border-white ring-1 ring-neutral-900 dark:ring-white lift"
               : "border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:lift"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
        </div>
        {trend !== undefined && <TrendPill value={trend} invert={invert} />}
      </div>
      <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 truncate">{title}</p>
      <div className="mt-1">
        <p className="font-display font-extrabold text-2xl sm:text-[27px] leading-none text-neutral-900 dark:text-white num whitespace-nowrap">{value}</p>
      </div>
      {sub && <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-2 truncate">{sub}</p>}
      {onClick && <div className="absolute right-3 bottom-3 text-neutral-300 dark:text-neutral-600 opacity-0 group-hover:opacity-100 transition"><ChevronRight className="w-4 h-4" strokeWidth={2.5} /></div>}
    </button>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 9: `BarList`

**Files:**
- Create: `src/components/admin/ui/BarList.tsx`

- [ ] **Step 1: Implement** (port of `primitives.jsx:211`)
```tsx
export type BarItem = { id: string; label: string; value: number; color: string; count?: number; unit?: string };

export function BarList({ items, fmt = (v: number) => String(v), fmtCount = (n: number) => n.toLocaleString("en-AU") }: {
  items: BarItem[]; fmt?: (v: number) => string; fmtCount?: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.id} className="group">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">{it.label}</span>
            <span className="text-xs font-bold text-neutral-900 dark:text-white num shrink-0">{fmt(it.value)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500 group-hover:brightness-110" style={{ width: (it.value / max) * 100 + "%", background: it.color }} />
            </div>
            {it.count != null && <span className="text-2xs text-neutral-400 dark:text-neutral-500 num w-16 text-right shrink-0">{fmtCount(it.count)} {it.unit?.slice(0, 4)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 10: `Donut` (center hover-swap)

**Files:**
- Create: `src/components/admin/ui/Donut.tsx`

- [ ] **Step 1: Implement** (port of `primitives.jsx:172`)
```tsx
import { useState } from "react";

export type DonutSegment = { id: string; label: string; color: string; value: number; count?: number };

export function Donut({
  segments, size = 168, thickness = 22, centerLabel, centerSub,
}: { segments: DonutSegment[]; size?: number; thickness?: number; centerLabel: string; centerSub?: string }) {
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const [hi, setHi] = useState<number | null>(null);
  let acc = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" className="text-neutral-100 dark:text-neutral-800" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const frac = s.value / total, dash = frac * C;
          const el = (
            <circle key={s.id} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
              strokeWidth={hi === i ? thickness + 4 : thickness}
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C}
              strokeLinecap="butt" className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
              style={{ opacity: hi == null || hi === i ? 1 : 0.4 }} />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-display font-extrabold text-2xl text-neutral-900 dark:text-white num leading-none">
          {hi != null ? (segments[hi].count ?? segments[hi].value).toLocaleString("en-AU") : centerLabel}
        </span>
        <span className="text-2xs text-neutral-500 dark:text-neutral-400 mt-1 font-semibold">{hi != null ? segments[hi].label : centerSub}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 11: `RevenueAreaChart`

**Files:**
- Create: `src/components/admin/ui/RevenueAreaChart.tsx`

- [ ] **Step 1: Implement** (port of `charts.jsx:1-96`, incl. `smoothPath`)
```tsx
"use client";
import { useId, useRef, useState } from "react";

function smoothPath(pts: readonly (readonly [number, number])[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function RevenueAreaChart({
  data, ticks, axisLabel, accent = "#ee0000", height = 230, valueFmt = (v: number) => String(v),
}: { data: number[]; ticks: string[]; axisLabel: string; accent?: string; height?: number; valueFmt?: (v: number) => string }) {
  const n = data.length;
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gid = useId();

  const vMax = Math.max(...data), vMin = Math.min(...data);
  const pad = (vMax - vMin) * 0.18 || vMax * 0.1 || 1;
  const top = vMax + pad, bot = Math.max(0, vMin - pad), rng = top - bot || 1;
  const W = 720, H = 230, PADX = 6, PADT = 12, PADB = 6;
  const innerW = W - PADX * 2, innerH = H - PADT - PADB;
  const xOf = (i: number) => PADX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => PADT + innerH - ((v - bot) / rng) * innerH;
  const pts = data.map((v, i) => [xOf(i), yOf(v)] as const);
  const line = smoothPath(pts);
  const area = line ? `${line} L ${xOf(n - 1).toFixed(1)} ${H - PADB} L ${PADX} ${H - PADB} Z` : "";
  const gridVals = [1, 0.66, 0.33, 0].map((f) => bot + f * rng);
  const tickFor = (i: number) => ticks[Math.round((i / (n - 1)) * (ticks.length - 1))];

  const onMove = (ev: React.MouseEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const frac = Math.max(0, Math.min(1, (x - PADX) / innerW));
    setHover(Math.round(frac * (n - 1)));
  };

  return (
    <div>
      <div className="flex" style={{ height }}>
        <div className="relative w-12 shrink-0">
          {gridVals.map((gv, i) => (
            <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-neutral-400 dark:text-neutral-500 num" style={{ top: `${(yOf(gv) / H) * 100}%` }}>{valueFmt(Math.round(gv))}</span>
          ))}
        </div>
        <div ref={wrapRef} className="relative flex-1 min-w-0 select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
            <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.26" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient></defs>
            {gridVals.map((gv, i) => (
              <line key={i} x1={PADX} x2={W - PADX} y1={yOf(gv)} y2={yOf(gv)} stroke="currentColor" className="text-neutral-100 dark:text-neutral-800/70" strokeWidth="1" />
            ))}
            {area && <path d={area} fill={`url(#${gid})`} />}
            {line && <path d={line} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
            {hover != null && pts[hover] && (
              <g>
                <line x1={pts[hover][0]} x2={pts[hover][0]} y1={PADT} y2={H - PADB} stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
                <circle cx={pts[hover][0]} cy={pts[hover][1]} r="4.5" fill="white" stroke={accent} strokeWidth="2.5" />
              </g>
            )}
          </svg>
          {hover != null && pts[hover] && (
            <div className="absolute z-10 pointer-events-none -translate-x-1/2 -translate-y-full" style={{ left: `${(pts[hover][0] / W) * 100}%`, top: `${(pts[hover][1] / H) * 100}%` }}>
              <div className="px-2.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg whitespace-nowrap mb-2">
                <p className="font-display font-bold text-xs num leading-none">{valueFmt(data[hover])}</p>
                <p className="text-[9px] opacity-70 mt-0.5">{axisLabel} {tickFor(hover)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between mt-2" style={{ paddingLeft: "3rem" }}>
        {ticks.map((t, i) => <span key={i} className="text-[10px] text-neutral-400 dark:text-neutral-500 num">{t}</span>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 12: `DataTable` (sortable)

**Files:**
- Create: `src/components/admin/ui/DataTable.tsx`

- [ ] **Step 1: Implement** (port of `charts.jsx:99`)
```tsx
"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export type Column = { key: string; label: string; align?: "left" | "right"; sortable?: boolean };

export function DataTable<T extends Record<string, unknown> & { id?: string | number }>({
  columns, rows, renderCell,
}: { columns: Column[]; rows: T[]; renderCell?: (key: string, row: T) => ReactNode }) {
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
  }, [rows, sort]);
  const toggle = (k: string) => setSort((p) => (p.key === k ? { key: k, dir: (-p.dir) as 1 | -1 } : { key: k, dir: 1 }));
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            {columns.map((c) => (
              <th key={c.key} onClick={() => c.sortable !== false && toggle(c.key)}
                className={`py-2 px-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 ${c.align === "right" ? "text-right" : "text-left"} ${c.sortable !== false ? "cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 select-none" : ""}`}>
                <span className="inline-flex items-center gap-1">{c.label}
                  {sort.key === c.key && (sort.dir === 1 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={row.id ?? ri} className="border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className={`py-2.5 px-2 ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {renderCell ? renderCell(c.key, row) : (row[c.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 13: `StatusDot` + barrel

**Files:**
- Create: `src/components/admin/ui/StatusDot.tsx`
- Create: `src/components/admin/ui/index.ts`

- [ ] **Step 1: StatusDot**
```tsx
const MAP = { success: "bg-emerald-500", warning: "bg-amber-500", error: "bg-red-500", info: "bg-blue-500" } as const;
export function StatusDot({ status }: { status: keyof typeof MAP }) {
  return <span className={`w-2.5 h-2.5 rounded-full ${MAP[status] ?? MAP.info} shrink-0 ring-4 ring-white dark:ring-neutral-900`} />;
}
```

- [ ] **Step 2: Barrel** — `src/components/admin/ui/index.ts`
```ts
export * from "./Card";
export * from "./Badge";
export * from "./MetricCard";
export * from "./Popover";
export * from "./Sparkline";
export * from "./BarList";
export * from "./Donut";
export * from "./RevenueAreaChart";
export * from "./DataTable";
export * from "./StatusDot";
```

- [ ] **Step 3: Verify** — `npm run type-check` → no errors; `npm run lint` → clean.

### Task 14: Phase 1 docs + commit (gated)

- [ ] **Step 1:** Add a "UI kit (`src/components/admin/ui/`)" subsection to `docs/shared-ui/` listing each primitive + its purpose.
- [ ] **Step 2: Verify** — `npm run type-check`, `npm run lint`.
- [ ] **Step 3: Commit (gated)**
```bash
git add src/components/admin/ui docs/shared-ui
git commit -m "feat(admin): add overview UI kit primitives (Card, MetricCard, Donut, charts, table)"
```

---

## Phase 2 — KPI grid + date dropdown

### Task 15: `DateRangeDropdown`

**Files:**
- Create: `src/components/admin/overview/DateRangeDropdown.tsx`

Reuses the existing `DateRange` type and the `OverviewToolbar` prop contract (`selectedRange`, `onRangeChange`, `onCustomClick`, `displayDate`). Ranges: Today / Yesterday / Current Draw / Last Draw / All Time / Custom (no "7d").

- [ ] **Step 1: Implement** (port of `topbar.jsx:4` dropdown, wired to the real contract)
```tsx
"use client";
import { useRef, useState } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { Popover } from "@/components/admin/ui";
import type { DateRange } from "@/components/admin/DateRangeToggle";

const RANGES: { id: DateRange; label: string; short: string }[] = [
  { id: "today", label: "Today", short: "Today" },
  { id: "yesterday", label: "Yesterday", short: "Yest." },
  { id: "current-draw", label: "Current Draw", short: "Current" },
  { id: "last-draw", label: "Last Draw", short: "Last" },
  { id: "all-time", label: "All Time", short: "All" },
];

export function DateRangeDropdown({
  selectedRange, onRangeChange, onCustomClick, displayDate, accent = "#ee0000",
}: {
  selectedRange: DateRange; onRangeChange: (r: DateRange) => void;
  onCustomClick?: () => void; displayDate?: string; accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const cur = RANGES.find((r) => r.id === selectedRange);
  const triggerLabel = selectedRange === "custom" ? (displayDate ?? "Custom") : (cur?.label ?? "Date range");
  const triggerShort = selectedRange === "custom" ? (displayDate ?? "Custom") : (cur?.short ?? "Range");
  return (
    <>
      <button ref={ref} onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition">
        <Calendar className="w-4 h-4" style={{ color: accent }} strokeWidth={2} />
        <span className="hidden sm:inline">{triggerLabel}</span>
        <span className="sm:hidden">{triggerShort}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} width={240} align="end">
        <div className="p-1.5">
          <p className="px-2.5 py-1.5 text-2xs font-bold uppercase tracking-wider text-neutral-400">Date range</p>
          {RANGES.map((r) => {
            const on = r.id === selectedRange;
            return (
              <button key={r.id} onClick={() => { onRangeChange(r.id); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition ${on ? "text-white" : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
                style={on ? { background: accent } : undefined}>
                {r.label}{on && <Check className="w-4 h-4" strokeWidth={2.5} />}
              </button>
            );
          })}
          <div className="mt-1 pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
            <button onClick={() => { (onCustomClick ?? (() => onRangeChange("custom")))(); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition ${selectedRange === "custom" ? "text-white" : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
              style={selectedRange === "custom" ? { background: accent } : undefined}>
              <Calendar className="w-4 h-4" strokeWidth={2} /> Custom range…
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
```

- [ ] **Step 2: Verify the `DateRange` export path** — confirm `DateRange` is exported from `src/components/admin/DateRangeToggle.tsx`; if it lives elsewhere, fix the import. Run `npm run type-check`.

### Task 16: Swap the dropdown into `OverviewToolbar`

**Files:**
- Modify: `src/app/admin/component/overview/OverviewToolbar.tsx`

- [ ] **Step 1:** Replace the inner `<DateRangeToggle .../>` render with `<DateRangeDropdown selectedRange={...} onRangeChange={...} onCustomClick={...} displayDate={...} />`, passing through the same props `OverviewToolbar` already receives. Keep both placements (`placement="page"` sticky + `placement="layout"` portal). Do NOT edit shared `DateRangeToggle.tsx`.
- [ ] **Step 2: Verify** — `npm run type-check`, `npm run lint`.
- [ ] **Step 3: Manual check** — `npm run dev` → `/admin`: open the dropdown desktop + mobile (resize < lg); confirm it opens above the sticky bar, switches ranges, "Custom range…" opens the existing modal, and the URL `?dateRange=` updates. Verify `current-draw`/`last-draw` load data.

### Task 17: `KpiGrid`

**Files:**
- Create: `src/app/admin/component/overview/sections/KpiGrid.tsx`

Consumes `useAdminDashboardStats(dateRange, start, end)` + `useMembershipByPackage(...)` (already called in `DashboardOverview`; pass results down as props). Renders two labeled groups; Revenue + Membership tiles are clickable → `Popover` with `Sparkline` + breakdown.

- [ ] **Step 1: Implement** — build `KpiCard` (wrapper with `Popover`) + `KpiGrid` using `MetricCard`, `Popover`, `Sparkline`, `TrendPill`. Tiles/sources per spec §7.1. Group label class: `text-2xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2.5`. Grids:
  - Revenue: `grid grid-cols-2 lg:grid-cols-4 gap-3` — Revenue (emerald, clickable), Membership Revenue (red, clickable), Ad Spend (blue), ROAS (green).
  - Users & Performance: `grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3` — Total Users (indigo), New Signups (blue), Conversion (violet), Cancellations (red, `invert`), Renewal Rate (emerald).
  Use whole-dollar `$${n.toLocaleString("en-AU")}` for money tiles; `toFixed(2)+"x"` for ROAS; `toFixed(1)+"%"` for Conversion. Each `KpiCard` holds its own `useRef` anchor + `open` state; `MetricCard active={open}`.
  For the popover breakdown: Revenue → top-4 of `stats.revenue.breakdown` (label/color/`fmtCompact(revenue)`); Membership → tiers from `membershipByPackage.packages` (name/`brand-tier` color/`activeRevenue`). Sparkline data: if no spark series exists in the hook, pass the last N points you have, else omit the sparkline panel (guard `spark?.length`).
- [ ] **Step 2: Verify** — `npm run type-check`.

> NOTE on sparkline data: the dashboard-stats hook does not return per-KPI spark arrays. Render the popover WITHOUT the sparkline panel if `spark` is absent (guard it). Do not fabricate a series. (Spec §7.1 / review GAPS.)

### Task 18: Render KpiGrid + date dropdown in DashboardOverview (partial layout)

**Files:**
- Modify: `src/app/admin/component/overview/DashboardOverview.tsx`

- [ ] **Step 1:** Change the page wrapper to `<div className="space-y-5 md:space-y-6">`. Render `<KpiGrid stats={dashboardStats} membership={membershipByPackage} />` at the top (replacing the old `<KPIMetricsGrid .../>` for now; leave the other old sections rendering below temporarily so the page still works).
- [ ] **Step 2: Verify** — `npm run type-check`, `npm run lint`.
- [ ] **Step 3: Manual check** — `/admin`: KPI tiles render in 2-up (mobile) / 4–5-up (desktop), trends correct (Cancellations green when down, hidden on All time), clicking Revenue/Membership opens a popover that doesn't clip on scroll. Toggle dark mode.
- [ ] **Step 4: Commit (gated)**
```bash
git add src/components/admin/overview src/app/admin/component/overview docs/admin
git commit -m "feat(admin): overview KPI grid + clean date dropdown"
```

---

## Phase 3 — Charts row (revenue area + membership donut)

### Task 19: `RevenueChartCard`

**Files:**
- Create: `src/app/admin/component/overview/sections/RevenueChartCard.tsx`

- [ ] **Step 1: Map dateRange → period + build series.** Use `useRevenueBreakdown(period, start, end)` where `period = dateRange === "all-time" ? "months" : "days"`. From `chartData[]` build `data = chartData.map(p => p.total)`, `ticks` = sampled `p.date` labels (≤7), `axisLabel = period === "months" ? "Month" : "Day"`.
- [ ] **Step 2: Render**
```tsx
<Card className="p-5">
  <SectionTitle title="Revenue overview" subtitle="Hover the line for exact daily figures" icon={LineChart}
    right={<Badge tone={trackingUp ? "success" : "danger"}>{trackingUp ? <ArrowUp className="w-3 h-3" strokeWidth={2.5}/> : <ArrowDown className="w-3 h-3" strokeWidth={2.5}/>}{trackingUp ? "Tracking up" : "Tracking down"}</Badge>} />
  <RevenueAreaChart data={data} ticks={ticks} axisLabel={axisLabel} accent="#ee0000" valueFmt={fmtCompact} />
</Card>
```
(`trackingUp` = last point ≥ first point.)
- [ ] **Step 3: Verify** — `npm run type-check`.

### Task 20: `MembershipCard` (donut)

**Files:**
- Create: `src/app/admin/component/overview/sections/MembershipCard.tsx`

- [ ] **Step 1: Build segments + legend.** From `membershipByPackage.packages`, build `segments = [{id, label: packageName, color: brandTier[id], value: activeCount, count: activeCount}]` where `brandTier` maps tradie→`#00c2ed`, foreman→`#ffd200`, boss→`#ee0000` (use the `brand-tier` Tailwind hexes; match by package slug/name). Price per row from `getPackageById(packageId).price` (import from `src/data/membershipPackages.ts`).
- [ ] **Step 2: Render** the `Card` with `SectionTitle` "Active memberships" / "Live distribution by tier" / `Crown`, the `Donut` (center = total active / "active"), the legend (`space-y-2.5`: color dot, name + `$price/mo`, count, `fmtCompact(activeRevenue)`), and the past-due/paused tiles:
```tsx
<div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-2.5">
    <p className="text-2xs font-semibold text-red-600/80 dark:text-red-400/80 uppercase tracking-wide">Past due</p>
    <p className="font-display font-bold text-lg text-red-700 dark:text-red-400 num">{summary.totalPastDueCount.toLocaleString("en-AU")}</p>
  </div>
  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-2.5">
    <p className="text-2xs font-semibold text-amber-600/80 dark:text-amber-500/80 uppercase tracking-wide">Paused</p>
    <p className="text-2xs font-medium text-amber-600/70 dark:text-amber-500/70 mt-1">Coming soon</p>
  </div>
</div>
```
- [ ] **Step 3: Verify** — `npm run type-check`.

### Task 21: Wire the charts row + remove RevenueOverview

**Files:**
- Modify: `src/app/admin/component/overview/DashboardOverview.tsx`
- Delete: `src/components/admin/RevenueOverview.tsx`

- [ ] **Step 1:** Insert the charts row:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
  <div className="lg:col-span-2 min-w-0"><RevenueChartCard dateRange={dateRange} startDate={customStartDate} endDate={customEndDate} /></div>
  <div className="lg:col-span-1 min-w-0"><MembershipCard data={membershipByPackage} /></div>
</div>
```
Remove the `<RevenueOverview/>` render and its import. Delete `src/components/admin/RevenueOverview.tsx`.
- [ ] **Step 2: Verify** — `npm run type-check`, `npm run lint` (no dangling import).
- [ ] **Step 3: Manual check** — chart: hover crosshair + tooltip, area fills, axis labels compact; resize narrow → chart shrinks (no overflow). Donut: hover swaps center label, segments dim, legend prices show, Past due live + Paused "Coming soon". Dark mode.
- [ ] **Step 4: Commit (gated)**
```bash
git add src/app/admin/component/overview src/components/admin docs/admin
git commit -m "feat(admin): overview revenue area chart + membership donut; remove legacy RevenueOverview"
```

---

## Phase 4 — Breakdown + advertising + prize performance

### Task 22: `RevenueBreakdownCard`

**Files:**
- Create: `src/app/admin/component/overview/sections/RevenueBreakdownCard.tsx`

- [ ] **Step 1:** From `stats.revenue.breakdown` (normalize each item like the old `RevenueBreakdownSection.getRevenueData`), build `items: BarItem[]` (6 entries; labels: "Membership New", "Membership Renewal", "One-Time First", "One-Time Add'l", "Mini Draws", "Upsells"; colors `#f97316 #eab308 #3b82f6 #6366f1 #a855f7 #ec4899`; `value=revenue`, `count=purchaseCount`, `unit` per source). Render `Card` + `SectionTitle` "Revenue breakdown" / `${fmtCompact(total)} across 6 sources` / `BarChart3`, then `<BarList items={items} fmt={fmtCompact} />`.
- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 23: `AdvertisingPlatformCard`

**Files:**
- Create: `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx`

- [ ] **Step 1:** Rows = `[{ platform: "Facebook Ads", spend: stats.facebookAds.spend, roas: stats.facebookAds.roas, comingSoon: false }, { platform: "TikTok Ads", comingSoon: true }, { platform: "Snapchat Ads", comingSoon: true }]`. Use `DataTable` cols Platform / Spend / ROAS. For `comingSoon` rows render a muted "Coming soon" in the Spend cell and `—` for ROAS. Header `right` = blended ROAS = FB ROAS. Swatch colors: FB `#1877f2`, TikTok `#000000`, Snapchat `#eab308`.
- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 24: `PrizePerformanceCard`

**Files:**
- Create: `src/app/admin/component/overview/sections/PrizePerformanceCard.tsx`

- [ ] **Step 1:** Port the data logic from the old `AdvertisingBreakdownSection.tsx` (`useSpendByUrlAnalytics(start, end)`, group/sum per brand Ryobi/Milwaukee/Dewalt/Makita, derive `roas = revenue/spend`). Render `Card` + `SectionTitle` "Prize performance" / "Spend & return by prize" / `TrendingUp`, then `DataTable` cols Prize / ROAS / Spend / Revenue / Conversions. ROAS cell: emerald if ≥3 else amber. Keep the row → `PrizePerformanceAdsModal` click if low-cost; otherwise omit the modal for now (note it as a follow-up).
- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 25: Wire row 3 + 3b

**Files:**
- Modify: `src/app/admin/component/overview/DashboardOverview.tsx`

- [ ] **Step 1:** Insert:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
  <RevenueBreakdownCard stats={dashboardStats} />
  <AdvertisingPlatformCard stats={dashboardStats} />
</div>
<PrizePerformanceCard dateRange={dateRange} startDate={customStartDate} endDate={customEndDate} />
```
- [ ] **Step 2: Verify** — `npm run type-check`, `npm run lint`.
- [ ] **Step 3: Manual check** — breakdown bars sized + compact totals; advertising shows FB live + 2 Coming-soon rows; prize table sorts; mobile: tables scroll horizontally inside the card (no full-page overflow). Dark mode.
- [ ] **Step 4: Commit (gated)**
```bash
git add src/app/admin/component/overview docs/admin
git commit -m "feat(admin): overview revenue breakdown + advertising (platform + prize performance)"
```

---

## Phase 5 — Draws/renewals, activity/quick-actions, cleanup, docs

### Task 26: `TopDrawsCard` (Coming soon)

**Files:**
- Create: `src/app/admin/component/overview/sections/TopDrawsCard.tsx`

- [ ] **Step 1:** `Card p-5 h-full` + `SectionTitle` "Top mini draws" / "By entries this period" / `Trophy`. Body = centered empty state filling the column:
```tsx
<div className="flex flex-col items-center justify-center text-center py-10 text-neutral-400 dark:text-neutral-500">
  <Trophy className="w-8 h-8 mb-3 opacity-60" strokeWidth={1.75} />
  <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">Top mini draws</p>
  <p className="text-2xs mt-1">Coming soon</p>
</div>
```
- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 27: `UpcomingRenewalsCard`

**Files:**
- Create: `src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx`

- [ ] **Step 1:** `useUpcomingRenewals(3, 1, 5)`. `Card p-5 h-full` + `SectionTitle` "Upcoming renewals" / `${formatCurrency(totalRevenue)} expected · next 3 days` / `RefreshCw`. List rows (`space-y-2`): tier-tinted avatar (initials from `customerName`, color from `brand-tier`), name + `tier · renewalDateFormatted`, `amountFormatted` right-aligned.
- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 28: `ActivityCard`

**Files:**
- Create: `src/app/admin/component/overview/sections/ActivityCard.tsx`

- [ ] **Step 1:** Port from old `RecentActivityFeed.tsx` (`useActivityLogInfinite(15)`, infinite scroll, mini-draw linkify, "View all" → `/admin/activity-log`). Restyle to the timeline: scroll region `max-h-[360px] overflow-y-auto admin-scrollbar pr-1`; each item = `StatusDot` (color from the emitted `status` field) + connector line + action + `user · time`. Do NOT branch on `type`.
- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 29: `QuickActionsCard`

**Files:**
- Create: `src/app/admin/component/overview/sections/QuickActionsCard.tsx`

- [ ] **Step 1:** Port from old `QuickActionsPanel.tsx`. Grid `grid grid-cols-2 sm:grid-cols-3 gap-2.5`. Keep wired actions (Create Major Draw → modal; Export Participants → export modal). Add Product + Send Broadcast → render with a muted "Coming soon" badge and `disabled`. Each button styled per spec §7.9 (`rounded-xl border`, tone icon chip).
- [ ] **Step 2: Verify** — `npm run type-check`.

### Task 30: Wire rows 4–6 + retire old sections

**Files:**
- Modify: `src/app/admin/component/overview/DashboardOverview.tsx`

- [ ] **Step 1:** Insert rows 4 & 5:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
  <div className="lg:col-span-2 min-w-0"><TopDrawsCard /></div>
  <div className="lg:col-span-1 min-w-0"><UpcomingRenewalsCard /></div>
</div>
<div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
  <div className="lg:col-span-2 min-w-0"><ActivityCard /></div>
  <div className="lg:col-span-1 min-w-0"><QuickActionsCard onRefreshStats={refetchStats} /></div>
</div>
```
- [ ] **Step 2:** Keep `UsersBreakdownSection` as the last row but wrapped collapsed-by-default (it isn't in the mockup; retained until the Users page exists). Remove the now-unused old section imports/renders: `KPIMetricsGrid`, `RevenueBreakdownSection`, `MembershipBreakdownSection`, `RenewalsDashboardSection`, `AdvertisingBreakdownSection`, `RecentActivityFeed`, `QuickActionsPanel`, `OverviewToolbar`'s old `DateRangeToggle` (already swapped).
- [ ] **Step 3: Verify** — `npm run type-check`, `npm run lint`.
- [ ] **Step 4: Manual check** — full page top-to-bottom, desktop + mobile + dark: all rows present, Top draws + Paused + ad rows show "Coming soon", activity scrolls, quick actions (2 live / 2 disabled), no horizontal page scroll, no empty gaps.

### Task 31: Delete dead code

**Files:**
- Delete: `src/app/admin/component/MembershipStats.tsx`, `AdminStatsCard.tsx`, `RecentOrders.tsx`, `TopProducts.tsx`, `index.ts`
- Delete: replaced overview files `KPIMetricsGrid.tsx`, `RevenueBreakdownSection.tsx`, `MembershipBreakdownSection.tsx`, `AdvertisingBreakdownSection.tsx`, `RenewalsDashboardSection.tsx`, `UpcomingRenewalsSection.tsx`, `MembershipRenewalPeriodStats.tsx`, `RecentActivityFeed.tsx`, `QuickActionsPanel.tsx`

- [ ] **Step 1:** Before deleting each file, `grep` the repo for its importers and confirm none remain (the kit/sections replaced them). Do NOT touch `src/app/(site)/my-account/components/RecentOrders.tsx`. Keep `DashboardSection.tsx` only if any remaining section still imports it; otherwise delete it too.
- [ ] **Step 2:** Delete the files.
- [ ] **Step 3: Verify** — `npm run type-check` (catches any missed import), `npm run lint`, `npm run build` (full compile).
- [ ] **Step 4: Manual check** — `/admin` still renders end-to-end.

### Task 32: Docs + final verification

**Files:**
- Modify: `docs/admin/` (overview frontend doc), `docs/shared-ui/`, `docs/metrics-analytics/`

- [ ] **Step 1:** Update `docs/admin/` overview/frontend doc: new component tree (`src/components/admin/ui/**` + `overview/sections/**`), the date dropdown, removed components, and the "Coming soon" items (Paused, Top draws, TikTok/Snapchat, Clicks/CPC). Confirm `docs/shared-ui/` (kit + tokens + utilities) and `docs/metrics-analytics/` (`fmtCompact`) are current.
- [ ] **Step 2:** Check README.md / BUSINESS.md — this is an internal admin reskin with no business-fact change, so no edits expected (confirm).
- [ ] **Step 3: Full verification**

Run: `npm run lint` → clean
Run: `npm run type-check` → no errors
Run: `npm run build` → succeeds
Run: `npm run test:fmt-compact` → passes
Manual: `/admin` desktop + mobile + light/dark, full page.

- [ ] **Step 4: Commit (gated)**
```bash
git add src/app/admin src/components/admin docs
git commit -m "feat(admin): complete overview redesign (sections, cleanup, docs)"
```

---

## Self-review (completed by plan author)

- **Spec coverage:** every spec §7 element has a task (KPIs T17; area chart T19; donut T20; breakdown T22; advertising-by-platform T23 + prize T24; top draws T26; renewals T27; activity T28; quick actions T29); date dropdown T15–16; tokens/CSS/formatter T1–3; cleanup T31; docs T32. Users-breakdown retention handled T30 §2.
- **Coming-soon items** (Paused, Top draws, TikTok/Snapchat, Add Product/Send Broadcast) each have explicit render code/instructions.
- **No placeholders:** all code steps include full code; verification commands are concrete (`npm run type-check`/`lint`/`build`, `test:fmt-compact`, manual `/admin`).
- **Type consistency:** kit exports (`Card`, `SectionTitle`, `MetricCard`, `TONES`/`Tone`, `Popover`, `Sparkline`, `BarList`/`BarItem`, `Donut`/`DonutSegment`, `RevenueAreaChart`, `DataTable`/`Column`, `StatusDot`) are referenced consistently in Phases 2–5. `DateRange` reused from `DateRangeToggle`.
- **Open risk to watch during execution:** `KpiCard` sparkline data is not provided by the stats hook → popover guards `spark` (T17 note). Confirm `DateRange` export location (T15 Step 2). Confirm `display:contents` not needed (kit uses `MetricCard` as the direct grid child, avoiding the mockup's `contents` wrapper).
