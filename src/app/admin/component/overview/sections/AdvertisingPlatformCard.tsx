"use client";

import { TrendingUp } from "lucide-react";
import {
  Card,
  SectionTitle,
  DataTable,
  PlatformLogo,
  type Column,
  type PlatformLogoName,
} from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";

/**
 * Advertising spend & return by platform for the admin Overview.
 *
 * Facebook Ads is LIVE (`stats.facebookAds.spend` / `.roas`); TikTok, Snapchat
 * (ads) and Klaviyo Email / SMS (marketing — no ad spend) are "Coming soon"
 * placeholder rows. Pure presentation over the `useAdminDashboardStats` result
 * passed down from `DashboardOverview`. The blended ROAS in the header equals the
 * Facebook ROAS (only live platform). The stats payload has no revenue field, so
 * Facebook revenue is derived as `spend * roas`. Rows carry a `comingSoon` flag
 * and numeric placeholders so the `DataTable` row type stays uniform; `renderCell`
 * decides display per-row. Platform logos are inline SVGs (see `PlatformLogos`) —
 * official logo files can be dropped in later to replace them.
 */
interface AdRow extends Record<string, unknown> {
  id: string;
  platform: string;
  logo: PlatformLogoName;
  spend: number;
  revenue: number;
  roas: number;
  comingSoon: boolean;
}

const COLUMNS: Column[] = [
  { key: "platform", label: "Platform", align: "left", sortable: false },
  { key: "spend", label: "Spend", align: "right", sortable: false },
  { key: "revenue", label: "Revenue", align: "right", sortable: false },
  { key: "roas", label: "ROAS", align: "right", sortable: false },
];

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

  const fbSpend = stats?.facebookAds?.spend ?? 0;
  const fbRoas = stats?.facebookAds?.roas ?? 0;
  // No revenue in the stats payload — derive it. Revenue = spend * ROAS.
  const fbRevenue = fbSpend > 0 ? fbSpend * fbRoas : 0;

  const rows: AdRow[] = [
    {
      id: "facebook",
      platform: "Facebook Ads",
      logo: "facebook",
      spend: fbSpend,
      revenue: fbRevenue,
      roas: fbRoas,
      comingSoon: false,
    },
    {
      id: "tiktok",
      platform: "TikTok Ads",
      logo: "tiktok",
      spend: 0,
      revenue: 0,
      roas: 0,
      comingSoon: true,
    },
    {
      id: "snapchat",
      platform: "Snapchat Ads",
      logo: "snapchat",
      spend: 0,
      revenue: 0,
      roas: 0,
      comingSoon: true,
    },
    {
      id: "klaviyo-email",
      platform: "Klaviyo Email",
      logo: "klaviyo",
      spend: 0,
      revenue: 0,
      roas: 0,
      comingSoon: true,
    },
    {
      id: "klaviyo-sms",
      platform: "Klaviyo SMS",
      logo: "klaviyo",
      spend: 0,
      revenue: 0,
      roas: 0,
      comingSoon: true,
    },
  ];

  const renderCell = (key: string, row: AdRow) => {
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
      if (row.comingSoon) {
        return (
          <span className="text-2xs text-amber-600/80 dark:text-amber-500/80 font-medium">
            Coming soon
          </span>
        );
      }
      return <span className="font-semibold num">{fmtCompact(row.spend)}</span>;
    }

    if (key === "revenue") {
      if (row.comingSoon) {
        return <span className="text-neutral-300 dark:text-neutral-600">—</span>;
      }
      return (
        <span className="font-semibold num">{fmtCompact(row.revenue)}</span>
      );
    }

    // roas
    if (row.comingSoon) {
      return <span className="text-neutral-300 dark:text-neutral-600">—</span>;
    }
    return (
      <span
        className={`num font-semibold ${
          row.roas >= 3
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-500"
        }`}
      >
        {row.roas.toFixed(2)}x
      </span>
    );
  };

  return (
    <Card className="p-5 h-full min-w-0">
      <SectionTitle
        title="Advertising"
        subtitle="Spend & return by platform"
        icon={TrendingUp}
        right={
          <div className="text-right">
            <p className="text-2xs text-neutral-400 uppercase tracking-wide">
              Blended ROAS
            </p>
            {showSkeleton ? (
              <span className="mt-1 inline-block h-5 w-12 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
            ) : (
              <p className="font-display font-bold text-lg text-emerald-600 dark:text-emerald-400 num">
                {fbRoas.toFixed(2)}x
              </p>
            )}
          </div>
        }
      />
      <DataTable<AdRow> columns={COLUMNS} rows={rows} renderCell={renderCell} />
    </Card>
  );
}
