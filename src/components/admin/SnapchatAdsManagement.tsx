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
      {/* Direct child, NOT wrapped: the toolbar is sticky on desktop and a wrapper sized to
          the control would be the only box it could travel within — pinning it to nothing. */}
      <AdminDateRangeToolbar filter={df} />
      <PlatformHourlyRevenueSection
        platform="snapchat"
        platformLabel="Snapchat"
        startDate={df.startDate}
        endDate={df.endDate}
      />
    </div>
  );
}
