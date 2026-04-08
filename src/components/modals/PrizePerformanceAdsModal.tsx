"use client";

import React from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent } from "@/components/modals/ui";
import { useSpendByUrlDetailMany } from "@/hooks/queries/useSpendByUrlAnalytics";
import SpendByUrlAdBreakdownTable from "@/components/admin/spend-by-url/SpendByUrlAdBreakdownTable";

export interface PrizePerformanceAdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandLabel: string;
  slug: string;
  startDate: string;
  endDate: string;
  canonicalUrls: string[];
}

function formatRangeLabel(startDate: string, endDate: string): string {
  try {
    const start = format(new Date(`${startDate}T12:00:00`), "MMM d, yyyy");
    const end = format(new Date(`${endDate}T12:00:00`), "MMM d, yyyy");
    return start === end ? start : `${start} – ${end}`;
  } catch {
    return "";
  }
}

export default function PrizePerformanceAdsModal({
  isOpen,
  onClose,
  brandLabel,
  slug: _slug,
  startDate,
  endDate,
  canonicalUrls,
}: PrizePerformanceAdsModalProps) {
  const { data, isLoading, error } = useSpendByUrlDetailMany(
    canonicalUrls,
    startDate,
    endDate,
    { enabled: isOpen && canonicalUrls.length > 0 }
  );

  const rangeLabel = formatRangeLabel(startDate, endDate);
  const urlCount = canonicalUrls.length;

  const subtitle = (() => {
    if (canonicalUrls.length === 0) {
      return "No landing URLs for this prize in this period";
    }
    if (isLoading) {
      return `Loading ads… · ${urlCount} landing URL${urlCount === 1 ? "" : "s"}${rangeLabel ? ` · ${rangeLabel}` : ""}`;
    }
    const count = data?.rows?.length ?? 0;
    return `${count.toLocaleString()} ad${count === 1 ? "" : "s"} · ${urlCount} landing URL${urlCount === 1 ? "" : "s"}${rangeLabel ? ` · ${rangeLabel}` : ""}`;
  })();

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1100px]">
      <ModalHeader title={`${brandLabel} — ad breakdown`} subtitle={subtitle} onClose={onClose} />
      <ModalContent>
        {canonicalUrls.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            No matching promotion URLs were found for this period.
          </p>
        )}
        {error && canonicalUrls.length > 0 && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : "Failed to load ads"}
          </p>
        )}
        {isLoading && canonicalUrls.length > 0 && (
          <div className="flex items-center justify-center py-12 text-gray-500 dark:text-neutral-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin shrink-0" aria-hidden />
            <span>Loading ads…</span>
          </div>
        )}
        {!isLoading && !error && canonicalUrls.length > 0 && data?.rows && (
          <SpendByUrlAdBreakdownTable
            rows={data.rows}
            showSearch
            density="comfortable"
            ariaLabel={`Ads for ${brandLabel}`}
          />
        )}
      </ModalContent>
    </ModalContainer>
  );
}
