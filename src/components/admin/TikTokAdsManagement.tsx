"use client";

import React from "react";
import PlatformHourlyRevenueSection from "@/components/admin/PlatformHourlyRevenueSection";
import TikTokAdBreakdownTable from "@/components/admin/TikTokAdBreakdownTable";
import { useAdminDateFilter } from "@/hooks/useAdminDateFilter";
import { AdminDateRangeToolbar } from "@/components/admin/AdminDateRangeToolbar";

/**
 * TikTok Ads analytics. Two views over the same AEST date window:
 *  1. Server-side attributed revenue by hour (from SHARED-1, convertingPlatform === "tiktok").
 *  2. Per-ad breakdown (adName + spend + TikTok-reported conversions/revenue + ROAS) from
 *     TikTokAdInsightsDaily, fed by the /api/cron/sync-tiktok-ads nightly sync — the TikTok
 *     analogue of the Meta "Ads" / Spend-by-URL breakdown.
 */
export default function TikTokAdsManagement() {
  const df = useAdminDateFilter("today");
  return (
    <div className="space-y-6">
      {/* empty:hidden — the dropdown portals to the mobile header slot, leaving this
          wrapper childless on mobile; the variant collapses it so there's no phantom gap. */}
      <div className="flex justify-end empty:hidden">
        <AdminDateRangeToolbar filter={df} />
      </div>
      <PlatformHourlyRevenueSection
        platform="tiktok"
        platformLabel="TikTok"
        startDate={df.startDate}
        endDate={df.endDate}
      />
      <TikTokAdBreakdownTable startDate={df.startDate} endDate={df.endDate} />
    </div>
  );
}
