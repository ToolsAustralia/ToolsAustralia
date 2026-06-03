# Part A — True-ROAS Advertising Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ No-auto-commit (CLAUDE.md rule #1):** the "Commit" steps below run ONLY if the user has authorized commits this session (keywords: commit/push/merge/PR/ship it). If not yet authorized, stage the files and ASK before committing.

**Goal:** Make the Overview "Advertising" card show server-side, payment-attributed revenue + true ROAS (spend from the ads API), with TikTok/Snapchat "awaiting sync" and Klaviyo revenue-only — instead of Meta's pixel `spend × roas`.

**Architecture:** Pure presentation rewire of one card. Extract the row/blended-ROAS/confidence logic into a React-free, unit-tested model module (`advertisingCardModel.ts`); the component (`AdvertisingPlatformCard.tsx`) only formats the view-models. Reads `stats.attributedRevenue` which the dashboard-stats route already computes — **no backend changes.**

**Tech Stack:** React 19 / Next 15 client component, Tailwind, the admin `DataTable`/`Card`/`SectionTitle` UI primitives, `useMetricsFormatting` (`fmtCompact`). Test: standalone `tsx` script + `node:assert/strict` (repo convention — there is no jest/vitest).

**Spec:** [docs/superpowers/specs/2026-06-02-advertising-true-roas-design.md](../specs/2026-06-02-advertising-true-roas-design.md) · master: [2026-06-03-advertising-analytics-suite-master-spec.md](../specs/2026-06-03-advertising-analytics-suite-master-spec.md)

---

## File Structure

- **Create** `src/app/admin/component/overview/sections/advertisingCardModel.ts` — pure view-model builder + blended-ROAS + total-revenue + confidence-tooltip helpers. One responsibility: translate `attributedRevenue` → render-ready row view-models.
- **Create** `src/app/admin/component/overview/sections/__tests__/advertisingCardModel.test.ts` — `tsx` unit test for the model.
- **Modify** `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx` — consume the model; render three presentation classes, conversions secondary, confidence `title` tooltip, corrected header.
- **Modify** `package.json` — add `test:advertising-card-model` script.
- **Modify** `docs/admin/frontend.md` — update the Advertising-card description (doc-sync requirement for `src/app/admin/**`).

All files are in the `admin` domain (Domain Manifest) → the doc-sync Stop hook requires the `docs/admin/` update in the same task.

---

## Task 1: Pure model module (TDD)

**Files:**
- Create: `src/app/admin/component/overview/sections/__tests__/advertisingCardModel.test.ts`
- Create: `src/app/admin/component/overview/sections/advertisingCardModel.ts`
- Modify: `package.json` (add `test:advertising-card-model`)

- [ ] **Step 1: Write the failing test**

Create `src/app/admin/component/overview/sections/__tests__/advertisingCardModel.test.ts`:

