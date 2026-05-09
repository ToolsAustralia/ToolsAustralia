"use client";

import React from "react";
import BenefitCountdown from "@/components/ui/BenefitCountdown";

export interface PendingChangeBannerProps {
  effectiveDate: Date;
  changeType: "upgrade" | "downgrade";
  currentBenefits: {
    packageName: string;
    accumulatedEntries: number;
    partnerDiscountAccessPercent: number;
    partnerDiscountDays: number;
  };
  newBenefits: {
    packageName: string;
    accumulatedEntries: number;
    partnerDiscountAccessPercent: number;
    partnerDiscountDays: number;
  };
  onExpired?: () => void;
}

/**
 * Pending plan-change countdown banner. Thin wrapper over `BenefitCountdown`
 * so the orchestrator only deals with a single section element rather than
 * importing UI primitives directly.
 */
const PendingChangeBanner: React.FC<PendingChangeBannerProps> = (props) => {
  return <BenefitCountdown {...props} />;
};

export default PendingChangeBanner;
