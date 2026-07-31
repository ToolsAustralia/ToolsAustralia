"use client";

import React from "react";
import { BarChart3, Users, UserCheck, DollarSign, Layers } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent } from "./ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { formatNumber, formatCurrency, formatPercentage } from "@/utils/metrics/formatters";
import { getPrizeLabel } from "@/config/prize-summaries";
import { usePromoPageDetail } from "@/hooks/queries/usePromoPageDetail";
import UTMCampaignBreakdownTable from "@/components/admin/promo-analytics/UTMCampaignBreakdownTable";
import PrizeBuildBreakdownTable from "@/components/admin/promo-analytics/PrizeBuildBreakdownTable";

interface PromoPageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageType: string;
  slug: string;
  pageLabel: string;
  startDate: string;
  endDate: string;
  summaryFromParent?: {
    visits: number;
    signups: number;
    conversions: number;
    revenue: number;
  };
}

export default function PromoPageDetailModal({
  isOpen,
  onClose,
  pageType,
  slug,
  pageLabel,
  startDate,
  endDate,
  summaryFromParent,
}: PromoPageDetailModalProps) {
  const { data, isLoading, error } = usePromoPageDetail(
    isOpen ? pageType : null,
    isOpen ? slug : null,
    startDate,
    endDate
  );

  const summary = data?.summary ?? summaryFromParent;
  const builds = data?.buildBreakdown;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed">
      <ModalHeader
        title={`${pageLabel} — Traffic Breakdown`}
        subtitle="Which ads, emails, and channels drove traffic to this page"
        onClose={onClose}
      />
      <ModalContent className="p-4 sm:p-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4 text-red-700 dark:text-red-300">
            {(error as Error).message}
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              title="Visits"
              value={formatNumber(summary.visits)}
              icon={BarChart3}
              color="blue"
              subtitle="Page visits"
            />
            <MetricCard
              title="Signups"
              value={formatNumber(summary.signups)}
              icon={Users}
              color="purple"
              subtitle="Registrations"
            />
            <MetricCard
              title="Conversions"
              value={formatNumber(summary.conversions)}
              icon={UserCheck}
              color="emerald"
              subtitle="Purchases"
            />
            <MetricCard
              title="Revenue"
              value={formatCurrency(summary.revenue)}
              icon={DollarSign}
              color="green"
              subtitle="Total revenue"
            />
          </div>
        )}

        {/* Prize builds — what visitors actually assembled on this page */}
        <div className="bg-white dark:bg-neutral-900/70 rounded-xl shadow-lg border-2 border-indigo-100 dark:border-indigo-900/35 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-neutral-700">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-neutral-100">
              <Layers className="w-5 h-5 text-indigo-500" />
              Prize builds
            </h3>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">
              The combination each visitor ended on in &quot;Build your prize&quot;, and whether they
              changed it from what the page loads with. A visitor who landed more than once can
              appear under two combinations, so the chips below — which count people once for the
              whole page — are deliberately not the column totals.
            </p>
            {builds && (
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-sm">
                  <span className="text-gray-500 dark:text-neutral-400">Saw a combination</span>
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatNumber(builds.buildVisitors)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-sm">
                  <span className="text-gray-500 dark:text-neutral-400">Changed it</span>
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatNumber(builds.builds)}
                    {builds.buildVisitors > 0 && (
                      <span className="text-gray-500 dark:text-neutral-400 font-normal">
                        {" · "}
                        {formatPercentage(builds.buildChangeRate)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 text-sm">
                  <span className="text-indigo-700 dark:text-indigo-300">Page default</span>
                  <span className="font-semibold text-indigo-900 dark:text-indigo-200">
                    {getPrizeLabel(builds.defaultBuiltPrizeSlug) ?? builds.defaultBuiltPrizeSlug}
                  </span>
                </span>
              </div>
            )}
          </div>
          <PrizeBuildBreakdownTable
            rows={builds?.byBuild ?? []}
            loading={isLoading}
            emptyMessage="No prize builds recorded for this page in the selected period."
          />
        </div>

        {/* Campaign breakdown table */}
        <div className="bg-white dark:bg-neutral-900/70 rounded-xl shadow-lg border-2 border-red-100 dark:border-red-900/35 overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 p-4 border-b border-gray-200 dark:border-neutral-700">
            Breakdown by Ad / Email / Campaign
          </h3>
          <UTMCampaignBreakdownTable
            rows={data?.byCampaign ?? []}
            loading={isLoading}
            showSourceColumn={true}
            emptyMessage="No campaign data for this page in the selected period. Campaign links need utm_source, utm_medium, and utm_campaign in the URL."
          />
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
