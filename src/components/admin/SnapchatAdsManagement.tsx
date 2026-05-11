"use client";

import React from "react";
import { TrendingUp, DollarSign, BarChart3, Target } from "lucide-react";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";

/**
 * Empty-state shell for Snapchat Ads analytics.
 * See TikTokAdsManagement comment — same story until Snapchat Marketing API sync ships.
 */
export default function SnapchatAdsManagement() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-center">
        <p className="text-sm text-gray-500 dark:text-neutral-400">Insights sync not yet configured.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Ad Spend" value="—" icon={DollarSign} />
        <MetricCard title="Revenue" value="—" icon={TrendingUp} color="emerald" />
        <MetricCard title="Conversions" value="—" icon={Target} color="purple" />
        <MetricCard title="ROAS" value="—" icon={BarChart3} color="indigo" />
      </div>
    </div>
  );
}
