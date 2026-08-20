"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Tags, RotateCw } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  SectionTitle,
  DataTable,
  Segmented,
  ProgressBar,
  type Column,
} from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useBrandPerformance } from "@/hooks/queries/useBrandPerformance";
import type {
  BrandPerformanceBasis,
  BrandPerformancePlatformScope,
  BrandPerformanceRow,
} from "@/services/analytics/BrandPerformanceService";
import type { BrandLane } from "@/utils/metrics/brand-lane";
import type { SpendByUrlPlatform } from "@/hooks/queries/useSpendByUrlAnalytics";
import { resolveAestDateWindow } from "@/utils/admin/resolveAestDateWindow";
import { cn } from "@/utils/cn";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import BrandPerformanceAdsModal from "@/components/modals/BrandPerformanceAdsModal";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Brand performance — spend and return per BRAND LANE, on the admin Overview.
 *
 * Replaces the old `PrizePerformanceCard`, which covered only the toolset lane and reported
 * the AD PLATFORM's revenue. Two things changed:
 *
 *  1. **Both brand axes.** Toolset (`ryobi | milwaukee | dewalt | makita | hikoki`) and toolbox
 *     (`sidchrome | kincrome | milwaukee | gearwrench`). ⚠️ Milwaukee is in both — the lane
 *     control has to stay unmistakable, because the wordmark alone cannot tell the two rows
 *     apart.
 *  2. **Server-side outcomes.** New-membership counts and a per-type purchase count only exist
 *     in our own ledger, so the `basis` control chooses where outcome figures come from. The
 *     old platform-reported view is kept as the third option: it is what Ads Manager shows and
 *     the ads team needs to reconcile against it.
 *
 * All aggregation lives in `BrandPerformanceService`; this component renders and nothing else.
 * Spend is ALWAYS URL-derived (ad platforms cannot see which combination a visitor built), which
 * is why the Spend header carries a `URL` tag whenever outcomes are keyed on something else.
 */
type CompareMode = "off" | "previous-calendar-month";

/** Table row — `DataTable` requires an index signature and an `id`. */
interface Row extends Record<string, unknown> {
  id: string;
  row: BrandPerformanceRow;
}

const LANE_OPTIONS: { value: BrandLane; label: string }[] = [
  { value: "toolset", label: "Toolset" },
  { value: "toolbox", label: "Toolbox" },
];

const BASIS_OPTIONS: { value: BrandPerformanceBasis; label: string }[] = [
  { value: "landing-page", label: "Landing page" },
  { value: "built-prize", label: "Built prize" },
  { value: "platform", label: "Platform" },
];

const PLATFORM_OPTIONS: { value: BrandPerformancePlatformScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "meta", label: "Meta" },
  { value: "tiktok", label: "TikTok" },
];

const BASIS_HINT: Record<BrandPerformanceBasis, string> = {
  "landing-page":
    "Revenue and counts from our own records, attributed to the promotion page the buyer signed up on — the same key ad spend uses, so ROAS is exact.",
  "built-prize":
    "Revenue and counts from our own records, attributed to the combination the buyer actually had on screen. Spend is still keyed on the page the ad bought, so ROAS here is indicative.",
  platform:
    "Revenue and conversions as the ad platform itself reports them — what you see in Ads Manager. Platform data carries no membership split.",
};

