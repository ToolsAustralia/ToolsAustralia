"use client";

import { useState } from "react";
import Image from "next/image";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { Check } from "lucide-react";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import MonthProjectionTooltip from "@/components/ui/MonthProjectionTooltip";
import { apprentice, tradie, foreman, boss, power, type PackageIconData } from "@/utils/images/package-icons";

// Type alias for consistency
type StaticImageData = PackageIconData;

// Package data interfaces
interface PackageBenefit {
  text: string;
}

interface PackageData {
  id: string;
  name: string;
  price: number;
  entries: number;
  entriesUnit: string; // "month" for subscriptions, "" for one-time
  shopDiscount?: string;
  partnerDiscounts: string;
  benefits: PackageBenefit[];
  icon: StaticImageData;
  description?: string;
}

// Helper function to get package color scheme (reused from MembershipSection pattern)
const getPackageColorScheme = (packageId: string) => {
  if (packageId.includes("apprentice")) {
    return {
      gradient: "from-gray-300 via-slate-400 to-gray-500",
      text: "text-gray-300",
      barColor: "bg-gradient-to-r from-gray-300 via-gray-400 to-gray-500",
      barColorLight: "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-400",
      border: "border-gray-400/40",
    };
  } else if (packageId.includes("tradie") || packageId === "tradie") {
    return {
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      text: "text-blue-400",
      barColor: "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600",
      barColorLight: "bg-gradient-to-r from-blue-300 via-blue-400 to-blue-500",
      border: "border-blue-500/50",
    };
  } else if (packageId.includes("foreman") || packageId === "foreman") {
    return {
      gradient: "from-green-500 via-green-600 to-green-700",
      text: "text-green-300",
      barColor: "bg-gradient-to-r from-green-400 via-green-500 to-green-600",
      barColorLight: "bg-gradient-to-r from-green-300 via-green-400 to-green-500",
      border: "border-green-500/50",
    };
  } else if (packageId.includes("boss") || packageId === "boss") {
    return {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      text: "text-yellow-400",
      barColor: "bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500",
      barColorLight: "bg-gradient-to-r from-yellow-200 via-amber-300 to-yellow-400",
      border: "border-yellow-400/50",
    };
  } else if (packageId.includes("power")) {
    return {
      gradient: "from-orange-600 via-red-500 to-orange-700",
      text: "text-orange-400",
      barColor: "bg-gradient-to-r from-orange-500 via-red-400 to-orange-600",
      barColorLight: "bg-gradient-to-r from-orange-400 via-red-300 to-orange-500",
      border: "border-orange-500/50",
    };
  }
  return {
    gradient: "from-slate-600 via-gray-700 to-slate-800",
    text: "text-gray-400",
    barColor: "bg-gradient-to-r from-slate-500 via-gray-600 to-slate-700",
    barColorLight: "bg-gradient-to-r from-slate-400 via-gray-500 to-slate-600",
    border: "border-gray-500/50",
  };
};

// Package data - Subscriptions
const subscriptionPackages: PackageData[] = [
  {
    id: "tradie-subscription",
    name: "Tradie",
    price: 20,
    entries: 15,
    entriesUnit: "mo",
    shopDiscount: "5% off",
    partnerDiscounts: "30 days",
    icon: tradie,
    description: "For tradies getting started with mini draws",
    benefits: [
      { text: "15 free entries/month" },
      { text: "5% off shop purchases" },
      { text: "100% access to partner discounts" },
      { text: "Mini Draws" },
    ],
  },
  {
    id: "foreman-subscription",
    name: "Foreman",
    price: 40,
    entries: 40,
    entriesUnit: "mo",
    shopDiscount: "10% off",
    partnerDiscounts: "30 days",
    icon: foreman,
    description: "Popular with serious tool enthusiasts",
    benefits: [
      { text: "40 free entries/month" },
      { text: "10% off shop purchases" },
      { text: "100% access to partner discounts" },
      { text: "Mini Draws" },
    ],
  },
  {
    id: "boss-subscription",
    name: "Boss",
    price: 80,
    entries: 100,
    entriesUnit: "mo",
    shopDiscount: "20% off",
    partnerDiscounts: "30 days",
    icon: boss,
    description: "Premium for tool professionals",
    benefits: [
      { text: "100 free entries/month" },
      { text: "20% off shop purchases" },
      { text: "100% access to partner discounts" },
      { text: "Mini Draws" },
    ],
  },
];

