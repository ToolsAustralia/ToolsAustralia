"use client";

import React from "react";
import PlatformHourlyRevenueSection from "@/components/admin/PlatformHourlyRevenueSection";

/**
 * TikTok Ads analytics. Server-side attributed revenue by hour (from SHARED-1,
 * convertingPlatform === "tiktok"). Ad spend + ROAS arrive when the TikTok
 * Marketing-API insights sync ships (a separate follow-up spec).
 */
export default function TikTokAdsManagement() {
  return <PlatformHourlyRevenueSection platform="tiktok" platformLabel="TikTok" />;
}
