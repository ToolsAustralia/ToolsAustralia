"use client";

import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getPackageColorSchemeForPromo } from "@/utils/package-colors/packageColorScheme";
import type { PackageColorsVariantConfig } from "@/utils/package-colors/packageColorScheme";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";

/** When set (e.g. in my-account explainer), chart shows user's actual accumulation from lastMonthAccumulatedEntries; multiplier is not applied and promo badge is hidden. */
export interface UserAccumulationInput {
  baseEntriesPerMonth: number;
  lastMonthAccumulatedEntries: number;
}

interface VerticalAccumulationChartProps {
  selectedPackageId?: string;
  /** When true, show only the selected package (e.g. in explainer modal). Default false. */
  showOnlySelectedPackage?: boolean;
  /** When set, use this for the selected package: month1 = lastMonthAccumulatedEntries, month2/3 = + baseEntriesPerMonth. Multiplier and promo badge are hidden. */
  userAccumulation?: UserAccumulationInput;
}

// Package data for the 3 main subscription packages
const packages = [
  {
    id: "tradie-subscription",
    name: "Tradie",
    baseEntries: 15,
  },
  {
    id: "foreman-subscription",
    name: "Foreman",
    baseEntries: 40,
  },
  {
    id: "boss-subscription",
    name: "Boss",
    baseEntries: 100,
  },
];

// Map MembershipSection package colors to chart format (vertical bars)
// Uses membership tab mapping: tradie=Kincrome, foreman=Ryobi, boss=Black
// barGradientCss uses inline styles because Tailwind doesn't scan utils/ for arbitrary classes
function getChartColorScheme(packageId: string, variantConfig?: PackageColorsVariantConfig) {
  const scheme = getPackageColorSchemeForPromo(packageId, true, variantConfig);
  return {
    barGradientCss:
      scheme.barGradientCss ?? "linear-gradient(to top, #475569 0%, #64748b 50%, #475569 100%)",
    text: scheme.text,
    border: scheme.border,
    accentHex: scheme.accentHex,
  };
}

/**
 * Calculate accumulated entries for a package
 */
function calculateAccumulation(baseEntries: number, promoMultiplier: number = 1) {
  const month1 = baseEntries * promoMultiplier;
  const month2 = month1 + baseEntries;
  const month3 = month2 + baseEntries;
  return { month1, month2, month3 };
}

