"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Trophy, RotateCw } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, SectionTitle, DataTable, type Column } from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import {
  useSpendByUrlAnalytics,
  type SpendByUrlPlatform,
  type SpendByUrlRow,
} from "@/hooks/queries/useSpendByUrlAnalytics";
import { resolveAestDateWindow } from "@/utils/admin/resolveAestDateWindow";
import { cn } from "@/utils/cn";
import { TOOLSET_LANDING_SLUGS, type ToolsetLandingSlug } from "@/config/promo-landing-slugs";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import PrizePerformanceAdsModal from "@/components/modals/PrizePerformanceAdsModal";

/** Same calendar-day semantics as Facebook Ads → Spend by URL (Australia/Sydney) */
const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Prize performance (ad spend & return by prize) for the admin Overview.
 *
 * Data logic is ported from the legacy `AdvertisingBreakdownSection`:
 * `useSpendByUrlAnalytics(startDate, endDate)` over the same AEST calendar-day
 * window, grouped/summed per promotion brand (derived from `TOOLSET_LANDING_SLUGS`),
 * with `roas = revenue / spend`. The "Sync from Meta" button (recovered from the
 * legacy section) POSTs to `/api/admin/analytics/spend-by-url/sync` and invalidates
 * the `useSpendByUrlAnalytics` query on success. Clicking a prize row opens
 * `PrizePerformanceAdsModal` — a per-prize campaign → ad set → ad tree with a
 * Membership / One-time / Unclassified focus split — passing the brand's matched
 * landing URLs so the modal can pull its own per-ad detail. Presentation uses the
 * kit `Card` + `DataTable`.
 */
/** Which platforms the table is showing. "all" sums spend across every configured platform. */
type PlatformFilter = SpendByUrlPlatform | "all";

interface PrizeRow extends Record<string, unknown> {
  id: string;
  brand: string;
  logoPath: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  /** Landing URLs matched to this brand — handed to the drill-down modal on row click. */
  canonicalUrls: string[];
  /** Which platforms actually contributed to this row (drives the blended-ROAS caveat). */
  platforms: SpendByUrlPlatform[];
}

const COLUMNS: Column[] = [
  { key: "brand", label: "Prize", align: "left" },
  { key: "roas", label: "ROAS", align: "right" },
  { key: "spend", label: "Spend", align: "right" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "conversions", label: "Conversions", align: "right" },
];

/**
 * Display names for the ROAS table (logo `alt` + label). Typed against
 * `ToolsetLandingSlug` so adding a brand to `TOOLSET_LANDING_SLUGS` forces a display
 * name here at compile time — the table can't silently drift out of sync with the rest
 * of the app (this fork is exactly why HiKOKI was missing before).
 */
const BRAND_DISPLAY_NAME: Record<ToolsetLandingSlug, string> = {
  ryobi: "Ryobi",
  milwaukee: "Milwaukee",
  dewalt: "Dewalt",
  makita: "Makita",
  hikoki: "HiKOKI",
};

/**
 * Promotion brands tracked here — DERIVED from the single source of truth
 * (`TOOLSET_LANDING_SLUGS`, src/config/promo-landing-slugs.ts). Each brand's Meta ad
 * spend/revenue is matched by its `/promotions/<slug>` URL. To add a brand: add it to
 * the source of truth, ship its `/images/brands/name/<slug>Text.svg` wordmark, and add a
 * `BRAND_DISPLAY_NAME` entry — it then appears here automatically (once it has spend).
 * See docs/config-and-data: "Adding a promotion brand".
 */
const PROMOTION_BRANDS = TOOLSET_LANDING_SLUGS.map((slug) => ({
  brand: BRAND_DISPLAY_NAME[slug],
  slug,
  logoPath: `/images/brands/name/${slug}Text.svg`,
}));

/**
 * Extracts the **toolset** slug from a promotion URL: the first path segment after
 * `/promotions/`, i.e. the part before the first `-`. So `/promotions/ryobi-milwaukee`
 * (Ryobi toolset + Milwaukee toolbox) resolves to `ryobi`, NOT `milwaukee`. Matching this
 * exact segment — rather than a substring of the URL — is what guarantees each brand row
 * counts only its own toolset's spend and never folds in a `*-<brand>` toolbox suffix.
 * Returns null for non-promotion URLs (e.g. the `unknown://meta-ad/<id>` placeholder).
 */
