"use client";

import ElectricPackageCard from "@/components/sections/membership/ElectricPackageCard";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { isOneTimeBestValuePlanId } from "@/utils/membership/additional-package-mapping";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { cn } from "@/utils/cn";

interface OneTimePacksGridProps {
  /** One-time plans — expected to be the access-aware set (Additional variants for
   *  members, public packs otherwise; see useMembershipCardCta), so no card is "locked". */
  plans: LocalMembershipPlan[];
  onSelect: (plan: LocalMembershipPlan) => void;
  /** CTA text on each card. Defaults to "Enter Now" (matches the /membership section). */
  ctaLabel?: string;
  className?: string;
}

/**
 * One-time packages rendered with the SAME `ElectricPackageCard` styling the public
 * `/membership` section uses — mirrors `MembershipSection.renderPlanCard`'s one-time
 * mapping (electric colour scheme + additional-pack discount tag + best-value ribbon +
 * the raised-icon `pt-8` wrapper). Reused on the dashboard so the one-time packs look
 * identical to the marketing page instead of the old compact scroll cards.
 */
export default function OneTimePacksGrid({ plans, onSelect, ctaLabel = "Enter Now", className }: OneTimePacksGridProps) {
  if (plans.length === 0) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-2", className)}>
      {plans.map((plan) => {
        const colorScheme = getElectricPackageColorScheme(plan.id);
        const discount = getAdditionalPackDiscount(plan.id);
        return (
          <div key={plan.id} className="overflow-visible px-1 pt-9 sm:pt-11">
            <ElectricPackageCard
              plan={plan}
              colorScheme={colorScheme}
              state={{ locked: false, isCurrent: false }}
              discount={discount ? { regularPrice: discount.regularPrice, percentOff: discount.percentOff } : null}
              onSelect={onSelect}
              showBestValue={isOneTimeBestValuePlanId(plan.id)}
              ribbon={plan.isPopular ? "MOST POPULAR" : null}
              ctaLabel={ctaLabel}
              theme="light"
            />
          </div>
        );
      })}
    </div>
  );
}
