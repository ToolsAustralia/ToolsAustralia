"use client";

import { usePromoByType } from "@/hooks/queries/usePromoQueries";

interface VerticalAccumulationChartProps {
  selectedPackageId?: string;
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

// Helper function to get package color scheme - matching PackageSelectionModal colors
const getPackageColorScheme = (packageId: string) => {
  if (packageId.includes("tradie")) {
    return {
      barColor: "bg-gradient-to-t from-blue-600 via-blue-500 to-cyan-600",
      barColorLight: "bg-gradient-to-t from-blue-500 via-blue-400 to-cyan-500",
      text: "text-blue-400",
      border: "border-blue-500/50",
    };
  } else if (packageId.includes("foreman")) {
    return {
      barColor: "bg-gradient-to-t from-emerald-400 via-emerald-500 to-green-500",
      barColorLight: "bg-gradient-to-t from-emerald-300 via-emerald-400 to-green-400",
      text: "text-emerald-400",
      border: "border-emerald-500/50",
    };
  } else if (packageId.includes("boss")) {
    return {
      barColor: "bg-gradient-to-t from-yellow-400 via-amber-500 to-yellow-600",
      barColorLight: "bg-gradient-to-t from-yellow-300 via-amber-400 to-yellow-500",
      text: "text-yellow-400",
      border: "border-yellow-400/50",
    };
  }
  return {
    barColor: "bg-gradient-to-t from-slate-500 via-gray-600 to-slate-700",
    barColorLight: "bg-gradient-to-t from-slate-400 via-gray-500 to-slate-600",
    text: "text-gray-400",
    border: "border-gray-500/50",
  };
};

/**
 * Calculate accumulated entries for a package
 */
function calculateAccumulation(baseEntries: number, promoMultiplier: number = 1) {
  const month1 = baseEntries * promoMultiplier;
  const month2 = month1 + baseEntries;
  const month3 = month2 + baseEntries;
  return { month1, month2, month3 };
}

export default function VerticalAccumulationChart({ selectedPackageId }: VerticalAccumulationChartProps) {
  const { data: membershipPromo } = usePromoByType("membership-packages");
  const promoMultiplier = membershipPromo?.multiplier ?? 1;

  // Calculate data for all packages
  const packageData = packages.map((pkg) => {
    const accumulation = calculateAccumulation(pkg.baseEntries, promoMultiplier);
    const colorScheme = getPackageColorScheme(pkg.id);
    const isSelected = selectedPackageId === pkg.id;

    return {
      ...pkg,
      ...accumulation,
      colorScheme,
      isSelected,
    };
  });

  // Find max value for scaling
  const maxValue = Math.max(...packageData.map((pkg) => Math.max(pkg.month1, pkg.month2, pkg.month3)));

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
              1st Month
            </div>
          </div>
          <div className="flex-1 flex justify-center max-w-[80px] sm:max-w-[100px]">
            <div className="text-[10px] sm:text-[12px] font-semibold text-white font-['Poppins'] whitespace-nowrap">
              2nd Month
            </div>
          </div>
          <div className="flex-1 flex justify-center max-w-[80px] sm:max-w-[100px]">
            <div className="text-[10px] sm:text-[12px] font-semibold text-white font-['Poppins'] whitespace-nowrap">
              3rd Month
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
                  const barHeight = (pkg.month1 / maxValue) * 100;
                  return (
                    <div key={`${pkg.id}-month1`} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full ${pkg.colorScheme.barColorLight} rounded-t relative border-2 ${
                          pkg.colorScheme.border
                        } ${
                          pkg.isSelected
                            ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.8)] scale-105"
                            : ""
                        }`}
                        style={{ height: `${barHeight}%`, minHeight: "20px" }}
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
                  const barHeight = (pkg.month2 / maxValue) * 100;
                  return (
                    <div key={`${pkg.id}-month2`} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full ${pkg.colorScheme.barColorLight} rounded-t relative border-2 ${
                          pkg.colorScheme.border
                        } ${
                          pkg.isSelected
                            ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.8)] scale-105"
                            : ""
                        }`}
                        style={{ height: `${barHeight}%`, minHeight: "20px" }}
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
                  const barHeight = (pkg.month3 / maxValue) * 100;
                  return (
                    <div key={`${pkg.id}-month3`} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className={`w-full ${pkg.colorScheme.barColorLight} rounded-t relative border-2 ${
                          pkg.colorScheme.border
                        } ${
                          pkg.isSelected
                            ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.8)] scale-105"
                            : ""
                        }`}
                        style={{ height: `${barHeight}%`, minHeight: "20px" }}
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
                  className={`w-3 h-3 sm:w-4 sm:h-4 rounded ${pkg.colorScheme.barColorLight} ${
                    pkg.isSelected ? "ring-2 ring-yellow-400" : ""
                  }`}
                ></div>
                <span
                  className={`text-[10px] sm:text-[12px] font-semibold font-['Poppins'] ${
                    pkg.isSelected ? "text-yellow-400" : pkg.colorScheme.text
                  }`}
                >
                  {pkg.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Promo Badge */}
        {promoMultiplier > 1 && (
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
