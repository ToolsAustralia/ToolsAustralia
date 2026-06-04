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
  { key: "revenue", label: "Revenue", align: "right", sortable: false },
  { key: "roas", label: "ROAS", align: "right", sortable: false },
];

const MUTED = "text-neutral-300 dark:text-neutral-600";
const AWAITING = "text-2xs text-amber-600/80 dark:text-amber-500/80 font-medium";

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
        return <span className="font-semibold num">{formatCurrency(row.spend.value)}</span>;
      }
      if (row.spend.kind === "awaiting") {
        return <span className={AWAITING}>Awaiting sync</span>;
      }
      return <span className={MUTED}>—</span>; // owned
    }

    if (key === "revenue") {
      return (
        <div className="flex flex-col items-end leading-tight" title={row.confidenceTitle}>
          <span className="font-semibold num">{formatCurrency(row.revenue)}</span>
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
                  <p className="font-display font-bold text-lg text-emerald-600 dark:text-emerald-400 num">
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
            setHovered({ key: row.platformKey, label: row.platform, top: r.bottom + 6, left: r.left });
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