// Package data - One-Time Non-Member
const oneTimeNonMemberPackages: PackageData[] = [
  {
    id: "apprentice-pack",
    name: "Apprentice Pack",
    price: 25,
    entries: 3,
    entriesUnit: "",
    partnerDiscounts: "1 day",
    icon: apprentice,
    benefits: [{ text: "3 free entries" }, { text: "1 day partner discounts" }, { text: "No shop discount" }],
  },
  {
    id: "tradie-pack",
    name: "Tradie Pack",
    price: 50,
    entries: 15,
    entriesUnit: "",
    partnerDiscounts: "2 days",
    icon: tradie,
    benefits: [{ text: "15 free entries" }, { text: "2 days partner discounts" }, { text: "No shop discount" }],
  },
  {
    id: "foreman-pack",
    name: "Foreman Pack",
    price: 100,
    entries: 30,
    entriesUnit: "",
    partnerDiscounts: "4 days",
    icon: foreman,
    benefits: [{ text: "30 free entries" }, { text: "4 days partner discounts" }, { text: "No shop discount" }],
  },
  {
    id: "boss-pack",
    name: "Boss Pack",
    price: 250,
    entries: 150,
    entriesUnit: "",
    partnerDiscounts: "10 days",
    icon: boss,
    benefits: [{ text: "150 free entries" }, { text: "10 days partner discounts" }, { text: "No shop discount" }],
  },
  {
    id: "power-pack",
    name: "Power Pack",
    price: 500,
    entries: 600,
    entriesUnit: "",
    partnerDiscounts: "20 days",
    icon: power,
    benefits: [{ text: "600 free entries" }, { text: "20 days partner discounts" }, { text: "No shop discount" }],
  },
];

// Package data - One-Time Member Only
const oneTimeMemberPackages: PackageData[] = [
  {
    id: "additional-apprentice-pack-member",
    name: "Additional Apprentice Pack",
    price: 25,
    entries: 10,
    entriesUnit: "",
    partnerDiscounts: "1 day",
    icon: apprentice,
    benefits: [{ text: "10 free entries" }, { text: "1 day partner discounts" }, { text: "No shop discount" }],
  },
  {
    id: "additional-tradie-pack-member",
    name: "Additional Tradie Pack",
    price: 50,
    entries: 30,
    entriesUnit: "",
    partnerDiscounts: "2 days",
    icon: tradie,
    benefits: [{ text: "30 free entries" }, { text: "2 days partner discounts" }, { text: "No shop discount" }],
  },
  {
    id: "additional-foreman-pack-member",
    name: "Additional Foreman Pack",
    price: 100,
    entries: 100,
    entriesUnit: "",
    partnerDiscounts: "4 days",
    icon: foreman,
    benefits: [{ text: "100 free entries" }, { text: "4 days partner discounts" }, { text: "No shop discount" }],
  },
  {
    id: "additional-boss-pack-member",
    name: "Additional Boss Pack",
    price: 250,
    entries: 400,
    entriesUnit: "",
    partnerDiscounts: "10 days",
    icon: boss,
    benefits: [{ text: "400 free entries" }, { text: "10 days partner discounts" }, { text: "No shop discount" }],
  },
  {
    id: "additional-power-pack-member",
    name: "Additional Power Pack",
    price: 500,
    entries: 1200,
    entriesUnit: "",
    partnerDiscounts: "20 days",
    icon: power,
    benefits: [{ text: "1,200 free entries" }, { text: "20 days partner discounts" }, { text: "No shop discount" }],
  },
];

/**
 * MembershipPackagesChart component displays a comparison chart of all membership packages
 * with visual bar charts showing entries per package. Uses metallic design matching MembershipSection.
 */
