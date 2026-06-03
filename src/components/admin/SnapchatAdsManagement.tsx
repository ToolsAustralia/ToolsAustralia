"use client";

import React from "react";
import PlatformHourlyRevenueSection from "@/components/admin/PlatformHourlyRevenueSection";
import { useAdminDateFilter } from "@/hooks/useAdminDateFilter";
import { AdminDateRangeToolbar } from "@/components/admin/AdminDateRangeToolbar";

/**
 * Snapchat Ads analytics. Server-side attributed revenue by hour (from SHARED-1,
 * convertingPlatform === "snapchat"). Ad spend + ROAS arrive when the Snapchat
 * Marketing-API insights sync ships. Owns the AEST date window and passes it
 * to the shared hourly section.
 */
export default function SnapchatAdsManagement() {
  const df = useAdminDateFilter("today");
  return (
    <div className="space-y-6">
      {/* empty:hidden — the dropdown portals to the mobile header slot, leaving this
          wrapper childless on mobile; the variant collapses it so there's no phantom gap. */}
      <div className="flex justify-end empty:hidden">
        <AdminDateRangeToolbar filter={df} />
      </div>
      <PlatformHourlyRevenueSection
        platform="snapchat"
        platformLabel="Snapchat"
        startDate={df.startDate}
        endDate={df.endDate}
      />
    </div>
  );
}