```ts
import assert from "node:assert/strict";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import {
  buildAdvertisingRows,
  computeBlendedRoas,
  computeTotalAttributedRevenue,
  formatConfidenceTitle,
} from "../advertisingCardModel";

type AR = NonNullable<AdminDashboardStats["attributedRevenue"]>;

// Covers all three presentation classes + a missing platform (snapchat absent → zeros).
const ar = {
  meta: {
    revenue: 41200,
    renewalRevenue: 5000,
    conversions: 142,
    byConfidence: { click: 36256, utm_only: 3708, inferred_backfill: 1236 }, // ~88/9/3
    adSpend: 12400,
    trueRoas: 41200 / 12400,
  },
  tiktok: {
    revenue: 6100,
    renewalRevenue: 0,
    conversions: 20,
    byConfidence: { click: 6100, utm_only: 0, inferred_backfill: 0 },
    // no adSpend / trueRoas → paid channel awaiting spend
  },
  klaviyo_email: {
    revenue: 9300,
    renewalRevenue: 1200,
    conversions: 31,
    byConfidence: { click: 0, utm_only: 9300, inferred_backfill: 0 },
  },
} as unknown as AR;

function run() {
  const rows = buildAdvertisingRows(ar);
  assert.equal(rows.length, 5, "always renders 5 rows");

  const meta = rows.find((r) => r.id === "facebook")!;
  assert.deepEqual(meta.spend, { kind: "amount", value: 12400 }, "meta spend = ad-API amount");
  assert.equal(meta.roas.kind, "value");
  assert.ok(Math.abs((meta.roas as { value: number }).value - 41200 / 12400) < 1e-9, "meta true ROAS");
  assert.equal(meta.revenue, 41200);
  assert.equal(meta.conversions, 142);

  const tiktok = rows.find((r) => r.id === "tiktok")!;
  assert.deepEqual(tiktok.spend, { kind: "awaiting" }, "tiktok paid-but-no-spend → awaiting");
  assert.deepEqual(tiktok.roas, { kind: "needsSpend" }, "tiktok roas needs spend");
  assert.equal(tiktok.revenue, 6100);

  const snapchat = rows.find((r) => r.id === "snapchat")!;
  assert.equal(snapchat.revenue, 0, "missing platform → zero revenue");
  assert.deepEqual(snapchat.spend, { kind: "awaiting" });
  assert.equal(snapchat.confidenceTitle, undefined, "no revenue → no confidence tooltip");

  const kemail = rows.find((r) => r.id === "klaviyo-email")!;
  assert.deepEqual(kemail.spend, { kind: "owned" }, "klaviyo = owned channel");
  assert.deepEqual(kemail.roas, { kind: "na" }, "klaviyo roas n/a");
  assert.equal(kemail.revenue, 9300);

  // klaviyo-sms is absent from the fixture → exercises missing-key + owned-class together.
  const ksms = rows.find((r) => r.id === "klaviyo-sms")!;
  assert.deepEqual(ksms.spend, { kind: "owned" }, "absent owned platform → owned spend");
  assert.deepEqual(ksms.roas, { kind: "na" }, "absent owned platform → roas n/a");
  assert.equal(ksms.revenue, 0, "absent owned platform → zero revenue");
  assert.equal(ksms.confidenceTitle, undefined, "no revenue → no tooltip");

  // Blended ROAS counts ONLY paid channels with spend (meta today).
  const blended = computeBlendedRoas(ar);
  assert.ok(blended != null && Math.abs(blended - 41200 / 12400) < 1e-9, "blended = meta rev/spend");

  // No spend anywhere → null (render as "—").
  assert.equal(computeBlendedRoas({ tiktok: ar.tiktok } as unknown as AR), null, "no spend → null blended");

  // Total attributed revenue sums all displayed rows.
  assert.equal(
    computeTotalAttributedRevenue(ar),
    41200 + 6100 + 9300,
    "total attributed revenue across rows",
  );

  // Confidence percentages.
  assert.equal(
    formatConfidenceTitle(ar.meta),
    "88% click-verified · 9% UTM-only · 3% backfilled",
    "confidence split rounds to 88/9/3",
  );
  assert.equal(formatConfidenceTitle(undefined), undefined, "no entry → undefined");

  console.log("advertisingCardModel helper tests passed");
}

run();
```

- [ ] **Step 2: Wire the npm test script**

In `package.json`, add this line in the test-scripts block (next to the other `test:*` entries, e.g. after `"test:renewal-progress": ...`):

```json
    "test:advertising-card-model": "tsx src/app/admin/component/overview/sections/__tests__/advertisingCardModel.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:advertising-card-model`
Expected: FAIL — cannot resolve `../advertisingCardModel` (module does not exist yet).

- [ ] **Step 4: Write the model module**

Create `src/app/admin/component/overview/sections/advertisingCardModel.ts`:

```ts
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import type { PlatformLogoName } from "@/components/admin/ui";

/**
 * Pure presentation model for the Overview "Advertising" card.
 *
 * Translates the dashboard-stats `attributedRevenue` map (server-side, payment-
 * attributed revenue keyed by convertingPlatform) into render-ready row view-
 * models. React-free so it is unit-testable via tsx; the component only formats
 * these values. Spec: docs/superpowers/specs/2026-06-02-advertising-true-roas-design.md
 */

type AttributedRevenue = NonNullable<AdminDashboardStats["attributedRevenue"]>;
type AttributedEntry = AttributedRevenue[string];

/** Spend cell state — drives display + whether ROAS is computable. */
export type SpendState =
  | { kind: "amount"; value: number } // paid channel with ad spend (Meta today)
  | { kind: "awaiting" }              // paid channel, spend sync not live yet (TikTok/Snapchat)
  | { kind: "owned" };                // owned channel, no ad spend by nature (Klaviyo)

/** ROAS cell state. */
export type RoasState =
  | { kind: "value"; value: number }  // true ROAS = attributed revenue / ad spend
  | { kind: "needsSpend" }            // paid channel but no spend denominator yet
  | { kind: "na" };                   // owned channel — ROAS not applicable

/** Extends Record<string, unknown> to satisfy the DataTable generic constraint. */
export interface AdvertisingRowVM extends Record<string, unknown> {
  id: string;
  platform: string;
  logo: PlatformLogoName;
  spend: SpendState;
  revenue: number;     // attributed acquisition revenue (dollars)
  conversions: number; // new-customer conversions
  roas: RoasState;
  /** Multi-line native-title tooltip with the click/UTM/backfill split; undefined when no revenue. */
  confidenceTitle?: string;
}

interface RowConfig {
  id: string;
  key: string; // attributedRevenue map key (convertingPlatform)
  platform: string;
  logo: PlatformLogoName;
  kind: "paid" | "owned";
}

/** The five rows the card renders, in display order. */
export const ADVERTISING_ROW_CONFIG: RowConfig[] = [
  { id: "facebook", key: "meta", platform: "Facebook Ads", logo: "facebook", kind: "paid" },
  { id: "tiktok", key: "tiktok", platform: "TikTok Ads", logo: "tiktok", kind: "paid" },
  { id: "snapchat", key: "snapchat", platform: "Snapchat Ads", logo: "snapchat", kind: "paid" },
  { id: "klaviyo-email", key: "klaviyo_email", platform: "Klaviyo Email", logo: "klaviyo", kind: "owned" },
  { id: "klaviyo-sms", key: "klaviyo_sms", platform: "Klaviyo SMS", logo: "klaviyo", kind: "owned" },
];

/** Coerce a possibly-missing/non-finite number to a safe finite value (presentation-boundary guard). */
const toFinite = (n: number | undefined): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

/** Build per-row view-models from the attributedRevenue payload (missing keys → zeros). */
export function buildAdvertisingRows(ar: AttributedRevenue | undefined): AdvertisingRowVM[] {
  return ADVERTISING_ROW_CONFIG.map((cfg) => {
    const entry = ar?.[cfg.key];
    const revenue = toFinite(entry?.revenue);
    const conversions = toFinite(entry?.conversions);
    const adSpend = entry?.adSpend;
    const trueRoas = entry?.trueRoas;

    let spend: SpendState;
    let roas: RoasState;
    if (cfg.kind === "owned") {
      spend = { kind: "owned" };
      roas = { kind: "na" };
    } else if (adSpend != null && adSpend > 0) {
      spend = { kind: "amount", value: adSpend };
      // `needsSpend` arm is defensive — the route only emits trueRoas when spend>0 (and finite).
      roas =
        trueRoas != null && Number.isFinite(trueRoas)
          ? { kind: "value", value: trueRoas }
          : { kind: "needsSpend" };
    } else {
      spend = { kind: "awaiting" };
      roas = { kind: "needsSpend" };
    }

    return {
      id: cfg.id,
      platform: cfg.platform,
      logo: cfg.logo,
      spend,
      revenue,
      conversions,
      roas,
      confidenceTitle: formatConfidenceTitle(entry),
    };
  });
}

/**
 * Blended ROAS = Σ revenue ÷ Σ ad spend across paid channels that have spend.
 * Returns null when no paid channel has spend (render "—", never 0.00x).
 */
export function computeBlendedRoas(ar: AttributedRevenue | undefined): number | null {
  if (!ar) return null;
  let revenue = 0;
  let spend = 0;
  for (const cfg of ADVERTISING_ROW_CONFIG) {
    if (cfg.kind !== "paid") continue;
    const entry = ar[cfg.key];
    if (!entry || entry.adSpend == null || entry.adSpend <= 0) continue;
    revenue += entry.revenue;
    spend += entry.adSpend;
  }
  return spend > 0 ? revenue / spend : null;
}

/**
 * Total attributed (acquisition) revenue across ALL displayed rows (paid + owned), dollars.
 * NOTE: deliberately a different scope than computeBlendedRoas' denominator (paid-with-spend
 * only) — the header's "$… attributed" total and "Blended ROAS" are not meant to reconcile.
 */
export function computeTotalAttributedRevenue(ar: AttributedRevenue | undefined): number {
  if (!ar) return 0;
  return ADVERTISING_ROW_CONFIG.reduce((sum, cfg) => sum + (ar[cfg.key]?.revenue ?? 0), 0);
}

/**
 * Confidence split as a native-title string, e.g.
 * "88% click-verified · 9% UTM-only · 3% backfilled".
 * Returns undefined when the row has no attributed revenue.
 */
export function formatConfidenceTitle(entry: AttributedEntry | undefined): string | undefined {
  if (!entry || entry.revenue <= 0) return undefined;
  const { click, utm_only, inferred_backfill } = entry.byConfidence;
  const total = click + utm_only + inferred_backfill;
  if (total <= 0) return undefined;
  const pct = (n: number) => Math.round((n / total) * 100);
  return `${pct(click)}% click-verified · ${pct(utm_only)}% UTM-only · ${pct(inferred_backfill)}% backfilled`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:advertising-card-model`