// Time period type
type TimePeriod = 3 | 6 | 12;

// Accumulation calculation result
interface AccumulationResult {
  monthlyActiveEntries: number[]; // Entries active each month
  totalAccumulatedEntries: number[]; // Total accumulated entries up to each month
}

/**
 * Calculate accumulated entries for subscription packages
 * @param baseEntries - Base entries per month
 * @param promoMultiplier - Active promo multiplier (defaults to 1)
 * @param months - Number of months to calculate
 * @returns Object with monthly active entries and total accumulated entries arrays
 */
function calculateAccumulatedEntries(
  baseEntries: number,
  promoMultiplier: number = 1,
  months: number
): AccumulationResult {
  const monthlyActiveEntries: number[] = [];
  const totalAccumulatedEntries: number[] = [];
  let totalAccumulated = 0;

  for (let month = 1; month <= months; month++) {
    let monthlyActive: number;

    if (month === 1) {
      // Month 1: Apply promo multiplier if active
      monthlyActive = baseEntries * promoMultiplier;
    } else {
      // Month 2+: Previous month's accumulated + base entries
      const previousAccumulated = monthlyActiveEntries[month - 2]; // Previous month's active entries
      monthlyActive = previousAccumulated + baseEntries;
    }

    monthlyActiveEntries.push(monthlyActive);
    totalAccumulated += monthlyActive;
    totalAccumulatedEntries.push(totalAccumulated);
  }

  return {
    monthlyActiveEntries,
    totalAccumulatedEntries,
  };
}

