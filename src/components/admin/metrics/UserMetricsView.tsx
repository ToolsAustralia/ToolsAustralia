"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useUserMetrics } from "@/hooks/useUserMetrics";
import { AgeBreakdown } from "./users/AgeBreakdown";
import { ProfessionBreakdown } from "./users/ProfessionBreakdown";
import { StateBreakdown } from "./users/StateBreakdown";
import { AgeBreakdownTable } from "./users/AgeBreakdownTable";
import { ProfessionBreakdownTable } from "./users/ProfessionBreakdownTable";
import { StateBreakdownTable } from "./users/StateBreakdownTable";
import { MembershipPackageBreakdown } from "./users/MembershipPackageBreakdown";
import { MembershipPackageBreakdownTable } from "./users/MembershipPackageBreakdownTable";
import { ViewSwitcher } from "./shared/ViewSwitcher";
import { MetricCard } from "./shared/MetricCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, CreditCard, DollarSign, TrendingUp } from "lucide-react";

export function UserMetricsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // View mode (chart vs table) — only state we keep, persisted in the URL.
  const urlMetricsViewMode = searchParams.get("metricsViewMode") as "table" | "chart" | null;
  const [viewMode, setViewMode] = useState<"table" | "chart">(urlMetricsViewMode || "chart");

  useEffect(() => {
    const current = searchParams.get("metricsViewMode") as "table" | "chart" | null;
    if (!current) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("metricsViewMode", "chart");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setViewMode("chart");
    } else {
      setViewMode((prev) => (prev !== current ? current : prev));
    }
  }, [searchParams, pathname, router]);

  // All-time only — no date args. Service treats missing range as effectively all-time.
  const { data: aggregateData, isLoading } = useUserMetrics();

  const summary = React.useMemo(() => {
    if (!aggregateData) {
      return {
        totalUsers: 0,
        activeMemberships: 0,
        totalPurchases: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
      };
    }
    const totalUsers = Object.values(aggregateData.signupSource).reduce((sum, n) => sum + n, 0);
    const aov =
      aggregateData.purchaseHistory.totalPurchases > 0
        ? aggregateData.purchaseHistory.totalRevenue / aggregateData.purchaseHistory.totalPurchases
        : 0;
    return {
      totalUsers,
      activeMemberships: aggregateData.membershipStatus.active,
      totalPurchases: aggregateData.purchaseHistory.totalPurchases,
      totalRevenue: aggregateData.purchaseHistory.totalRevenue,
      averageOrderValue: aov,
    };
  }, [aggregateData]);

  const handleViewModeChange = (mode: "table" | "chart") => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("metricsViewMode", mode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-end">
        <ViewSwitcher
          currentView={viewMode}
          onViewChange={(mode) => handleViewModeChange(mode as "table" | "chart")}
        />
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !aggregateData ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6 text-center">
          <p className="text-gray-600 dark:text-neutral-400">No user metrics data available.</p>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              title="Total Users"
              value={summary.totalUsers.toLocaleString()}
              subtitle="All registered users"
              icon={Users}
              color="blue"
            />
            <MetricCard
              title="Active Memberships"
              value={summary.activeMemberships.toLocaleString()}
              subtitle="Currently active"
              icon={CreditCard}
              color="emerald"
            />
            <MetricCard
              title="Total Revenue"
              value={`$${summary.totalRevenue.toLocaleString("en-AU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
              subtitle="All-time revenue"
              icon={DollarSign}
              color="emerald"
            />
            <MetricCard
              title="Average Order Value"
              value={`$${summary.averageOrderValue.toLocaleString("en-AU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
              subtitle="Per purchase"
              icon={TrendingUp}
              color="purple"
            />
          </div>

          {/* Chart vs Table content */}
          {viewMode === "chart" ? (
            <div className="space-y-6">
              <MembershipPackageBreakdown data={aggregateData.membershipByPackage} />
              <AgeBreakdown data={aggregateData.ageGroup} />
              <StateBreakdown data={aggregateData.state} />
              <ProfessionBreakdown data={aggregateData.profession} />
            </div>
          ) : (
            <div className="space-y-6">
              <MembershipPackageBreakdownTable data={aggregateData.membershipByPackage} />
              <AgeBreakdownTable data={aggregateData.ageGroup} />
              <StateBreakdownTable data={aggregateData.state} />
              <ProfessionBreakdownTable data={aggregateData.profession} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