Expected: PASS — prints `advertisingCardModel helper tests passed`.

- [ ] **Step 6: Commit** *(only if commits are authorized this session — else stage + ask)*

```bash
git add src/app/admin/component/overview/sections/advertisingCardModel.ts src/app/admin/component/overview/sections/__tests__/advertisingCardModel.test.ts package.json
git commit -m "feat(admin): pure model for true-ROAS advertising card + tsx test"
```

---

## Task 2: Rewire the Advertising card to the model

**Files:**
- Modify: `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx` (full replace)

- [ ] **Step 1: Replace the component file**

Replace the entire contents of `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx` with:

```tsx
"use client";

import { TrendingUp } from "lucide-react";
import {
  Card,
  SectionTitle,
  DataTable,
  PlatformLogo,
  type Column,
} from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import {
  buildAdvertisingRows,
  computeBlendedRoas,
  computeTotalAttributedRevenue,
  type AdvertisingRowVM,
} from "./advertisingCardModel";

/**
 * Advertising spend & return by platform for the admin Overview.
 *
 * Revenue + ROAS are SERVER-SIDE, payment-attributed (stats.attributedRevenue,
 * keyed by convertingPlatform) — NOT Meta's pixel figures. Ad spend still comes
 * from the ads API. Three presentation classes (see advertisingCardModel):
 *   - paid + spend (Meta): spend, revenue, true ROAS.
 *   - paid, spend not synced (TikTok/Snapchat): revenue + conversions; spend "Awaiting sync", ROAS "Needs spend".
 *   - owned (Klaviyo Email/SMS): revenue + conversions only; spend/ROAS "—".
 * Blended ROAS = Σ revenue ÷ Σ spend over paid channels with spend. The dedicated
 * Facebook Ads tab + ads-health views are intentionally untouched.
 */
const COLUMNS: Column[] = [
  { key: "platform", label: "Platform", align: "left", sortable: false },
  { key: "spend", label: "Spend", align: "right", sortable: false },
  { key: "revenue", label: "Revenue", align: "right", sortable: false },
  { key: "roas", label: "ROAS", align: "right", sortable: false },
];

const MUTED = "text-neutral-300 dark:text-neutral-600";
const AWAITING = "text-2xs text-amber-600/80 dark:text-amber-500/80 font-medium";

export default function AdvertisingPlatformCard({
  stats,
  loading = false,
}: {
  stats: AdminDashboardStats | undefined;
  loading?: boolean;
}) {
  const { fmtCompact } = useMetricsFormatting();

  // Only skeleton when there is no data yet — a background refetch keeps the rows.
  const showSkeleton = loading && !stats;

  const rows = buildAdvertisingRows(stats?.attributedRevenue);
  const blendedRoas = computeBlendedRoas(stats?.attributedRevenue);
  const totalRevenue = computeTotalAttributedRevenue(stats?.attributedRevenue);

  const renderCell = (key: string, row: AdvertisingRowVM) => {
    if (showSkeleton) {
      if (key === "platform") {
        return (
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-[5px] shrink-0 bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
            <span className="h-3.5 w-24 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          </div>
        );
      }
      return (
        <span className="inline-block h-3.5 w-12 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
      );
    }

    if (key === "platform") {
      return (
        <div className="flex items-center gap-2 font-medium">
          <PlatformLogo platform={row.logo} />
          {row.platform}
        </div>
      );
    }

    if (key === "spend") {
      if (row.spend.kind === "amount") {
        return <span className="font-semibold num">{fmtCompact(row.spend.value)}</span>;
      }
      if (row.spend.kind === "awaiting") {
        return <span className={AWAITING}>Awaiting sync</span>;
      }
      return <span className={MUTED}>—</span>; // owned
    }

    if (key === "revenue") {
      return (
        <div className="flex flex-col items-end leading-tight" title={row.confidenceTitle}>
          <span className="font-semibold num">{fmtCompact(row.revenue)}</span>
          <span className="text-2xs text-neutral-400 dark:text-neutral-500 num">
            {row.conversions.toLocaleString()} new
          </span>
        </div>
      );
    }

    // roas
    if (row.roas.kind === "value") {
      return (
        <span
          className={`num font-semibold ${
            row.roas.value >= 3
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-500"
          }`}
        >
          {row.roas.value.toFixed(2)}x
        </span>
      );
    }
    if (row.roas.kind === "needsSpend") {
      return <span className={AWAITING}>Needs spend</span>;
    }
    return <span className={MUTED}>—</span>; // na (owned)
  };

  return (
    <Card className="p-5 h-full min-w-0">
      <SectionTitle
        title="Advertising"
        subtitle="Attributed revenue & true ROAS by platform"
        icon={TrendingUp}
        right={
          <div className="text-right">
            <p className="text-2xs text-neutral-400 uppercase tracking-wide">Blended ROAS</p>
            {showSkeleton ? (
              <span className="mt-1 inline-block h-5 w-12 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
            ) : (
              <>
                <p className="font-display font-bold text-lg text-emerald-600 dark:text-emerald-400 num">
                  {blendedRoas != null ? `${blendedRoas.toFixed(2)}x` : "—"}
                </p>
                <p className="text-2xs text-neutral-400 num mt-0.5">
                  {fmtCompact(totalRevenue)} attributed
                </p>
              </>
            )}
          </div>
        }
      />
      <DataTable<AdvertisingRowVM> columns={COLUMNS} rows={rows} renderCell={renderCell} />
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors). If `AdvertisingRowVM` trips the `DataTable` constraint, confirm the interface `extends Record<string, unknown>` (it does in Task 1).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS for the two changed files (no new warnings/errors).

- [ ] **Step 4: Manual verification** (no component test runner exists; verify in the running app)

Run `npm run dev`, open `/admin` (Overview), and confirm on the Advertising card:
- Facebook Ads row: spend (ads-API $), revenue with a "N new" sub-line, true ROAS `x.xx×` (green ≥3, amber below) — NOT `spend × pixelRoas`.
- TikTok / Snapchat rows: real revenue + "N new"; Spend = "Awaiting sync"; ROAS = "Needs spend".
- Klaviyo Email / SMS rows: revenue + "N new"; Spend = "—"; ROAS = "—".
- Header: "Blended ROAS" = Meta revenue ÷ Meta spend (or "—" if no paid spend) + "$… attributed" line.
- Hover a revenue figure → native tooltip shows "NN% click-verified · NN% UTM-only · NN% backfilled".
- A period with no Klaviyo revenue shows `$0` / `0 new`, never "Coming soon".

- [ ] **Step 5: Commit** *(only if commits are authorized this session — else stage + ask)*

```bash
git add src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx
git commit -m "feat(admin): true-ROAS advertising card reads server-side attributedRevenue"
```

---

## Task 3: Update admin docs (doc-sync requirement)

**Files:**
- Modify: `docs/admin/frontend.md`

- [ ] **Step 1: Update the Advertising-card description**

Find the existing `AdvertisingPlatformCard` entry under the `Cards:` list in `docs/admin/frontend.md` (`grep -n "AdvertisingPlatformCard" docs/admin/frontend.md` — around line 486). Replace that single bullet (which describes the old Facebook pixel `spend × roas` / "Coming soon" behavior) with the bullet below, matching the surrounding list style. Then scan the file for any other lingering `spend × roas` / "Coming soon" advertising wording and remove it so the doc has one source of truth:

```markdown
- **AdvertisingPlatformCard** (`overview/sections/`) — spend & return by platform. Revenue + ROAS are **server-side payment-attributed** (`stats.attributedRevenue`, keyed by `convertingPlatform`), not Meta pixel; ad spend from the ads API. Row logic in the unit-tested `advertisingCardModel.ts` (`npm run test:advertising-card-model`) maps each platform to one of three classes: **paid + spend** (Meta — spend, revenue, true ROAS `revenue/adSpend`); **paid, spend not synced** (TikTok/Snapchat — revenue + conversions; spend "Awaiting sync", ROAS "Needs spend"); **owned** (Klaviyo Email/SMS — revenue + conversions; spend/ROAS "—"). Header = **Blended ROAS** (Σ revenue ÷ Σ spend over paid-with-spend channels; "—" when none) + total attributed acquisition revenue. The dedicated Facebook Ads tab + ads-health views are untouched.
```

- [ ] **Step 2: Verify doc-sync is satisfied**

The Stop hook (`.claude/hooks/doc-sync.mjs`) checks that `src/app/admin/**` edits are matched by a `docs/admin/` update. With `frontend.md` modified in this same task, it should pass. If it still reports stale docs, follow its message (it names the exact file/section).

- [ ] **Step 3: Commit** *(only if commits are authorized this session — else stage + ask)*

```bash
git add docs/admin/frontend.md
git commit -m "docs(admin): describe true-ROAS advertising card behavior"
```

---

## Final verification

- [ ] `npm run test:advertising-card-model` → PASS
- [ ] `npm run type-check` → PASS
- [ ] `npm run lint` → PASS (changed files clean)
- [ ] Manual UI check (Task 2 Step 4) complete
- [ ] doc-sync Stop hook satisfied (no "Stale docs" block)

## Notes / gotchas

- **Backend is untouched** — `attributedRevenue[*].{revenue,adSpend,trueRoas,byConfidence,conversions}` already ship from `/api/admin/dashboard/stats`. If a field is missing in the live payload, that's a data issue (e.g. no spend yet), handled by the "awaiting"/"owned" states — not a code bug.
- **`revenue` is acquisition-only** (renewals excluded) by construction in the route — the correct ROAS numerator. Do not switch the card to `revenue.total`. The master spec calls this same value `newRevenue`; the stats route renames the snapshot-internal `newRevenue` → wire field `revenue` (route.ts:255), so the card reads `revenue`.
- **Confidence %s may not sum to exactly 100** due to rounding — acceptable for a tooltip.
- **`import type`** is used for `AdminDashboardStats` and `PlatformLogoName` so the tsx test doesn't pull client modules at runtime.
