"use client";

import React from "react";
import { BarChart3, Users, UserCheck, DollarSign } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent } from "./ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { formatNumber, formatCurrency } from "@/utils/metrics/formatters";
import { usePromoPageDetail } from "@/hooks/queries/usePromoPageDetail";
import UTMCampaignBreakdownTable from "@/components/admin/promo-analytics/UTMCampaignBreakdownTable";

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

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed">
      <ModalHeader
        title={`${pageLabel} — Traffic Breakdown`}
        subtitle="Which ads, emails, and channels drove traffic to this page"
        onClose={onClose}
      />
      <ModalContent className="p-4 sm:p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {(error as Error).message}
          </div>
        )}

        {/* Visits from other toolset pages */}
        {data?.visitsFrom && data.visitsFrom.length > 0 && (
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <h4 className="text-sm font-semibold text-indigo-900 mb-2">
              Visits from other landing pages
            </h4>
            <p className="text-xs text-indigo-700 mb-3">
              Users who landed on another toolset page first, then navigated here via the &quot;Explore other toolsets&quot; carousel.
            </p>
            <div className="flex flex-wrap gap-2">
              {data.visitsFrom.map(({ referrerSlug, visits }) => (
                <span
                  key={referrerSlug}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-sm font-medium text-indigo-900"
                >
                  <span className="capitalize">{referrerSlug}</span>
                  <span className="text-indigo-600">({formatNumber(visits)})</span>
                </span>
              ))}
            </div>
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

        {/* Campaign breakdown table */}
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
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
