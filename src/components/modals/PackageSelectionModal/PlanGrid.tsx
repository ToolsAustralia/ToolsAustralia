"use client";

import React from "react";
import { isOneTimeBestValuePlanId } from "@/utils/membership/member-package-mapping";
import { getPackageColorSchemeForPromo } from "@/utils/package-colors/packageColorScheme";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import PlanCard from "./PlanCard";

interface PlanGridProps {
  plans: LocalMembershipPlan[];
  isCurrentPlan: (plan: LocalMembershipPlan) => boolean;
  isSelectedPlan: (plan: LocalMembershipPlan) => boolean;
  onSelect: (plan: LocalMembershipPlan) => void;
}

const PlanGrid: React.FC<PlanGridProps> = ({ plans, isCurrentPlan, isSelectedPlan, onSelect }) => {
  const { variantConfig } = useVariantContext();

  return (
    <div className="space-y-2 sm:space-y-3 max-w-2xl mx-auto">
      {plans.map((plan) => {
        const isMembershipTab = plan.period !== "one-time";
        const colorScheme = getPackageColorSchemeForPromo(plan.id, isMembershipTab, variantConfig);
        const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
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
