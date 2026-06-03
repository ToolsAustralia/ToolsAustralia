"use client";

import React from "react";
import PlatformHourlyRevenueSection from "@/components/admin/PlatformHourlyRevenueSection";

/**
 * Snapchat Ads analytics. Server-side attributed revenue by hour (from SHARED-1,
 * convertingPlatform === "snapchat"). Ad spend + ROAS arrive when the Snapchat
 * Marketing-API insights sync ships (a separate follow-up spec).
 */
export default function SnapchatAdsManagement() {
  return <PlatformHourlyRevenueSection platform="snapchat" platformLabel="Snapchat" />;
}