export default function BrandPerformanceCard({
  dateRange,
  startDate: customStartDate,
  endDate: customEndDate,
}: {
  dateRange: DateRange;
  startDate?: string;
  endDate?: string;
}) {
  const { fmtCompact, formatNumber } = useMetricsFormatting();

  const { startDate, endDate } = useMemo(
    () => resolveAestDateWindow(dateRange, customStartDate, customEndDate),
    [dateRange, customStartDate, customEndDate],
  );

  const [lane, setLane] = useState<BrandLane>("toolset");
  const [basis, setBasis] = useState<BrandPerformanceBasis>("landing-page");
  const [platform, setPlatform] = useState<BrandPerformancePlatformScope>("all");
  const [compare, setCompare] = useState<CompareMode>("off");

  const query = useBrandPerformance(startDate, endDate, {
    lane,
    basis,
    platform,
    compare: compare !== "off",
  });

  const queryClient = useQueryClient();
  const syncMutation = useMutation({
    mutationFn: async () => {
      // Always sync a bounded RECENT window (last 14 days) regardless of the selected range:
      // the platform APIs cannot reliably pull a large span in one request, and only recent
      // days actually change. Unchanged from the card this replaces.
      const until = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
      const since = formatInTimeZone(subDays(new Date(), 13), AEST_TIMEZONE, "yyyy-MM-dd");
      const res = await fetch("/api/admin/analytics/spend-by-url/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: since, endDate: until, platform }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      return json;
    },
    onSuccess: () => {
      // Both caches: the sync rewrites the landing-page aggregate that feeds each of them.
      void queryClient.invalidateQueries({ queryKey: ["admin", "analytics", "brand-performance"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "analytics", "spend-by-url"] });
    },
  });

  const data = query.data;
  const serverBasis = basis !== "platform";
  const showCompare = compare !== "off";

  const rows = useMemo<Row[]>(
    () => (data?.rows ?? []).map((r) => ({ id: r.laneId, row: r })),
    [data?.rows],
  );

  const columns: Column[] = useMemo(
    () => [
      { key: "brand", label: "Brand", align: "left" },
      { key: "roas", label: "ROAS", align: "right" },
      { key: "spend", label: basis === "landing-page" ? "Spend" : "Spend · URL", align: "right" },
      { key: "revenue", label: "Revenue", align: "right" },
      { key: "purchases", label: "Purchases", align: "right" },
      { key: "newMemberships", label: "New members", align: "right" },
      { key: "newMembershipPct", label: "New memb %", align: "right" },
    ],
    [basis],
  );

  const [selected, setSelected] = useState<{
    brand: string;
    slug: string;
    canonicalUrlsByPlatform: Record<SpendByUrlPlatform, string[]>;
    platform: SpendByUrlPlatform;
  } | null>(null);

  /** Δ chip beneath a figure. Only rendered when Compare is on and a prior value exists. */
  const delta = (current: number, prior: number | null | undefined) => {
    if (!showCompare || prior == null) return null;
    // No prior activity: a percentage change from zero is undefined, so say "new" rather than
    // rendering an infinite or 100% jump that reads as a real measurement.
    if (prior === 0) {
      return current === 0 ? null : (
        <span className="block text-3xs font-medium text-emerald-600 dark:text-emerald-400">new</span>
      );
    }
    const pct = ((current - prior) / Math.abs(prior)) * 100;
    if (Math.abs(pct) < 0.05) {
      return <span className="block text-3xs text-neutral-400 dark:text-neutral-500">—</span>;
    }
    const up = pct > 0;
    return (
      <span
        className={cn(
          "block text-3xs font-medium tabular-nums",
          up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
        )}
      >
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
      </span>
    );
  };

  const roasClass = (roas: number) =>
    roas >= 3 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-500";

  const renderCell = (key: string, r: Row) => {
    const d = r.row;
    const prior = d.comparison;

    if (key === "brand") {
      return (
        <div className="flex items-center min-h-[2rem]">
          {d.logoPath ? (
            <span className="relative w-20 h-7 flex items-center justify-start shrink-0">
              <Image
                src={d.logoPath}
                alt={d.displayName}
                width={96}
                height={48}
                unoptimized
                className="object-contain object-left max-h-7"
                sizes="96px"
              />
            </span>
          ) : (
            <span className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300">
              {d.displayName}
            </span>
          )}
        </div>
      );
    }

    if (key === "roas") {
      return (
        <>
          <span className={cn("num text-xs sm:text-sm font-semibold", roasClass(d.roas))}>
            {d.roas.toFixed(2)}x
          </span>
          {delta(d.roas, prior?.roas)}
        </>
      );
    }

    if (key === "spend") {
      return (
        <>
          <span className="num text-xs sm:text-sm">{fmtCompact(d.spend)}</span>
          {delta(d.spend, prior?.spend)}
        </>
      );
    }

    if (key === "revenue") {
      return (
        <>
          <span className="num text-xs sm:text-sm">{fmtCompact(d.revenue)}</span>
          {delta(d.revenue, prior?.revenue)}
        </>
      );
    }

    if (key === "purchases") {
      return (
        <>
          {/* Rounded: under the toolbox lane a bare-toolset page's conversions are split across
              lanes by the observed visitor mix, which yields fractions. The split is exact in
              aggregate — the Total is computed from unrounded values. */}
          <span className="num text-xs sm:text-sm">{formatNumber(Math.round(d.purchases))}</span>
          {delta(d.purchases, prior?.purchases)}
        </>
      );
    }

    if (key === "newMemberships") {
      // Platform basis has no membership split — an em dash, never a fabricated 0.
      if (d.newMemberships == null) {
        return <span className="text-xs sm:text-sm text-neutral-400 dark:text-neutral-600">—</span>;
      }
      return (
        <>
          <span className="num text-xs sm:text-sm">{formatNumber(d.newMemberships)}</span>
          {delta(d.newMemberships, prior?.newMemberships)}
        </>
      );
    }

    // newMembershipPct
    if (d.newMembershipCountPct == null) {
      return <span className="text-xs sm:text-sm text-neutral-400 dark:text-neutral-600">—</span>;
    }
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="num text-xs sm:text-sm">{d.newMembershipCountPct.toFixed(0)}%</span>
        {/* tone="neutral": this is a share-of-total, not a budget. The default risk scale
            would paint a healthy 85% red. */}
        <ProgressBar pct={d.newMembershipCountPct} tone="neutral" className="h-1.5 w-14" />
      </div>
    );
  };

  const openDrilldown = (d: BrandPerformanceRow) => {
    const platforms = d.platforms;
    setSelected({
      brand: d.displayName,
      slug: d.laneId,
      canonicalUrlsByPlatform: d.canonicalUrlsByPlatform,
      // Per-ad detail is single-platform (ad ids aren't unique across platforms). Open on the
      // row's only platform, or Meta when it mixes — the modal's own chips let the reader switch.
      platform: platforms.length === 1 ? platforms[0] : "meta",
    });
  };

  const totals = data?.totals;
  const unattributed = data?.unattributed;

  return (
    <>
      <Card className="p-5">
        <SectionTitle
          title="Brand performance"
          subtitle="Spend & return by brand"
          icon={Tags}
          right={
            <button
              type="button"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Sync the latest spend & revenue from the ad platform"
            >
              <RotateCw
                className={cn("w-3.5 h-3.5", syncMutation.isPending && "animate-spin")}
                strokeWidth={2}
              />
              {syncMutation.isPending ? "Syncing…" : "Sync"}
            </button>
          }
        />

        {syncMutation.isError && (
          <p className="text-xs text-red-600 dark:text-red-400 -mt-2 mb-3">
            {syncMutation.error instanceof Error ? syncMutation.error.message : "Sync failed"}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Segmented options={LANE_OPTIONS} value={lane} onChange={setLane} size="sm" />
          {/* The basis hint is a tooltip, not a paragraph — the control carries the meaning. */}
          <span title={BASIS_HINT[basis]}>
            <Segmented options={BASIS_OPTIONS} value={basis} onChange={setBasis} size="sm" />
          </span>
          <Segmented options={PLATFORM_OPTIONS} value={platform} onChange={setPlatform} size="sm" />
          <button
            type="button"
            onClick={() => setCompare((c) => (c === "off" ? "previous-calendar-month" : "off"))}
            aria-pressed={showCompare}
            title="Compare against the previous calendar month"
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors",
              showCompare
                ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800",
            )}
          >
            Compare
          </button>
        </div>

        {showCompare && data?.meta.comparison && (
          <p className="text-2xs text-neutral-500 dark:text-neutral-400 -mt-2 mb-3 tabular-nums">
            vs {data.meta.comparison.startDate} → {data.meta.comparison.endDate}
          </p>
        )}

        {query.error ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-4">
            {query.error instanceof Error ? query.error.message : "Failed to load brand performance"}
          </p>
        ) : query.isLoading ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500 py-4">
            Loading brand performance…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500 py-4">
            No brand activity in this period.
          </p>
        ) : (
          <>
            <DataTable<Row>
              columns={columns}
              rows={rows}
              renderCell={renderCell}
              // Seven columns of numbers scroll horizontally on a phone. Without pinning, the
              // brand wordmark — the only thing identifying a row — scrolls away with them.
              stickyFirstColumn
              onRowClick={(r) => openDrilldown(r.row)}
              footer={
                <>
                  {/* Unattributed sits ABOVE the total and inside the footer: it is not a brand,
                      but it IS part of the total — without it the Total would not reconcile with
                      the ad account or the Overview revenue card. */}
                  {unattributed && (
                    <tr className="border-t border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">
                      <td className="py-2 px-2 text-left text-xs">
                        Unattributed
                        <span className="ml-1.5 text-3xs text-neutral-400 dark:text-neutral-500">
                          no brand in URL / no signup attribution
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-xs">—</td>
                      <td className="py-2 px-2 text-right num text-xs">
                        {fmtCompact(unattributed.spend)}
                      </td>
                      <td className="py-2 px-2 text-right num text-xs">
                        {fmtCompact(unattributed.revenue)}
                      </td>
                      <td className="py-2 px-2 text-right num text-xs">
                        {formatNumber(Math.round(unattributed.purchases))}
                      </td>
                      <td className="py-2 px-2 text-right num text-xs">
                        {unattributed.newMemberships == null
                          ? "—"
                          : formatNumber(unattributed.newMemberships)}
                      </td>
                      <td className="py-2 px-2 text-right text-xs">—</td>
                    </tr>
                  )}
                  {totals && (
                    <tr className="border-t border-neutral-200 dark:border-neutral-700 font-semibold">
                      <td className="py-2.5 px-2 text-left text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                        Total
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={cn("num text-xs sm:text-sm font-semibold", roasClass(totals.roas))}>
                          {totals.roas.toFixed(2)}x
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right num text-xs sm:text-sm">
                        {fmtCompact(totals.spend)}
                      </td>
                      <td className="py-2.5 px-2 text-right num text-xs sm:text-sm">
                        {fmtCompact(totals.revenue)}
                      </td>
                      <td className="py-2.5 px-2 text-right num text-xs sm:text-sm">
                        {formatNumber(Math.round(totals.purchases))}
                      </td>
                      <td className="py-2.5 px-2 text-right num text-xs sm:text-sm">
                        {totals.newMemberships == null ? "—" : formatNumber(totals.newMemberships)}
                      </td>
                      <td className="py-2.5 px-2 text-right num text-xs sm:text-sm">
                        {totals.newMembershipCountPct == null
                          ? "—"
                          : `${totals.newMembershipCountPct.toFixed(0)}%`}
                      </td>
                    </tr>
                  )}
                </>
              }
            />

            {lane === "toolbox" && data?.meta.toolboxSpendModel === "observed-mix" && (
              <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-3">
                Toolset landing pages don&apos;t name a toolbox, so their spend is split across
                these rows by the toolbox mix their visitors actually built
                {data.meta.toolboxMixVisitors != null && (
                  <>
                    {" "}
                    —{" "}
                    <span
                      className={cn(
                        "font-medium",
                        // Builder beacons are far sparser than impressions, so a handful of
                        // visitors can end up dividing thousands of dollars. Below ~30 the
                        // split is indicative, not a measurement, and must look like it.
                        data.meta.toolboxMixVisitors < 30 && "text-amber-600 dark:text-amber-500",
                      )}
                    >
                      from {formatNumber(data.meta.toolboxMixVisitors)} visitor build
                      {data.meta.toolboxMixVisitors === 1 ? "" : "s"}
                    </span>
                    {data.meta.toolboxMixVisitors < 30 && ", a thin sample — treat the split as indicative"}
                  </>
                )}
                .
              </p>
            )}
            {lane === "toolbox" &&
              (data?.meta.toolboxSpendModel === "page-default" ||
                data?.meta.toolboxSpendModel === "mixed") && (
                <p className="text-2xs text-amber-600 dark:text-amber-500 mt-3">
                  {basis === "built-prize"
                    ? `${data.meta.toolboxSpendModel === "mixed" ? "Some " : ""}Toolset landing-page spend has no visitor data in this window, so it falls back to each page's default toolbox — which concentrates it on one brand. Pick a more recent range for a split that reflects what visitors actually built.`
                    : "Toolset landing pages don't name a toolbox, so their spend and revenue are both attributed to each page's default toolbox — which concentrates them on one brand. Switch to Built prize to split by what visitors actually chose."}
                </p>
              )}
            {data?.meta.blendedPlatformRevenue && (
              <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-3">
                Spend is the true combined total. Revenue is each platform&apos;s <em>own</em>{" "}
                reported attribution added together — a purchase claimed by both is counted twice,
                so this ROAS reads high. Use a single platform, or a server-side basis, for a
                figure you can act on.
              </p>
            )}
            {!serverBasis && !data?.meta.blendedPlatformRevenue && (
              <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-3">
                Platform-reported figures — no membership split is available from ad-platform data.
              </p>
            )}
          </>
        )}
      </Card>

      <BrandPerformanceAdsModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        brandLabel={selected?.brand ?? ""}
        slug={selected?.slug ?? ""}
        startDate={startDate ?? ""}
        endDate={endDate ?? ""}
        canonicalUrlsByPlatform={selected?.canonicalUrlsByPlatform ?? { meta: [], tiktok: [] }}
        platform={selected?.platform ?? "meta"}
      />
    </>
  );
}