function promotionsToolsetSlug(canonicalUrl: string): string | null {
  const match = canonicalUrl.match(/\/promotions\/([^/?#]+)/);
  return match ? match[1].toLowerCase().split("-")[0] : null;
}

export default function PrizePerformanceCard({
  dateRange,
  startDate: customStartDate,
  endDate: customEndDate,
}: {
  dateRange: DateRange;
  startDate?: string;
  endDate?: string;
}) {
  const { fmtCompact, formatNumber } = useMetricsFormatting();

  // Same date range as /admin/facebook-ads spend-by-url: AEST calendar + optional URL start/end
  const { startDate, endDate } = useMemo(
    () => resolveAestDateWindow(dateRange, customStartDate, customEndDate),
    [dateRange, customStartDate, customEndDate]
  );

  // One query per platform, never a blended server-side "all". Spend is additive and safe
  // to sum; platform-REPORTED revenue is each platform's own attribution and the same
  // purchase can be claimed by both, so the combined view labels its ROAS accordingly.
  const metaQuery = useSpendByUrlAnalytics(startDate, endDate, { platform: "meta" });
  const tiktokQuery = useSpendByUrlAnalytics(startDate, endDate, { platform: "tiktok" });

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

  const activeQueries =
    platformFilter === "meta"
      ? [metaQuery]
      : platformFilter === "tiktok"
        ? [tiktokQuery]
        : [metaQuery, tiktokQuery];

  const isLoading = activeQueries.some((q) => q.isLoading);
  // A platform that isn't configured in this environment 500s. That must not blank the
  // card when the OTHER platform has data — surface it as a note instead (below).
  const error = activeQueries.every((q) => q.error) ? activeQueries[0].error : null;
  const tiktokUnavailable = platformFilter !== "meta" && !!tiktokQuery.error;

  // Manual "Sync from Meta" (recovered from the legacy AdvertisingBreakdownSection):
  // POST the active date window, then refresh the spend-by-url query on success.
  const queryClient = useQueryClient();
  const syncMutation = useMutation({
    mutationFn: async () => {
      // Always sync a bounded RECENT window (last 14 days), regardless of the table's
      // selected range. Meta's API can't reliably pull a large span (e.g. all-time
      // ≈ 187 days) in one request — it errors/times out — and only recent days
      // actually change. The table then reflects the refreshed data.
      const until = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
      const since = formatInTimeZone(subDays(new Date(), 13), AEST_TIMEZONE, "yyyy-MM-dd");
      const res = await fetch("/api/admin/analytics/spend-by-url/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sync whatever the table is showing, so "Sync" can never refresh one platform
        // while the reader is looking at another.
        body: JSON.stringify({ startDate: since, endDate: until, platform: platformFilter }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Sync failed");
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "analytics", "spend-by-url"],
      });
    },
  });

  const canSync = !syncMutation.isPending;

  const metaRows = metaQuery.data?.rows;
  const tiktokRows = tiktokQuery.data?.rows;

  const rows = useMemo<PrizeRow[]>(() => {
    const included: Array<{ platform: SpendByUrlPlatform; rows: SpendByUrlRow[] }> = [];
    if (platformFilter !== "tiktok" && metaRows) included.push({ platform: "meta", rows: metaRows });
    if (platformFilter !== "meta" && tiktokRows) included.push({ platform: "tiktok", rows: tiktokRows });
    if (included.length === 0) return [];

    return PROMOTION_BRANDS.map((promo) => {
      // Sum every URL row whose TOOLSET segment is this brand. A platform can split spend
      // across URL variants, so the toolset landing `/promotions/<brand>` AND every
      // `/promotions/<brand>-*` prize page roll up into this one brand row. Matching the
      // toolset segment (not a substring) keeps a `*-<brand>` toolbox suffix — e.g.
      // `/promotions/ryobi-milwaukee` — counted under its toolset (Ryobi), never Milwaukee.
      let spend = 0;
      let revenue = 0;
      let conversions = 0;
      const canonicalUrls = new Set<string>();
      const platforms: SpendByUrlPlatform[] = [];

      for (const source of included) {
        const rowsForPromo = source.rows.filter(
          (r) => promotionsToolsetSlug(r.canonicalUrl) === promo.slug
        );
        if (rowsForPromo.length === 0) continue;
        platforms.push(source.platform);
        for (const r of rowsForPromo) {
          spend += r.spend;
          revenue += r.revenue;
          conversions += r.conversions;
          canonicalUrls.add(r.canonicalUrl);
        }
      }

      return {
        id: promo.slug,
        brand: promo.brand,
        logoPath: promo.logoPath,
        spend,
        revenue,
        conversions,
        roas: spend > 0 ? revenue / spend : 0,
        canonicalUrls: [...canonicalUrls],
        platforms,
      };
    }).filter((m) => m.spend > 0 || m.revenue > 0 || m.conversions > 0); // Only show rows with data
  }, [metaRows, tiktokRows, platformFilter]);

  /** True when at least one visible row actually mixes platforms — drives the ROAS caveat. */
  const hasBlendedRow = rows.some((r) => (r.platforms as SpendByUrlPlatform[]).length > 1);

  const [selectedBrand, setSelectedBrand] = useState<{
    brand: string;
    slug: string;
    canonicalUrls: string[];
    platform: SpendByUrlPlatform;
  } | null>(null);

  const platformChip = (value: PlatformFilter, label: string) => (
    <button
      type="button"
      onClick={() => setPlatformFilter(value)}
      aria-pressed={platformFilter === value}
      className={cn(
        "rounded-full px-2.5 py-1 text-2xs font-medium border transition-colors",
        platformFilter === value
          ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
          : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800"
      )}
    >
      {label}
    </button>
  );

  const renderCell = (key: string, row: PrizeRow) => {
    if (key === "brand") {
      // Logo only — the brand is already identified by its logo, so the name is
      // redundant. The brand name lives on the `alt` for accessibility.
      return (
        <div className="flex items-center min-h-[2rem]">
          <span className="relative w-20 h-7 flex items-center justify-start shrink-0">
            <Image
              src={row.logoPath}
              alt={row.brand}
              width={96}
              height={48}
              unoptimized
              className="object-contain object-left max-h-7"
              sizes="96px"
            />
          </span>
        </div>
      );
    }

    if (key === "roas") {
      return (
        <span
          className={`num text-xs sm:text-sm font-semibold ${
            row.roas >= 3
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-500"
          }`}
        >
          {row.roas.toFixed(2)}x
        </span>
      );
    }

    if (key === "spend") {
      return <span className="num text-xs sm:text-sm">{fmtCompact(row.spend)}</span>;
    }

    if (key === "revenue") {
      return <span className="num text-xs sm:text-sm">{fmtCompact(row.revenue)}</span>;
    }

    // conversions
    return <span className="num text-xs sm:text-sm">{formatNumber(row.conversions)}</span>;
  };

  return (
    <>
    <Card className="p-5">
      <SectionTitle
        title="Prize performance"
        subtitle="Spend & return by prize"
        icon={Trophy}
        right={
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={!canSync}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={
              platformFilter === "all"
                ? "Sync the latest spend & revenue from every connected platform"
                : `Sync the latest spend & revenue from ${platformFilter === "tiktok" ? "TikTok" : "Meta"}`
            }
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
          {syncMutation.error instanceof Error
            ? syncMutation.error.message
            : "Sync failed"}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {platformChip("all", "All platforms")}
        {platformChip("meta", "Meta")}
        {platformChip("tiktok", "TikTok")}
      </div>

      {tiktokUnavailable && (
        <p className="text-2xs text-neutral-500 dark:text-neutral-400 mb-3">
          TikTok isn&apos;t connected in this environment, so these figures are Meta only.
        </p>
      )}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 py-4">
          {error instanceof Error ? error.message : "Failed to load spend data"}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-4">
          Loading prize performance…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-4">
          No advertising data for promotion pages in this period.
        </p>
      ) : (
        <>
          <DataTable<PrizeRow>
            columns={COLUMNS}
            rows={rows}
            renderCell={renderCell}
            onRowClick={(row) => {
              const platforms = row.platforms as SpendByUrlPlatform[];
              setSelectedBrand({
                brand: row.brand as string,
                slug: row.id as string,
                canonicalUrls: row.canonicalUrls as string[],
                // Per-ad detail is single-platform (ad ids aren't unique across platforms).
                // Open on the row's only platform, or Meta when it mixes — the modal's own
                // chips let the reader switch.
                platform: platforms.length === 1 ? platforms[0] : "meta",
              });
            }}
          />
          {hasBlendedRow && (
            <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-3">
              Spend is the true combined total across platforms. Revenue and ROAS are each
              platform&apos;s <em>own</em> reported attribution added together — a purchase
              claimed by both Meta and TikTok is counted twice, so a blended ROAS reads high.
              Use the per-platform tabs, or the server ROAS on the Advertising card, for a
              figure you can act on.
            </p>
          )}
        </>
      )}
    </Card>
    <PrizePerformanceAdsModal
      isOpen={!!selectedBrand}
      onClose={() => setSelectedBrand(null)}
      brandLabel={selectedBrand?.brand ?? ""}
      slug={selectedBrand?.slug ?? ""}
      startDate={startDate ?? ""}
      endDate={endDate ?? ""}
      canonicalUrls={selectedBrand?.canonicalUrls ?? []}
      platform={selectedBrand?.platform ?? "meta"}
    />
    </>
  );
}
