"use client";

import { useState, useEffect } from "react";
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
import { useTikTokAdsInsights } from "@/hooks/queries/admin/useTikTokAdsInsights";
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
  // Signups sits between Spend and Revenue so the row reads as the funnel it is:
  // spend → accounts created → revenue → return. Its own column (rather than a
  // sub-line under Revenue) so it stays visible at zero — "this channel created no
  // accounts" is itself information worth seeing.
  { key: "signups", label: "Signups", align: "right", sortable: false },
  { key: "revenue", label: "Revenue", align: "right", sortable: false },
  // Two ROAS columns, deliberately labelled by SOURCE rather than by quality: "Server"
  // is our own payment-attributed figure (the final word for budget decisions);
  // "Platform" is what the ad platform reports back. They disagree by design — different
  // attribution models and windows — and the gap is the signal.
  { key: "roas", label: "ROAS · server", align: "right", sortable: false },
  { key: "platformRoas", label: "ROAS · platform", align: "right", sortable: false },
];

const MUTED = "text-neutral-300 dark:text-neutral-600";
/** Hover-popover box (fixed-position, portalled) — used for both render and fit math. */
const POPOVER_WIDTH = 300;
/** Upper bound for the popover's height (header + up to 5 category bars + padding). */
const POPOVER_MAX_HEIGHT = 260;
// amber-700 in light mode: the previous amber-600/80 measured 2.51:1 on white at 10px —
// below the WCAG AA 4.5:1 floor for normal-size text; amber-700 measures 5.02:1 (panel F-010).
const AWAITING = "text-2xs text-amber-700 dark:text-amber-500/80 font-medium";

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

  // The popover position is captured once at mouse-enter (position: fixed); close it on
  // scroll so it never floats detached from its row (the dashboard scrolls with the window).
  useEffect(() => {
    if (!hovered) return;
    const close = () => setHovered(null);
    window.addEventListener("scroll", close, { passive: true });
    return () => window.removeEventListener("scroll", close);
  }, [hovered]);

  // Only skeleton when there is no data yet — a background refetch keeps the rows.
  const showSkeleton = loading && !stats;

  // The 5 attributed channels, then an appended "Direct" (unattributed) row when present.
  // The Direct row is excluded from the "$… attributed" header total and blended ROAS.
  const directRow = buildDirectRow(stats?.attributedRevenue);
  const rows = [
    ...buildAdvertisingRows(stats?.attributedRevenue),
    ...(directRow ? [directRow] : []),
  ];

  // Truthful "Awaiting sync" (panel F-002): while the TikTok spend cell is in the
  // awaiting state, check the sync health — a FAILING nightly sync must not read as a
  // benign "not set up yet". Range-independent, so a fixed same-day range is fine; the
  // query is disabled entirely once real spend arrives (the cell stops being awaiting).
  const tiktokAwaiting = rows.some(
    (r) => r.platformKey === "tiktok" && r.spend.kind === "awaiting",
  );
  const todaySydney = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const { data: tiktokHealthData } = useTikTokAdsInsights({
    startDate: todaySydney,
    endDate: todaySydney,
    enabled: tiktokAwaiting && !showSkeleton,
  });
  const tiktokSyncFailing =
    tiktokHealthData?.syncHealth?.configured === true &&
    tiktokHealthData.syncHealth.lastRun?.outcome === "error";
  const tiktokSyncErrorTitle = tiktokSyncFailing
    ? `TikTok spend sync failing — ${tiktokHealthData?.syncHealth?.lastRun?.errorMessage ?? "unknown error"}`
    : undefined;
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
        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
          <PlatformLogo platform={row.logo} />
          {row.platform}
        </div>
      );
    }

    if (key === "spend") {
      if (row.spend.kind === "amount") {
        return <span className="text-xs sm:text-sm font-semibold num">{formatCurrency(row.spend.value)}</span>;
      }
      if (row.spend.kind === "awaiting") {
        // F-002: a failing sync must not masquerade as a benign "awaiting" state.
        if (row.platformKey === "tiktok" && tiktokSyncFailing) {
          return (
            <span
              className="text-2xs font-medium text-red-600 dark:text-red-400"
              title={tiktokSyncErrorTitle}
            >
              Sync failing
            </span>
          );
        }
        return <span className={AWAITING}>Awaiting sync</span>;
      }
      return <span className={MUTED}>—</span>; // owned
    }

    if (key === "signups") {
      return (
        <span
          className={`num text-xs sm:text-sm font-semibold ${
            row.signups > 0 ? "" : "text-neutral-300 dark:text-neutral-600"
          }`}
          title={
            row.signups > 0
              ? `${row.signups.toLocaleString()} account${row.signups === 1 ? "" : "s"} created from ${row.platform} in this range. Click-verified where a paid click id was present at registration, otherwise matched on UTM source; unattributed signups count under Direct.`
              : undefined
          }
        >
          {row.signups.toLocaleString()}
        </span>
      );
    }

    if (key === "revenue") {
      return (
        <div className="flex flex-col items-end leading-tight" title={row.confidenceTitle}>
          <span className="text-xs sm:text-sm font-semibold num">{formatCurrency(row.revenue)}</span>
          <span className="text-2xs text-neutral-400 dark:text-neutral-500 num">
            {row.conversions.toLocaleString()} new
          </span>
        </div>
      );
    }

    if (key === "platformRoas") {
      if (row.platformRoas.kind === "value") {
        return (
          <div
            className="flex flex-col items-end leading-tight"
            title={`${row.platform} reports ${formatCurrency(row.platformRoas.revenue)} conversion value. This is the platform's own attribution — it will not match the server figure.`}
          >
            {/* Secondary by weight: the server ROAS is the one to act on. Deliberately
                NOT colour-coded green/amber — two colour-coded ROAS numbers side by side
                read as a pass/fail pair, when the platform figure is context, not a verdict. */}
            <span className="num text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-300">
              {row.platformRoas.value.toFixed(2)}x
            </span>
            <span className="text-2xs text-neutral-400 dark:text-neutral-500 num">
              {formatCurrency(row.platformRoas.revenue)}
            </span>
          </div>
        );
      }
      if (row.platformRoas.kind === "noData") {
        return (
          <span className={MUTED} title="This platform reported no conversion value for the period.">
            —
          </span>
        );
      }
      return <span className={MUTED}>—</span>; // na (owned / no spend)
    }

    // roas (server-side, payment-attributed — the final word)
    if (row.roas.kind === "value") {
      return (
        <span
          className={`num text-xs sm:text-sm font-semibold ${
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
    <>
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
                  <p className="font-display font-bold text-base sm:text-lg text-emerald-600 dark:text-emerald-400 num">
                    {blendedRoas != null ? `${blendedRoas.toFixed(2)}x` : "—"}
                  </p>
                  <p className="text-2xs text-neutral-400 num mt-0.5">
                    {formatCurrency(totalRevenue)} attributed
                  </p>
                </>
              )}
            </div>
          }
        />
        <DataTable<AdvertisingRowVM>
          columns={COLUMNS}
          rows={rows}
          renderCell={renderCell}
          onRowClick={(row) => setModal({ key: row.platformKey, label: row.platform })}
          onRowMouseEnter={(row, e) => {
            if (typeof window !== "undefined" && !window.matchMedia("(pointer: fine)").matches) return;
            const r = e.currentTarget.getBoundingClientRect();
            // Flip above the row when the popover wouldn't fit below (panel F-016) —
            // on the lower rows it was clipped by the viewport bottom, and because
            // scrolling closes it you could never read the cut-off part. Height is
            // content-dependent (up to 5 bars + header), so estimate conservatively
            // and clamp to the top edge. Same 6px gap either side.
            const estimatedHeight = POPOVER_MAX_HEIGHT;
            const fitsBelow = r.bottom + 6 + estimatedHeight <= window.innerHeight;
            const top = fitsBelow
              ? r.bottom + 6
              : Math.max(8, r.top - 6 - estimatedHeight);
            // Keep the 300px-wide panel inside the right edge too.
            const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8));
            setHovered({ key: row.platformKey, label: row.platform, top, left });
          }}
          onRowMouseLeave={() => setHovered(null)}
        />
        {directRow && !showSkeleton && (
          <p className="mt-3 text-2xs text-neutral-400 leading-snug">
            <strong>Direct</strong> = payments with no ad attribution (no fbclid / ttclid / Klaviyo tag). Not counted in the
            &quot;attributed&quot; total or blended ROAS.
          </p>
        )}
        {hovered &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: hovered.top,
                left: hovered.left,
                width: POPOVER_WIDTH,
                maxHeight: POPOVER_MAX_HEIGHT,
                overflowY: "auto",
                zIndex: 60,
              }}
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
}
