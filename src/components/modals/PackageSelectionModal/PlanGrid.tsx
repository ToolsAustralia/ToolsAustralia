"use client";

import React from "react";
import {
  isBossSubscriptionPlanId,
  isForemanSubscriptionPlanId,
  isOneTimeBestValuePlanId,
} from "@/utils/membership/additional-package-mapping";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPackageById } from "@/data/membershipPackages";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/utils/cn";
import PackageTile, { type PackageTileRibbon } from "../PackageTile";

interface PlanGridProps {
  plans: LocalMembershipPlan[];
  isCurrentPlan: (plan: LocalMembershipPlan) => boolean;
  isSelectedPlan: (plan: LocalMembershipPlan) => boolean;
  onSelect: (plan: LocalMembershipPlan) => void;
}

/** Reads the entries figure out of the plan's feature list (mirrors ElectricPackageCard). */
function readEntries(plan: LocalMembershipPlan): { display: number; was: number | null } {
  const feature = plan.features.find((f) => /entries/i.test(f.text));
  const base = feature ? parseInt(feature.text.match(/(\d+)/)?.[1] ?? "0", 10) : 0;
  const multiplier = typeof plan.metadata?.promoMultiplier === "number" ? plan.metadata.promoMultiplier : 0;
  if (multiplier > 1) {
    return {
      display: (plan.metadata?.entriesCount as number) ?? base,
      was: (plan.metadata?.originalEntries as number) ?? Math.floor(base / multiplier),
    };
  }
  return { display: (plan.metadata?.entriesCount as number) || base, was: null };
}

const PlanGrid: React.FC<PlanGridProps> = ({ plans, isCurrentPlan, isSelectedPlan, onSelect }) => {
  const isNarrow = useMediaQuery("(max-width: 639px)");

  // The membership tab holds exactly three tiers, which in a 2-column grid strands one on
  // a row by itself. Stacking them reads as a deliberate ladder (Tradie → Foreman → Boss)
  // rather than a grid with a hole in it. The one-time tab has six packs and stays 2-up.
  const singleColumn = plans.length > 0 && plans.every((p) => p.period !== "one-time");

  // Compact on every narrow viewport, including the single-column membership tab.
  //
  // This previously excluded single-column tiles, on the reasoning that a full-width tile
  // has room for the comfortable treatment. That optimised WIDTH and ignored HEIGHT: three
  // comfortable tiles stacked ran well past the modal's scroll height, so only ~1.5 tiers
  // were visible at once where production showed all three. On a phone the constraint that
  // matters is vertical, so narrow always means compact.
  const compact = isNarrow;

  return (
    // Fixed column count, not `auto-fit minmax(...)`: auto-fit let the count drift with the
    // modal width, so the same tile changed size between breakpoints.
    <div
      className={cn(
        "grid items-stretch gap-2.5 sm:gap-3.5",
        singleColumn ? "grid-cols-1" : "grid-cols-2"
      )}
    >
      {plans.map((plan) => {
        const isMembershipTab = plan.period !== "one-time";
        // Same scheme resolution as MembershipSection's renderPlanCard.
        const colorScheme = isMembershipTab
          ? getMembershipSectionColorScheme(plan.id, true)
          : getElectricPackageColorScheme(plan.id);
        const discount = isMembershipTab ? null : getAdditionalPackDiscount(plan.id);
        // `plan.id` for a subscription is the slugified package NAME ("boss"), not the catalog
        // `_id` ("boss-subscription") — a literal comparison never matches.
        const ribbon: PackageTileRibbon | null = isMembershipTab
          ? isBossSubscriptionPlanId(plan.id)
            ? "best-value"
            : isForemanSubscriptionPlanId(plan.id)
              ? "recommended"
              : null
          : isOneTimeBestValuePlanId(plan.id)
            ? "best-value"
            : plan.isPopular
              ? "popular"
              : null;

        const entries = readEntries(plan);
        const staticPkg = getPackageById(plan.id);
        // Subscriptions are lifecycle-gated (access lasts while subscribed), so they carry
        // partnerDiscountDays: 0 — only one-time packs get a day window in the caption.
        const days = staticPkg?.partnerDiscountDays ?? 0;
        // One phrase at both densities — compact fits it by shrinking the type (7.5px in
        // PackageTile) rather than abbreviating, so the caption never changes meaning
        // between breakpoints.
        const accessCaption =
          isMembershipTab || days <= 0
            ? "partner discount access"
            : `${days}-day discount access`;

        return (
          <PackageTile
            // Period is in the key so switching tabs remounts the tiles, which replays the
            // ribbon's attention pop. Relying on the ids differing between tabs would work
            // today but breaks silently the moment a one-time and a membership plan share
            // an id.
            key={`${plan.period}-${plan.id}`}
            planId={plan.id}
            name={getPackageDisplayName(plan)}
            accentHex={colorScheme.accentHex}
            entries={entries.display}
            wasEntries={entries.was}
            promoActive={Boolean(plan.metadata?.isPromoActive)}
            multiplier={plan.metadata?.promoMultiplier as number | undefined}
            accessPct={getPartnerCatalogAccessPercentForPlanId(plan.id)}
            accessCaption={accessCaption}
            price={plan.price}
            // Modals say "Per Giveaway"; the landing/section cards say "per month · cancel
            // anytime". By the modal the visitor is buying, and what matters is which draw
            // the payment buys into. /terms defines the two as equivalent.
            periodLabel={plan.period === "one-time" ? "One Time" : "Per Giveaway"}
            struckPrice={discount ? discount.regularPrice : null}
            discountPercent={discount ? discount.percentOff : null}
            ribbon={ribbon}
            isSelected={isSelectedPlan(plan)}
            isCurrent={isCurrentPlan(plan)}
            compact={compact}
            // Stats + footer side by side, so three stacked tiers fit without scrolling.
            wide={singleColumn}
            onSelect={() => onSelect(plan)}
          />
        );
      })}
    </div>
  );
};

export default PlanGrid;
