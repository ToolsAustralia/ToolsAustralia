"use client";

import React from "react";
import PlatformHourlyRevenueSection from "@/components/admin/PlatformHourlyRevenueSection";
import { useAdminDateFilter } from "@/hooks/useAdminDateFilter";
import { AdminDateRangeToolbar } from "@/components/admin/AdminDateRangeToolbar";

/**
 * TikTok Ads analytics. Server-side attributed revenue by hour (from SHARED-1,
 * convertingPlatform === "tiktok"). Ad spend + ROAS arrive when the TikTok
 * Marketing-API insights sync ships. Owns the AEST date window and passes it
 * to the shared hourly section.
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
    </div>
  );
}
