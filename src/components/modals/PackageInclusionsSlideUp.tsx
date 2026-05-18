"use client";

import React from "react";
import Image from "next/image";
import { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import VerticalAccumulationChart from "@/components/ui/VerticalAccumulationChart";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/utils/cn";

interface PackageInclusionsExpandedProps {
  isExpanded: boolean;
  packages: LocalMembershipPlan[];
  /** When true, shows the accumulation chart at the bottom (e.g. when toggle is on "Membership packs"). */
  showAccumulationChart?: boolean;
}

/**
 * PackageInclusionsExpanded Component
 * Inline expandable component displaying full package inclusions
 * for additional packages. Adapts to light and dark backgrounds (transparent/no background).
 */
const PackageInclusionsExpanded: React.FC<PackageInclusionsExpandedProps> = ({ isExpanded, packages, showAccumulationChart = false }) => {
  const isDark = useThemeStore((s) => s.theme === "dark");

  // Helper to get package icon - uses centralized utility with fallback logic
  const getPackageIconLocal = (planId: string) => {
    // Try direct lookup first using centralized utility
    const icon = getPackageIcon(planId);
    if (icon) return icon;

    // Try with normalized ID (lowercase) - fallback for edge cases
    const normalizedId = planId.toLowerCase();
    const normalizedIcon = getPackageIcon(normalizedId);
    if (normalizedIcon) return normalizedIcon;

    // Additional fallback: try to find by package type in centralized mapping
    if (normalizedId.includes("apprentice")) {
      return getPackageIcon("additional-apprentice-pack");
    }
    if (normalizedId.includes("tradie")) {
      return getPackageIcon("additional-tradie-pack");
    }
    if (normalizedId.includes("foreman")) {
      return getPackageIcon("additional-foreman-pack");
    }
    if (normalizedId.includes("vip")) {
      return getPackageIcon("additional-vip-pack");
    }
    if (normalizedId.includes("boss")) {
      return getPackageIcon("additional-boss-pack");
    }
    if (normalizedId.includes("power")) {
      return getPackageIcon("additional-power-pack");
    }

    return null;
  };

  if (!isExpanded) return null;

  const renderPackageCard = (plan: LocalMembershipPlan) => {
    const isMembership = showAccumulationChart; // membership-packs tab
    const lowerId = plan.id.toLowerCase();
    const colorScheme = isMembership
      ? getMembershipSectionColorScheme(plan.id, true)
      : getElectricPackageColorScheme(plan.id);
    // Same tier-colour overrides as the live cards (accent + border + heading):
    let accent = colorScheme.accentHex;
    if (isMembership && lowerId.includes("tradie")) accent = getElectricPackageColorScheme("foreman-pack").accentHex;       // membership Tradie → cyan
    else if (isMembership && lowerId.includes("boss")) accent = getElectricPackageColorScheme("power-pack").accentHex;       // membership Boss → red
    else if (!isMembership && lowerId.includes("boss")) accent = getMembershipSectionColorScheme("foreman-subscription", true).accentHex; // one-time Boss → DeWalt yellow
    const packageIcon = getPackageIconLocal(plan.id);

    return (
      <div
        key={plan.id}
        className="space-y-3 rounded-2xl p-4 sm:p-5 backdrop-blur-sm"
        style={{
          border: `2px solid ${accent}`,
          backgroundColor: isDark ? "rgba(13,14,18,0.92)" : "rgba(255,255,255,0.95)",
          boxShadow: isDark
            ? `0 0 22px ${accent}26, 0 6px 22px rgba(0,0,0,0.5)`
            : "0 4px 20px rgba(15,23,42,0.08)",
        }}
      >
        {/* Package Name with Icon - uses package accent color */}
        <div className="flex items-center gap-3">
          {packageIcon && (
            <div
              className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 relative ${getPackageIconWrapperScaleClass(plan.id, "modal")}`}
            >
              <Image
                src={packageIcon}
                alt={plan.name}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 40px, 48px"
              />
            </div>
          )}
          <h3
            className="text-xl sm:text-2xl font-bold"
            style={colorScheme.textGradientStyle ? colorScheme.textGradientStyle : { color: accent }}
          >
            {getPackageDisplayName(plan)}
          </h3>
        </div>

        {/* Features List - Vertical bullet points (dash aligned to text baseline on mobile) */}
        <ul className="space-y-2.5 pl-4 sm:pl-6">
          {plan.features.map((feature, index) => (
            <li
              key={index}
              className={cn("flex items-baseline gap-2 sm:gap-3", isDark ? "text-white/85" : "text-slate-700", "text-sm sm:text-base leading-relaxed")}
            >
              <span className={cn(isDark ? "text-white/85" : "text-slate-700", "font-bold flex-shrink-0")}>-</span>
              <span className={cn("flex-1 min-w-0", isDark ? "text-white/85" : "text-slate-700")}>{feature.text}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Membership packs: 3 cards - maximize width on desktop
  const isMembershipLayout = showAccumulationChart && packages.length <= 3;
  // One-time: 5 cards - 3 on first row, 2 centered on second row
  const isOneTimeLayout = !showAccumulationChart && packages.length === 5;

  return (
    <div className="w-full mt-4 mb-6" style={{ background: "transparent" }}>
      {isMembershipLayout ? (
        /* Membership: 3 cards - full-width grid on desktop */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-4 w-full">
          {packages.map((plan) => renderPackageCard(plan))}
        </div>
      ) : isOneTimeLayout ? (
        /* One-time: 3 on row 1, 2 centered on row 2 (desktop only) */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-4 w-full">
          {packages.slice(0, 3).map((plan) => renderPackageCard(plan))}
          <div className="flex flex-col gap-6 lg:col-span-3 lg:flex-row lg:justify-center lg:gap-4">
            {packages.slice(3, 5).map((plan) => renderPackageCard(plan))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:flex-nowrap lg:gap-4">
          {packages.map((plan) => renderPackageCard(plan))}
        </div>
      )}
      {/* Entry accumulation chart - only when membership packs tab is active */}
      {showAccumulationChart && (
        <div className="mt-6 sm:mt-8 max-w-md mx-auto">
          <VerticalAccumulationChart />
        </div>
      )}
    </div>
  );
};

export default PackageInclusionsExpanded;