export default function VerticalAccumulationChart({
  selectedPackageId,
  showOnlySelectedPackage = false,
  userAccumulation,
}: VerticalAccumulationChartProps) {
  const { variantConfig } = useVariantContext();
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const promoMultiplier = resolvedMembershipMultiplier ?? 1;

  const packagesToShow =
    showOnlySelectedPackage && selectedPackageId
      ? packages.filter((p) => p.id === selectedPackageId)
      : packages;

  // When userAccumulation is provided (e.g. explainer modal), use the user's lastMonthAccumulatedEntries so the chart accurately shows what they will get in 3 months; no multiplier.
  const useUserData =
    !!userAccumulation && !!selectedPackageId && packagesToShow.some((p) => p.id === selectedPackageId);

  // Calculate data for packages to display
  const packageData = packagesToShow.map((pkg) => {
    const isSelected = selectedPackageId === pkg.id;
    const accumulation =
      useUserData && isSelected && userAccumulation
        ? {
            month1: userAccumulation.lastMonthAccumulatedEntries,
            month2: userAccumulation.lastMonthAccumulatedEntries + userAccumulation.baseEntriesPerMonth,
            month3:
              userAccumulation.lastMonthAccumulatedEntries + 2 * userAccumulation.baseEntriesPerMonth,
          }
        : calculateAccumulation(pkg.baseEntries, useUserData ? 1 : promoMultiplier);
    const colorScheme = getChartColorScheme(pkg.id, variantConfig);

    return {
      ...pkg,
      ...accumulation,
      colorScheme,
      isSelected,
    };
  });

  // Find max value for scaling
  const maxValue =
    packageData.length > 0
      ? Math.max(...packageData.map((pkg) => Math.max(pkg.month1, pkg.month2, pkg.month3)))
      : 1;
  // Use padded scale for bar heights so the tallest bar doesn't reach 100% and the value
  // label above it doesn't overlap the "3rd Month" header (single-package / explainer case).
  const scaleMax = maxValue * 1.2;

  return (
    <div className="w-full">
      {/* Chart Title - Outside Chart Container */}
      <div className="text-center mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg lg:text-xl font-bold text-black font-['Poppins']">
          Entry Accumulation Over Time
        </h3>
        <p className="text-xs sm:text-sm text-gray-400 font-['Poppins'] mt-1">
          See how entries accumulate month by month
        </p>
      </div>

      {/* Chart Container - Matching modal background */}
      <div
        className="relative rounded-xl p-3 sm:p-4 pt-8 sm:pt-10 border border-slate-700/30 shadow-[0_0_15px_rgba(0,0,0,0.4)]"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        }}
      >
        {/* Month Titles - Inside Chart Container */}
        <div className="absolute top-2 sm:top-3 left-8 sm:left-10 right-0 flex items-center justify-center gap-4 sm:gap-8 z-20">
          <div className="flex-1 flex justify-center max-w-[80px] sm:max-w-[100px]">
            <div className="text-[10px] sm:text-[12px] font-semibold text-white font-['Poppins'] whitespace-nowrap">
              Current Month
            </div>
          </div>
          <div className="flex-1 flex justify-center max-w-[80px] sm:max-w-[100px]">
            <div className="text-[10px] sm:text-[12px] font-semibold text-white font-['Poppins'] whitespace-nowrap">
              Next Month
            </div>
          </div>
          <div className="flex-1 flex justify-center max-w-[80px] sm:max-w-[100px]">
            <div className="text-[10px] sm:text-[12px] font-semibold text-white font-['Poppins'] whitespace-nowrap">
              Following Month
            </div>
          </div>
        </div>

        {/* Chart Area */}
        <div className="relative h-[200px] sm:h-[250px] lg:h-[300px] mt-2 sm:mt-3">
          {/* Y-Axis Labels */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[8px] sm:text-[10px] text-gray-500 font-['Poppins'] pr-2 z-10">
            <span>{maxValue.toLocaleString()}</span>
            <span>{Math.round(maxValue * 0.75).toLocaleString()}</span>
            <span>{Math.round(maxValue * 0.5).toLocaleString()}</span>
            <span>{Math.round(maxValue * 0.25).toLocaleString()}</span>
            <span>0</span>
          </div>

          {/* Y-Axis Line */}
          <div className="absolute left-8 sm:left-10 top-0 bottom-0 w-px bg-slate-600/20"></div>

          {/* Chart Columns */}
          <div className="absolute left-8 sm:left-10 right-0 bottom-0 flex items-end justify-center gap-4 sm:gap-8 h-full">
            {/* 1st Month Column */}
            <div className="flex-1 flex flex-col items-center max-w-[80px] sm:max-w-[100px] h-full relative">
              <div className="flex items-end justify-center gap-1 sm:gap-1.5 w-full h-full">
                {packageData.map((pkg) => {
                  const barHeight = (pkg.month1 / scaleMax) * 100;
                  return (
                    <div key={`${pkg.id}-month1`} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full rounded-t relative border-2 ${
                          pkg.isSelected
                            ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.8)] scale-105"
                            : ""
                        }`}
                        style={{
                          height: `${barHeight}%`,
                          minHeight: "20px",
                          background: pkg.colorScheme.barGradientCss,
                          borderColor: `${pkg.colorScheme.accentHex}80`,
                        }}
                      >
                        {/* Value Label on Bar */}
                        <div className="absolute -top-5 sm:-top-6 left-1/2 transform -translate-x-1/2 text-[8px] sm:text-[10px] font-bold text-white font-['Poppins'] whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                          {pkg.month1.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2nd Month Column */}
            <div className="flex-1 flex flex-col items-center max-w-[80px] sm:max-w-[100px] h-full relative">
              <div className="flex items-end justify-center gap-1 sm:gap-1.5 w-full h-full">
                {packageData.map((pkg) => {
                  const barHeight = (pkg.month2 / scaleMax) * 100;
                  return (
                    <div key={`${pkg.id}-month2`} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full rounded-t relative border-2 ${
                          pkg.isSelected
                            ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.8)] scale-105"
                            : ""
                        }`}
                        style={{
                          height: `${barHeight}%`,
                          minHeight: "20px",
                          background: pkg.colorScheme.barGradientCss,
                          borderColor: `${pkg.colorScheme.accentHex}80`,
                        }}
                      >
                        {/* Value Label on Bar */}
                        <div className="absolute -top-5 sm:-top-6 left-1/2 transform -translate-x-1/2 text-[8px] sm:text-[10px] font-bold text-white font-['Poppins'] whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                          {pkg.month2.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3rd Month Column */}
            <div className="flex-1 flex flex-col items-center max-w-[80px] sm:max-w-[100px] h-full relative">
              <div className="flex items-end justify-center gap-1 sm:gap-1.5 w-full h-full">
                {packageData.map((pkg) => {
                  const barHeight = (pkg.month3 / scaleMax) * 100;
                  return (
                    <div key={`${pkg.id}-month3`} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full rounded-t relative border-2 ${
                          pkg.isSelected
                            ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.8)] scale-105"
                            : ""
                        }`}
                        style={{
                          height: `${barHeight}%`,
                          minHeight: "20px",
                          background: pkg.colorScheme.barGradientCss,
                          borderColor: `${pkg.colorScheme.accentHex}80`,
                        }}
                      >
                        {/* Value Label on Bar */}
                        <div className="absolute -top-5 sm:-top-6 left-1/2 transform -translate-x-1/2 text-[8px] sm:text-[10px] font-bold text-white font-['Poppins'] whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                          {pkg.month3.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* X-Axis Base Line */}
        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-600/20">
          {/* Package Legend */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
            {packageData.map((pkg) => (
              <div key={pkg.id} className={`flex items-center gap-1.5 sm:gap-2 ${pkg.isSelected ? "scale-110" : ""}`}>
                <div
                  className={`w-3 h-3 sm:w-4 sm:h-4 rounded ${pkg.isSelected ? "ring-2 ring-yellow-400" : ""}`}
                  style={{ background: pkg.colorScheme.barGradientCss }}
                ></div>
                <span
                  className={`text-[10px] sm:text-[12px] font-semibold font-['Poppins'] ${
                    pkg.isSelected ? "text-yellow-400" : ""
                  }`}
                  style={pkg.isSelected ? undefined : { color: pkg.colorScheme.accentHex }}
                >
                  {pkg.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Promo Badge - hidden when chart uses user's own accumulation (explainer) to avoid confusion */}
        {promoMultiplier > 1 && !userAccumulation && (
          <div className="mt-1 text-center">
            <div className="inline-flex items-center gap-1.5 bg-yellow-400/20 border border-yellow-400/30 rounded-full px-2.5 py-1">
              <span className="text-yellow-400 text-[10px] sm:text-[12px] font-bold font-['Poppins']">
                ⚡ {promoMultiplier}x Promo Active
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
