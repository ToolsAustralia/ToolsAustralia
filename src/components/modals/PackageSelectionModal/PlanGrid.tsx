"use client";

import React from "react";
import { isOneTimeBestValuePlanId } from "@/utils/membership/additional-package-mapping";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import PlanCard from "./PlanCard";

interface PlanGridProps {
  plans: LocalMembershipPlan[];
  isCurrentPlan: (plan: LocalMembershipPlan) => boolean;
  isSelectedPlan: (plan: LocalMembershipPlan) => boolean;
  onSelect: (plan: LocalMembershipPlan) => void;
}

const PlanGrid: React.FC<PlanGridProps> = ({ plans, isCurrentPlan, isSelectedPlan, onSelect }) => {
  return (
    <div className="space-y-2 sm:space-y-3 max-w-2xl mx-auto">
      {plans.map((plan) => {
        const isMembershipTab = plan.period !== "one-time";
        // Same scheme resolution as MembershipSection's renderPlanCard.
        const colorScheme = isMembershipTab
          ? getMembershipSectionColorScheme(plan.id, true)
          : getElectricPackageColorScheme(plan.id);
        const accentHex = colorScheme.accentHex;
        const discount = isMembershipTab ? null : getAdditionalPackDiscount(plan.id);
        const showBestValueRibbon =
          (isMembershipTab && plan.id === "boss-subscription") ||
          (!isMembershipTab && isOneTimeBestValuePlanId(plan.id));
        const isCurrent = isCurrentPlan(plan);
        const isSelected = isSelectedPlan(plan);

        return (
          <PlanCard
            key={plan.id}
            plan={plan}
            colorScheme={colorScheme}
            accentHex={accentHex}
            discount={discount ? { regularPrice: discount.regularPrice, percentOff: discount.percentOff } : null}
            isCurrent={isCurrent}
            isSelected={isSelected}
            showBestValueRibbon={showBestValueRibbon}
            onClick={() => !isCurrent && onSelect(plan)}
          />
        );
      })}
    </div>
  );
};

export default PlanGrid;
