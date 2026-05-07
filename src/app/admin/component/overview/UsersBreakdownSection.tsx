"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import DashboardSection from "./DashboardSection";
import { AgeBreakdownTable } from "@/components/admin/metrics/users/AgeBreakdownTable";
import { ProfessionBreakdownTable } from "@/components/admin/metrics/users/ProfessionBreakdownTable";
import { useUserMetrics } from "@/hooks/useUserMetrics";

interface UsersBreakdownSectionProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function UsersBreakdownSection({
  isExpanded,
  onToggleExpand,
}: UsersBreakdownSectionProps) {
  const { data, isLoading } = useUserMetrics({ enabled: isExpanded });

  return (
    <DashboardSection
      title="Users Breakdown"
      subtitle="Age groups and professions across all users"
      collapsible
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      className="shadow-md"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-5 sm:py-6 text-gray-500 dark:text-neutral-400 text-xs sm:text-sm">
          <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mr-2 shrink-0" />
          <span>Loading breakdown…</span>
        </div>
      )}

      {!isLoading && data && (
        <div className="space-y-4 sm:space-y-6">
          <AgeBreakdownTable data={data.ageGroup} purchasedData={data.ageGroupPurchased} />
          <ProfessionBreakdownTable data={data.profession} />
        </div>
      )}

      {!isLoading && !data && (
        <p className="text-gray-600 dark:text-neutral-400 text-center py-6 text-sm">
          No breakdown data available.
        </p>
      )}
    </DashboardSection>
  );
}