export default function MembershipPackagesChart() {
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");
  const [showMemberExclusive, setShowMemberExclusive] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(3);
  const [hoveredPackageId, setHoveredPackageId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  // Fetch active promo multipliers
  const { data: membershipPromo } = usePromoByType("membership-packages");
  const { data: oneTimePromo } = usePromoByType("one-time-packages");

  const membershipPromoMultiplier = membershipPromo?.multiplier ?? 1;
  const oneTimePromoMultiplier = oneTimePromo?.multiplier ?? 1;

  // Get current package list based on active tab
  const getCurrentPackages = (): PackageData[] => {
    if (activeTab === "membership") {
      return subscriptionPackages;
    } else {
      // One-time packages
      return showMemberExclusive ? oneTimeMemberPackages : oneTimeNonMemberPackages;
    }
  };

  const currentPackages = getCurrentPackages();

  // Calculate accumulated entries for subscription packages
  const getPackageAccumulation = (pkg: PackageData): AccumulationResult | null => {
    if (activeTab === "membership" && pkg.entriesUnit === "mo") {
      return calculateAccumulatedEntries(pkg.entries, membershipPromoMultiplier, timePeriod);
    }
    return null;
  };

  // Calculate max entries for chart scaling
  // For subscriptions: consider both monthly active and total accumulated
  // For one-time: use entries with promo multiplier
  const maxEntries = Math.max(
    ...currentPackages.flatMap((pkg) => {
      if (activeTab === "membership" && pkg.entriesUnit === "mo") {
        const accumulation = getPackageAccumulation(pkg);
        if (accumulation) {
          const lastMonthActive = accumulation.monthlyActiveEntries[accumulation.monthlyActiveEntries.length - 1];
          const lastTotalAccumulated =
            accumulation.totalAccumulatedEntries[accumulation.totalAccumulatedEntries.length - 1];
          return [lastMonthActive, lastTotalAccumulated];
        }
      }
      // One-time packages: apply promo multiplier
      return [pkg.entries * (activeTab === "one-time" ? oneTimePromoMultiplier : 1)];
    })
  );

  return (
    <section className="bg-gradient-to-b from-black via-slate-900 to-black relative overflow-hidden">
      {/* Metallic Divider at the top */}
      <MetallicDivider height="h-[2px]" className="absolute top-0 left-0 right-0" />

      {/* Content Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-12">
        {/* Section Title */}
        <div className="text-center mb-4 sm:mb-6 lg:mb-8">
          <h2 className="text-[20px] sm:text-[28px] lg:text-[32px] font-bold text-white mb-1 sm:mb-2 font-['Poppins']">
            Package Comparison Chart
          </h2>
          <p className="text-[12px] sm:text-[16px] text-gray-300 font-['Poppins']">
            Compare all packages side-by-side to find the best value for your needs
          </p>
        </div>

        {/* Main Toggle - Metallic design matching MembershipSection */}
        <div className="flex justify-center mb-4 sm:mb-6 lg:mb-8">
          <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[20px] p-[4px] shadow-[0_0_20px_rgba(0,0,0,0.6)] w-full max-w-full sm:max-w-none sm:w-auto">
            <div className="flex flex-row items-center justify-center w-full">
              <button
                onClick={() => {
                  setActiveTab("membership");
                  setShowMemberExclusive(false);
                }}
                className={`flex-1 px-4 py-2.5 rounded-[16px] font-bold text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none ${
                  activeTab === "membership"
                    ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                }`}
              >
                Membership Packages
              </button>
              <button
                onClick={() => setActiveTab("one-time")}
                className={`flex-1 px-4 py-2.5 rounded-[16px] font-bold text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none ${
                  activeTab === "one-time"
                    ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                }`}
              >
                One-Time Packages
              </button>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="bg-gradient-to-br from-slate-800/50 via-slate-900/50 to-slate-800/50 backdrop-blur-sm rounded-2xl p-3 sm:p-6 lg:p-8 border border-slate-600/30 shadow-[0_0_20px_rgba(0,0,0,0.6)] overflow-visible">
          {/* Horizontal Bar Chart - Visual Comparison */}
          <div className="mb-4 sm:mb-6 lg:mb-8 overflow-visible">
            {/* Title and Toggle Row */}
            <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2 sm:gap-4">
              <h3 className="text-[16px] sm:text-[20px] font-bold text-white font-['Poppins'] flex-shrink-0">
                Entries Comparison
              </h3>

              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                {/* Time Period Toggle for Subscription Packages */}
                {activeTab === "membership" && (
                  <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[15px] p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      {([3, 6, 12] as TimePeriod[]).map((period) => (
                        <button
                          key={period}
                          onClick={() => setTimePeriod(period)}
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-[11px] text-[10px] sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none ${
                            timePeriod === period
                              ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                              : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                          }`}
                        >
                          <span className="sm:hidden">{period === 12 ? "1Y" : `${period}M`}</span>
                          <span className="hidden sm:inline">{period === 12 ? "1 Year" : `${period} Months`}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-toggle for One-Time Packages - Same level as title */}
                {activeTab === "one-time" && (
                  <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[15px] p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2">
                      <span className="text-[10px] sm:text-[12px] text-gray-300 font-medium font-['Poppins'] whitespace-nowrap">
                        {showMemberExclusive ? "Member Only" : "Non-Member"}
                      </span>
                      <button
                        onClick={() => setShowMemberExclusive(!showMemberExclusive)}
                        className={`relative inline-flex h-5 w-9 sm:h-6 sm:w-11 items-center rounded-full transition-all duration-300 ${
                          showMemberExclusive
                            ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                            : "bg-slate-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 sm:h-4 sm:w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${
                            showMemberExclusive ? "translate-x-5 sm:translate-x-6" : "translate-x-0.5 sm:translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Chart Container with Axes */}
            <div className="relative overflow-visible chart-container" style={{ zIndex: 0 }}>
              {/* Y-Axis (Package Names) */}
              <div className="grid gap-3 sm:gap-5 mb-4 sm:mb-6">
                {currentPackages.map((pkg, index) => {
                  const colorScheme = getPackageColorScheme(pkg.id);
                  const accumulation = getPackageAccumulation(pkg);
                  const isSubscription = activeTab === "membership" && pkg.entriesUnit === "mo";

                  // For subscriptions: show dual bars
                  // For one-time: show single bar with promo multiplier
                  let displayEntries: number;
                  let totalAccumulated: number | null = null;

                  if (isSubscription && accumulation) {
                    displayEntries = accumulation.monthlyActiveEntries[accumulation.monthlyActiveEntries.length - 1];
                    totalAccumulated =
                      accumulation.totalAccumulatedEntries[accumulation.totalAccumulatedEntries.length - 1];
                  } else {
                    displayEntries = pkg.entries * (activeTab === "one-time" ? oneTimePromoMultiplier : 1);
                  }

                  const monthlyBarWidth = maxEntries > 0 ? (displayEntries / maxEntries) * 100 : 0;
                  const totalBarWidth =
                    totalAccumulated !== null && maxEntries > 0 ? (totalAccumulated / maxEntries) * 100 : 0;

                  return (
                    <div
                      key={pkg.id}
                      className="flex items-center gap-2 sm:gap-4 group"
                      style={{ position: "relative", zIndex: 1 }}
                    >
                      {/* Y-Axis: Package Info (Left Side) */}
                      <div className="flex items-center gap-1.5 sm:gap-3 min-w-[100px] sm:min-w-[180px] lg:min-w-[220px] max-w-[100px] sm:max-w-[180px] lg:max-w-[220px]">
                        {/* Package Icon */}
                        <div
                          className={`w-8 h-8 sm:w-12 sm:h-12 relative flex-shrink-0 ${
                            pkg.id.includes("boss") ? "scale-110 sm:scale-110" : ""
                          }`}
                        >
                          <Image
                            src={pkg.icon}
                            alt={`${pkg.name} icon`}
                            fill
                            sizes="(max-width: 640px) 32px, 48px"
                            className="w-full h-full object-contain opacity-90"
                          />
                        </div>

                        {/* Package Name & Price */}
                        <div className="flex-1 min-w-0 max-w-full overflow-hidden">
                          <h4
                            className={`text-[10px] sm:text-[14px] font-bold ${colorScheme.text} font-['Poppins'] truncate leading-tight`}
                          >
                            {pkg.name}
                          </h4>
                          <div className="text-[9px] sm:text-[12px] text-yellow-400 font-semibold font-['Poppins'] truncate">
                            ${pkg.price}
                            {pkg.entriesUnit && <span className="text-gray-400">/{pkg.entriesUnit}</span>}
                          </div>
                        </div>
                      </div>

                      {/* X-Axis: Bar Chart Area */}
                      <div className="flex-1 relative overflow-visible" style={{ zIndex: 0 }}>
                        {/* X-Axis Vertical Grid Lines */}
                        <div className="absolute inset-0 flex justify-between items-center pointer-events-none">
                          <div className="w-px h-full bg-slate-600/20"></div>
                          <div className="w-px h-full bg-slate-600/20"></div>
                          <div className="w-px h-full bg-slate-600/20"></div>
                          <div className="w-px h-full bg-slate-600/20"></div>
                          <div className="w-px h-full bg-slate-600/20"></div>
                        </div>

                        {/* Horizontal Grid Line */}
                        <div className="absolute inset-0 flex items-center pointer-events-none">
                          <div className="w-full h-px bg-slate-600/30"></div>
                        </div>

                        {/* Dual Bars for Subscriptions, Single Bar for One-Time */}
                        <div className="relative flex flex-col gap-1 sm:gap-1.5">
                          {/* Monthly Active Entries Bar (or Single Bar for One-Time) */}
                          <div className="relative h-5 sm:h-8 lg:h-10 flex items-center">
                            <div
                              className={`h-full ${colorScheme.barColorLight} rounded-r-lg transition-all duration-300 hover:shadow-lg relative group flex items-start justify-end pr-1 sm:pr-2 min-w-[30px] sm:min-w-[40px]`}
                              style={{
                                width: `${monthlyBarWidth}%`,
                              }}
                              onMouseEnter={(e) => {
                                if (isSubscription && accumulation) {
                                  setHoveredPackageId(pkg.id);
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const chartContainer = e.currentTarget.closest(".chart-container") as HTMLElement;
                                  if (chartContainer) {
                                    const containerRect = chartContainer.getBoundingClientRect();
                                    setTooltipPosition({
                                      top: rect.top - containerRect.top + rect.height / 2,
                                      left: rect.right - containerRect.left + 8,
                                    });
                                  }
                                }
                              }}
                              onMouseLeave={() => {
                                setHoveredPackageId(null);
                                setTooltipPosition(null);
                              }}
                            >
                              {/* Entries Label on Bar - Positioned at top */}
                              <span className="text-[8px] sm:text-[11px] lg:text-[13px] font-bold text-white font-['Poppins'] whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] absolute top-0 right-1 sm:right-2">
                                {isSubscription
                                  ? `${displayEntries.toLocaleString()} active`
                                  : `${displayEntries.toLocaleString()}${
                                      pkg.entriesUnit ? ` / ${pkg.entriesUnit}` : ""
                                    }`}
                              </span>
                            </div>
                          </div>

                          {/* Total Accumulated Entries Bar (Only for Subscriptions) */}
                          {isSubscription && totalAccumulated !== null && (
                            <div className="relative h-5 sm:h-8 lg:h-10 flex items-center" style={{ zIndex: 1 }}>
                              <div
                                className={`h-full ${colorScheme.barColor} border-2 ${colorScheme.border} rounded-r-lg transition-all duration-300 hover:shadow-lg relative flex items-start justify-end pr-1 sm:pr-2 min-w-[30px] sm:min-w-[40px]`}
                                style={{
                                  width: `${totalBarWidth}%`,
                                }}
                              >
                                {/* Entries Label on Bar - Positioned at top */}
                                <span className="text-[8px] sm:text-[11px] lg:text-[13px] font-bold text-white font-['Poppins'] whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] absolute top-0 right-1 sm:right-2">
                                  {totalAccumulated.toLocaleString()} total
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* X-Axis Scale Markers (shown on all items for grid lines) */}
                        <div className="absolute -top-3 sm:-top-5 left-0 right-0 mt-0.5 sm:mt-1 text-[8px] sm:text-[11px] text-gray-500 font-['Poppins'] opacity-60">
                          {index === 0 && (
                            <>
                              <span
                                className="hidden sm:inline absolute"
                                style={{ left: "0%", transform: "translateX(-50%)" }}
                              >
                                0
                              </span>
                              <span
                                className="hidden sm:inline absolute"
                                style={{ left: "25%", transform: "translateX(-50%)" }}
                              >
                                {Math.round(maxEntries * 0.25).toLocaleString()}
                              </span>
                              <span className="absolute" style={{ left: "50%", transform: "translateX(-50%)" }}>
                                {Math.round(maxEntries * 0.5).toLocaleString()}
                              </span>
                              <span
                                className="hidden sm:inline absolute"
                                style={{ left: "75%", transform: "translateX(-50%)" }}
                              >
                                {Math.round(maxEntries * 0.75).toLocaleString()}
                              </span>
                              <span className="absolute" style={{ left: "100%", transform: "translateX(-50%)" }}>
                                {maxEntries.toLocaleString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-Axis Label */}
              <div className="text-center mt-2 sm:mt-4 lg:mt-6">
                <div className="text-[10px] sm:text-[14px] font-semibold text-gray-300 font-['Poppins']">
                  {activeTab === "membership"
                    ? `Entries (Month ${timePeriod} Active / Total Accumulated) →`
                    : "Number of Free Entries →"}
                </div>
                {activeTab === "membership" && (
                  <div className="text-[9px] sm:text-[12px] text-gray-400 font-['Poppins'] mt-1">
                    Top bar: Active entries | Bottom bar: Total accumulated
                  </div>
                )}
              </div>

              {/* Tooltip Container - Positioned outside package rows to appear above all bars */}
              {(() => {
                if (!hoveredPackageId || !tooltipPosition) return null;

                const hoveredPackage = currentPackages.find((pkg) => pkg.id === hoveredPackageId);
                if (!hoveredPackage) return null;

                const isSubscription = activeTab === "membership" && hoveredPackage.entriesUnit === "mo";
                const accumulation = isSubscription ? getPackageAccumulation(hoveredPackage) : null;
                if (!isSubscription || !accumulation) return null;

                // Calculate current, nextMonth, and month3 from accumulation data
                const current = accumulation.monthlyActiveEntries[0] || 0;
                const nextMonth = accumulation.monthlyActiveEntries[1] || accumulation.monthlyActiveEntries[0] || 0;
                const month3 =
                  accumulation.monthlyActiveEntries[2] ||
                  accumulation.monthlyActiveEntries[1] ||
                  accumulation.monthlyActiveEntries[0] ||
                  0;

                return (
                  <MonthProjectionTooltip
                    isVisible={true}
                    position={tooltipPosition}
                    current={current}
                    nextMonth={nextMonth}
                    month3={month3}
                    promoMultiplier={membershipPromoMultiplier > 1 ? membershipPromoMultiplier : undefined}
                  />
                );
              })()}
            </div>
          </div>

          {/* Comparison Table - Features & Benefits */}
          <div className="mt-4 sm:mt-6 lg:mt-8">
            <h3 className="text-[16px] sm:text-[20px] font-bold text-white mb-3 sm:mb-4 font-['Poppins'] text-center">
              Features Comparison
            </h3>
            <div className="overflow-x-auto">
              <div className="min-w-full inline-block">
                {/* Table Header - Responsive grid based on active tab */}
                <div
                  className={`grid gap-3 sm:gap-4 mb-4 ${
                    activeTab === "membership"
                      ? "grid-cols-1 sm:grid-cols-3"
                      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
                  }`}
                >
                  {currentPackages.map((pkg) => {
                    const colorScheme = getPackageColorScheme(pkg.id);
                    return (
                      <div
                        key={pkg.id}
                        className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-xl p-3 sm:p-4 border border-slate-600/30"
                      >
                        <div className="text-center">
                          <h5
                            className={`text-[14px] sm:text-[16px] font-bold ${colorScheme.text} mb-1.5 sm:mb-2 font-['Poppins']`}
                          >
                            {pkg.name}
                          </h5>
                          {pkg.description && (
                            <p className="text-[11px] sm:text-[12px] text-gray-400 mb-2 sm:mb-3 font-['Poppins']">
                              {pkg.description}
                            </p>
                          )}
                        </div>

                        {/* Benefits List */}
                        <div className="space-y-1.5 sm:space-y-2">
                          {pkg.benefits.map((benefit, index) => {
                            // Check if this is an entries benefit and if promo is active
                            const isEntriesBenefit = benefit.text.toLowerCase().includes("entries");
                            const isPromoActive =
                              (activeTab === "membership" && membershipPromoMultiplier > 1) ||
                              (activeTab === "one-time" && oneTimePromoMultiplier > 1);
                            const shouldShowStrikeThrough = isEntriesBenefit && isPromoActive;

                            // Extract original entries number
                            let originalText = benefit.text;
                            let promoText = benefit.text;
                            if (shouldShowStrikeThrough) {
                              const match = benefit.text.match(/(\d+)\s+free\s+entries/i);
                              if (match) {
                                const originalEntries = parseInt(match[1]);
                                const promoMultiplier =
                                  activeTab === "membership" ? membershipPromoMultiplier : oneTimePromoMultiplier;
                                const promoEntries = originalEntries * promoMultiplier;
                                // For one-time packages, remove "/month" suffix
                                const suffix = activeTab === "membership" ? "/month" : "";
                                originalText = `${originalEntries} free entries${suffix}`;
                                promoText = `${promoEntries} free entries${suffix}`;
                              }
                            }

                            return (
                              <div key={index} className="flex items-start gap-1.5 sm:gap-2">
                                <Check
                                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${colorScheme.text} flex-shrink-0 mt-0.5`}
                                />
                                {shouldShowStrikeThrough ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[11px] sm:text-[13px] font-['Poppins'] leading-tight line-through opacity-40 text-slate-400">
                                      {originalText}
                                    </span>
                                    <span className="text-[11px] sm:text-[13px] text-yellow-400 font-bold font-['Poppins'] leading-tight">
                                      {promoText}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] sm:text-[13px] text-gray-300 font-['Poppins'] leading-tight">
                                    {benefit.text}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metallic Divider at the bottom */}
      <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
    </section>
  );
}
