"use client";

import { useState } from "react";
import Image from "next/image";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { Check } from "lucide-react";

// Import package icons (matching MembershipSection)
import apprentice from "../../../public/images/packageIcons/apprentice.png";
import tradie from "../../../public/images/packageIcons/tradie.png";
import foreman from "../../../public/images/packageIcons/foreman.png";
import boss from "../../../public/images/packageIcons/boss.png";
import power from "../../../public/images/packageIcons/power.png";

type StaticImageData = {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
};

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
      barColor: "bg-gradient-to-r from-gray-400 via-gray-500 to-gray-600",
      border: "border-gray-400/40",
    };
  } else if (packageId.includes("tradie") || packageId === "tradie") {
    return {
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      text: "text-blue-400",
      barColor: "bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700",
      border: "border-blue-500/50",
    };
  } else if (packageId.includes("foreman") || packageId === "foreman") {
    return {
      gradient: "from-green-500 via-green-600 to-green-700",
      text: "text-green-300",
      barColor: "bg-gradient-to-r from-green-500 via-green-600 to-green-700",
      border: "border-green-500/50",
    };
  } else if (packageId.includes("boss") || packageId === "boss") {
    return {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      text: "text-yellow-400",
      barColor: "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600",
      border: "border-yellow-400/50",
    };
  } else if (packageId.includes("power")) {
    return {
      gradient: "from-orange-600 via-red-500 to-orange-700",
      text: "text-orange-400",
      barColor: "bg-gradient-to-r from-orange-600 via-red-500 to-orange-700",
      border: "border-orange-500/50",
    };
  }
  return {
    gradient: "from-slate-600 via-gray-700 to-slate-800",
    text: "text-gray-400",
    barColor: "bg-gradient-to-r from-slate-600 via-gray-700 to-slate-800",
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
      { text: "30 days partner discounts" },
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
      { text: "30 days partner discounts" },
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
      { text: "30 days partner discounts" },
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
export default function MembershipPackagesChart() {
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");
  const [showMemberExclusive, setShowMemberExclusive] = useState(false);

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

  // Calculate max entries for chart scaling
  const maxEntries = Math.max(...currentPackages.map((pkg) => pkg.entries));

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
                Membership
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
        <div className="bg-gradient-to-br from-slate-800/50 via-slate-900/50 to-slate-800/50 backdrop-blur-sm rounded-2xl p-3 sm:p-6 lg:p-8 border border-slate-600/30 shadow-[0_0_20px_rgba(0,0,0,0.6)]">
          {/* Horizontal Bar Chart - Visual Comparison */}
          <div className="mb-4 sm:mb-6 lg:mb-8">
            {/* Title and Toggle Row */}
            <div className="flex items-center justify-between mb-3 sm:mb-4 gap-3 sm:gap-4">
              <h3 className="text-[16px] sm:text-[20px] font-bold text-white font-['Poppins']">Entries Comparison</h3>

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

            {/* Chart Container with Axes */}
            <div className="relative pl-6 sm:pl-10 lg:pl-12">
              {/* Y-Axis (Package Names) */}
              <div className="grid gap-2 sm:gap-4 mb-4 sm:mb-6">
                {currentPackages.map((pkg, index) => {
                  const colorScheme = getPackageColorScheme(pkg.id);
                  const barWidth = maxEntries > 0 ? (pkg.entries / maxEntries) * 100 : 0;

                  return (
                    <div key={pkg.id} className="flex items-center gap-2 sm:gap-4 group">
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
                      <div className="flex-1 relative">
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

                        {/* Horizontal Bar */}
                        <div className="relative h-6 sm:h-10 lg:h-12 flex items-center z-10">
                          <div
                            className={`h-full ${colorScheme.barColor} rounded-r-lg transition-all duration-300 hover:shadow-lg relative group flex items-center justify-end pr-1.5 sm:pr-3 min-w-[30px] sm:min-w-[40px]`}
                            style={{
                              width: `${barWidth}%`,
                            }}
                          >
                            {/* Entries Label on Bar */}
                            <span
                              className={`text-[9px] sm:text-[12px] lg:text-[14px] font-bold ${colorScheme.text} font-['Poppins'] whitespace-nowrap`}
                            >
                              {pkg.entries.toLocaleString()} {pkg.entriesUnit ? `/ ${pkg.entriesUnit}` : ""}
                            </span>

                            {/* Tooltip on hover */}
                            <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg border border-slate-600 pointer-events-none">
                              <div className="font-bold">{pkg.entries.toLocaleString()} entries</div>
                              <div className="text-gray-300">
                                ${pkg.price}
                                {pkg.entriesUnit && `/${pkg.entriesUnit}`}
                              </div>
                              <div className="text-gray-400 text-[10px] mt-1">
                                Value: {(pkg.entries / pkg.price).toFixed(1)} entries/$
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* X-Axis Scale Markers (shown on all items for grid lines) */}
                        <div className="absolute top-full left-0 right-0 mt-0.5 sm:mt-1 flex justify-between text-[8px] sm:text-[11px] text-gray-500 font-['Poppins'] opacity-60">
                          {index === 0 && (
                            <>
                              <span className="hidden sm:inline">0</span>
                              <span className="hidden sm:inline">{Math.round(maxEntries * 0.25).toLocaleString()}</span>
                              <span>{Math.round(maxEntries * 0.5).toLocaleString()}</span>
                              <span className="hidden sm:inline">{Math.round(maxEntries * 0.75).toLocaleString()}</span>
                              <span>{maxEntries.toLocaleString()}</span>
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
                  Number of Free Entries →
                </div>
              </div>

              {/* Y-Axis Label */}
              <div className="absolute -left-6 sm:-left-10 lg:-left-12 top-1/2 transform -translate-y-1/2 -rotate-90 origin-center hidden sm:block">
                <div className="text-[12px] sm:text-[14px] font-semibold text-gray-300 font-['Poppins'] whitespace-nowrap">
                  Packages
                </div>
              </div>
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
                          {pkg.benefits.map((benefit, index) => (
                            <div key={index} className="flex items-start gap-1.5 sm:gap-2">
                              <Check className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${colorScheme.text} flex-shrink-0 mt-0.5`} />
                              <span className="text-[11px] sm:text-[13px] text-gray-300 font-['Poppins'] leading-tight">
                                {benefit.text}
                              </span>
                            </div>
                          ))}
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
