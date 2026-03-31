"use client";

import React from "react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import VerticalAccumulationChart from "@/components/ui/VerticalAccumulationChart";

export interface SubscriptionExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  entriesPerMonth: number;
  packageName?: string;
  lastMonthAccumulatedEntries: number;
  selectedPackageId?: string;
}

/**
 * One-time-per-account modal explaining how membership entries work.
 * Shown to active subscribers only (not failed-renewal). Presentational only.
 */
const SubscriptionExplainerModal: React.FC<SubscriptionExplainerModalProps> = ({
  isOpen,
  onClose,
  entriesPerMonth,
  packageName,
  lastMonthAccumulatedEntries,
  selectedPackageId,
}) => {
  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader title="How your membership entries work" onClose={onClose} />
      <ModalContent className="p-4 sm:p-6 space-y-4">
        <p className="text-gray-700 dark:text-neutral-200 text-sm sm:text-base">
          You receive{" "}
          <strong>
            {entriesPerMonth.toLocaleString()} + {lastMonthAccumulatedEntries.toLocaleString()} entries
          </strong>{" "}
          every month{packageName ? ` with your ` : ""}
          {packageName ? <strong>{packageName}</strong> : null}
          {packageName ? " membership." : "."}
        </p>
        {selectedPackageId && (
          <VerticalAccumulationChart
            selectedPackageId={selectedPackageId}
            showOnlySelectedPackage
            userAccumulation={{
              baseEntriesPerMonth: entriesPerMonth,
              lastMonthAccumulatedEntries,
            }}
          />
        )}
        {/* Billing rule: 25–27 joiners renew on 24th; source of truth: src/utils/billing/anchor-billing.ts */}
        <div className="rounded-xl border-2 border-amber-400/60 bg-amber-50 px-4 py-3 sm:px-5 sm:py-4 shadow-sm dark:border-amber-500/45 dark:bg-amber-950/40">
          <p className="text-amber-900 dark:text-amber-100 text-sm sm:text-base font-semibold leading-snug">
            If you joined on the{" "}
            <strong className="text-amber-700 dark:text-amber-300">25th, 26th, or 27th</strong>, you&apos;ll be billed on
            the <strong className="text-amber-700 dark:text-amber-300">24th of the following month</strong>.
          </p>
        </div>
        <div className="pt-2">
          <Button
            onClick={onClose}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg"
          >
            Got it
          </Button>
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default SubscriptionExplainerModal;
