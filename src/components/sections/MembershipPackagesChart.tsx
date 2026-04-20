"use client";

import { useState } from "react";
import Image from "next/image";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { Check, ArrowRight } from "lucide-react";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import MonthProjectionTooltip from "@/components/ui/MonthProjectionTooltip";
import {
  apprentice,
  tradie,
  foreman,
  boss,
  power,
  vip,
  getPackageIconWrapperScaleClass,
  type PackageIconData,
} from "@/utils/images/package-icons";
import { SectionContainer } from "@/components/ui";
import { getPackageColorScheme } from "@/utils/package-colors/packageColorScheme";

type StaticImageData = PackageIconData;

interface PackageBenefit {
  text: string;
}

interface PackageData {
  id: string;
  name: string;
  price: number;
  entries: number;
  entriesUnit: string;
  partnerDiscounts: string;
  benefits: PackageBenefit[];
  icon: StaticImageData;
  description?: string;
}

const subscriptionPackages: PackageData[] = [
  {
    id: "tradie-subscription",
    name: "Tradie",
    price: 20,
    entries: 15,
    entriesUnit: "mo",
    partnerDiscounts: "30 days",
    icon: tradie,
    description: "For tradies getting started",
    benefits: [
      { text: "50% access to partner discounts" },
      { text: "15 Free Entries Major Giveaway/month that accumulate" },
    ],
  },
  {
    id: "foreman-subscription",
    name: "Foreman",
    price: 40,
    entries: 40,
    entriesUnit: "mo",
    partnerDiscounts: "30 days",
    icon: foreman,
    description: "Popular with serious tool enthusiasts",
    benefits: [
      { text: "75% access to partner discounts" },
      { text: "40 Free Entries Major Giveaway/month that accumulate" },
    ],
  },
  {
    id: "boss-subscription",
    name: "Boss",
    price: 80,
    entries: 100,
    entriesUnit: "mo",
    partnerDiscounts: "30 days",
    icon: boss,
    description: "Maximum entries, maximum value",
    benefits: [
      { text: "100% access to partner discounts" },
      { text: "100 Free Entries Major Giveaway/month that accumulate" },
    ],
  },
];

const oneTimeNonMemberPackages: PackageData[] = [
  { id: "apprentice-pack", name: "Apprentice Pack", price: 25, entries: 3, entriesUnit: "", partnerDiscounts: "1 day", icon: apprentice, benefits: [{ text: "25% of partner offers" }, { text: "1 day partner discounts" }, { text: "3 Free Entries Major Giveaway" }] },
  { id: "tradie-pack", name: "Tradie Pack", price: 50, entries: 15, entriesUnit: "", partnerDiscounts: "2 days", icon: tradie, benefits: [{ text: "40% of partner offers" }, { text: "2 days partner discounts" }, { text: "15 Free Entries Major Giveaway" }] },
  { id: "foreman-pack", name: "Foreman Pack", price: 100, entries: 30, entriesUnit: "", partnerDiscounts: "4 days", icon: foreman, benefits: [{ text: "55% of partner offers" }, { text: "4 days partner discounts" }, { text: "30 Free Entries Major Giveaway" }] },
  { id: "boss-pack", name: "Boss Pack", price: 250, entries: 150, entriesUnit: "", partnerDiscounts: "10 days", icon: boss, benefits: [{ text: "70% of partner offers" }, { text: "10 days partner discounts" }, { text: "150 Free Entries Major Giveaway" }] },
  { id: "power-pack", name: "Power Pack", price: 500, entries: 600, entriesUnit: "", partnerDiscounts: "20 days", icon: power, benefits: [{ text: "85% of partner offers" }, { text: "20 days partner discounts" }, { text: "600 Free Entries Major Giveaway" }] },
  {
    id: "vip-pack",
    name: "VIP Pack",
    price: 1000,
    entries: 1500,
    entriesUnit: "",
    partnerDiscounts: "30 days",
    icon: vip,
    benefits: [
      { text: "100% of partner offers" },
      { text: "30 days partner discounts" },
      { text: "1,500 Free Entries Major Giveaway" },
    ],
  },
];

const oneTimeMemberPackages: PackageData[] = [
  { id: "additional-tradie-pack-member", name: "Additional Tradie", price: 25, entries: 15, entriesUnit: "", partnerDiscounts: "2 days", icon: tradie, benefits: [{ text: "40% of partner offers" }, { text: "2 days partner discounts" }, { text: "15 Free Entries Major Giveaway" }] },
  { id: "additional-foreman-pack-member", name: "Additional Foreman", price: 50, entries: 30, entriesUnit: "", partnerDiscounts: "4 days", icon: foreman, benefits: [{ text: "55% of partner offers" }, { text: "4 days partner discounts" }, { text: "30 Free Entries Major Giveaway" }] },
  { id: "additional-boss-pack-member", name: "Additional Boss", price: 125, entries: 150, entriesUnit: "", partnerDiscounts: "10 days", icon: boss, benefits: [{ text: "70% of partner offers" }, { text: "10 days partner discounts" }, { text: "150 Free Entries Major Giveaway" }] },
  { id: "additional-power-pack-member", name: "Additional Power", price: 250, entries: 600, entriesUnit: "", partnerDiscounts: "20 days", icon: power, benefits: [{ text: "85% of partner offers" }, { text: "20 days partner discounts" }, { text: "600 Free Entries Major Giveaway" }] },
  {
    id: "additional-vip-pack-member",
    name: "Additional VIP",
    price: 500,
    entries: 1500,
    entriesUnit: "",
    partnerDiscounts: "30 days",
    icon: vip,
    benefits: [
      { text: "100% of partner offers" },
      { text: "30 days partner discounts" },
      { text: "1,500 Free Entries Major Giveaway" },
    ],
  },
];

type TimePeriod = 3 | 6 | 12;

interface AccumulationResult {
  monthlyActiveEntries: number[];
  totalAccumulatedEntries: number[];
}

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
      monthlyActive = baseEntries * promoMultiplier;
    } else {
      monthlyActive = monthlyActiveEntries[month - 2] + baseEntries;
    }
    monthlyActiveEntries.push(monthlyActive);
    totalAccumulated += monthlyActive;
    totalAccumulatedEntries.push(totalAccumulated);
  }
  return { monthlyActiveEntries, totalAccumulatedEntries };
}

export default function MembershipPackagesChart() {
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");
  const [showMemberExclusive, setShowMemberExclusive] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(3);
  const [hoveredPackageId, setHoveredPackageId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  const membershipPromoMultiplier = resolvedMembershipMultiplier ?? 1;
  const oneTimePromoMultiplier = resolvedOneTimeMultiplier ?? 1;

  // Member-only one-time packs use membership multiplier (per getEffectivePromoType); standard one-time packs use one-time multiplier
  const oneTimeEffectiveMultiplier = showMemberExclusive ? membershipPromoMultiplier : oneTimePromoMultiplier;

  const getCurrentPackages = (): PackageData[] => {
    if (activeTab === "membership") return subscriptionPackages;
    return showMemberExclusive ? oneTimeMemberPackages : oneTimeNonMemberPackages;
  };

  const currentPackages = getCurrentPackages();

  const getPackageAccumulation = (pkg: PackageData): AccumulationResult | null => {
    if (activeTab === "membership" && pkg.entriesUnit === "mo") {
      return calculateAccumulatedEntries(pkg.entries, membershipPromoMultiplier, timePeriod);
    }
    return null;
  };

  const maxEntries = Math.max(
    ...currentPackages.flatMap((pkg) => {
      if (activeTab === "membership" && pkg.entriesUnit === "mo") {
        const acc = getPackageAccumulation(pkg);
        if (acc) {
          return [
            acc.monthlyActiveEntries[acc.monthlyActiveEntries.length - 1],
            acc.totalAccumulatedEntries[acc.totalAccumulatedEntries.length - 1],
          ];
        }
      }
      return [pkg.entries * (activeTab === "one-time" ? oneTimeEffectiveMultiplier : 1)];
    })
  );

  const handleScrollToPackages = () => {
    const el = document.getElementById("membership");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="bg-gradient-to-b from-black via-slate-900 to-black relative overflow-hidden">
      <MetallicDivider height="h-[2px]" className="absolute top-0 left-0 right-0" />

      <SectionContainer className="relative z-10 py-6 sm:py-10 lg:py-14">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 lg:mb-10">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-2 font-poppins">
            Side-by-Side Breakdown
          </p>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-extrabold text-white font-poppins leading-tight">
            Compare Every Package
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 font-poppins mt-2 max-w-lg mx-auto">
            See exactly what you get — entries, accumulation, and partner discounts at a glance.
          </p>
        </div>

        {/* Main Toggle */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <div className="bg-slate-800/80 rounded-2xl p-1 shadow-lg border border-slate-700/50 inline-flex">
            {(["membership", "one-time"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); if (tab === "membership") setShowMemberExclusive(false); }}
                className={`px-5 sm:px-8 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 font-poppins ${
                  activeTab === tab
                    ? "bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-black shadow-[0_0_20px_rgba(251,191,36,0.4)]"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab === "membership" ? "Subscriptions" : "One-Time Packs"}
              </button>
            ))}
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between mb-5 sm:mb-6 gap-3">
          <h3 className="text-sm sm:text-lg font-bold text-white font-poppins">
            Entries Breakdown
          </h3>
          <div className="flex items-center gap-3">
            {activeTab === "membership" && (
              <div className="bg-slate-800/60 rounded-xl p-0.5 border border-slate-700/40 inline-flex">
                {([3, 6, 12] as TimePeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setTimePeriod(p)}
                    className={`px-3 sm:px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all font-poppins ${
                      timePeriod === p
                        ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-black shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {p === 12 ? "1 Year" : `${p} Mo`}
                  </button>
                ))}
              </div>
            )}
            {activeTab === "one-time" && (
              <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700/40 flex items-center gap-2">
                <span className="text-[10px] sm:text-xs text-gray-400 font-poppins font-medium">
                  {showMemberExclusive ? "Member Packs" : "Standard"}
                </span>
                <button
                  onClick={() => setShowMemberExclusive(!showMemberExclusive)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ${
                    showMemberExclusive
                      ? "bg-gradient-to-r from-amber-400 to-yellow-500 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                      : "bg-slate-700"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-300 ${showMemberExclusive ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="relative chart-container space-y-2 sm:space-y-3">
          {currentPackages.map((pkg) => {
            const colorScheme = getPackageColorScheme(pkg.id);
            const accumulation = getPackageAccumulation(pkg);
            const isSubscription = activeTab === "membership" && pkg.entriesUnit === "mo";

            let displayEntries: number;
            let totalAccumulated: number | null = null;

            if (isSubscription && accumulation) {
              displayEntries = accumulation.monthlyActiveEntries[accumulation.monthlyActiveEntries.length - 1];
              totalAccumulated = accumulation.totalAccumulatedEntries[accumulation.totalAccumulatedEntries.length - 1];
            } else {
              displayEntries = pkg.entries * (activeTab === "one-time" ? oneTimeEffectiveMultiplier : 1);
            }

            // Use 1% minimum so small values (15, 75, 150) scale visibly different; no pixel min so bars are proportional
            const monthlyBarWidth = maxEntries > 0 ? Math.max(1, (displayEntries / maxEntries) * 100) : 0;
            const totalBarWidth = totalAccumulated !== null && maxEntries > 0 ? Math.max(1, (totalAccumulated / maxEntries) * 100) : 0;

            return (
              <div
                key={pkg.id}
                className="bg-slate-800/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-700/20 hover:border-slate-600/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  {/* Package icon + info: fixed width on mobile so bar column aligns for all rows */}
                  <div className="flex items-center gap-2 sm:gap-3 w-[90px] flex-shrink-0 sm:w-auto sm:min-w-[160px] lg:min-w-[200px]">
                    <div
                      className={`w-9 h-9 sm:w-12 sm:h-12 relative flex-shrink-0 ${getPackageIconWrapperScaleClass(pkg.id, "chart-row")}`}
                    >
                      <Image
                        src={pkg.icon}
                        alt={`${pkg.name} icon`}
                        fill
                        sizes="(max-width: 640px) 36px, 48px"
                        className="object-contain opacity-90"
                      />
                    </div>
                    <div className="min-w-0">
                      <h4
                        className="text-xs sm:text-sm font-bold font-poppins truncate"
                        style={colorScheme.textGradientStyle ?? { color: colorScheme.accentHex }}
                      >
                        {pkg.name}
                      </h4>
                      <div className="text-[10px] sm:text-xs font-poppins">
                        <span className="text-white font-semibold">${pkg.price}</span>
                        {pkg.entriesUnit && <span className="text-gray-500">/{pkg.entriesUnit}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Bars */}
                  <div className="flex-1 relative flex items-center gap-2 sm:gap-3" style={{ zIndex: 0 }}>
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Active entries bar */}
                      <div className="relative h-6 sm:h-8 flex items-center gap-2">
                        <div
                          className="h-full rounded-md sm:rounded-lg transition-all duration-500 ease-out flex items-center justify-end pr-2 sm:pr-3 relative overflow-hidden flex-shrink-0"
                          style={{
                            width: `${monthlyBarWidth}%`,
                            background: colorScheme.barGradientCss ?? `linear-gradient(90deg, ${colorScheme.accentHex}cc, ${colorScheme.accentHex})`,
                          }}
                          onMouseEnter={(e) => {
                            if (isSubscription && accumulation) {
                              setHoveredPackageId(pkg.id);
                              const rect = e.currentTarget.getBoundingClientRect();
                              const container = e.currentTarget.closest(".chart-container") as HTMLElement;
                              if (container) {
                                const cr = container.getBoundingClientRect();
                                setTooltipPosition({ top: rect.top - cr.top + rect.height / 2, left: rect.right - cr.left + 8 });
                              }
                            }
                          }}
                          onMouseLeave={() => { setHoveredPackageId(null); setTooltipPosition(null); }}
                        >
                          {/* Shine effect */}
                          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        </div>
                        {/* Value label - always visible outside bar so it never clips */}
                        <span className="text-[11px] sm:text-[13px] font-bold text-white font-poppins whitespace-nowrap flex-shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                          {isSubscription
                            ? `${displayEntries.toLocaleString()} active`
                            : displayEntries.toLocaleString()}
                        </span>
                      </div>

                      {/* Accumulated total bar (subscriptions only) */}
                      {isSubscription && totalAccumulated !== null && (
                        <div className="relative h-5 sm:h-6 flex items-center gap-2">
                          <div
                            className="h-full rounded-md sm:rounded-lg transition-all duration-500 ease-out flex items-center justify-end pr-2 sm:pr-3 border border-white/10 flex-shrink-0"
                            style={{
                              width: `${totalBarWidth}%`,
                              background: `${colorScheme.accentHex}33`,
                            }}
                          />
                          <span className="text-[10px] sm:text-[12px] font-semibold text-gray-300 font-poppins whitespace-nowrap flex-shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                            {totalAccumulated.toLocaleString()} total
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline benefits (visible on hover / always on mobile) */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 sm:mt-2.5 pl-11 sm:pl-[76px] lg:pl-[104px]">
                  {pkg.benefits.map((b, i) => {
                    const isEntries = b.text.toLowerCase().includes("entries");
                    const promoActive =
                      (activeTab === "membership" && membershipPromoMultiplier > 1) ||
                      (activeTab === "one-time" && oneTimeEffectiveMultiplier > 1);
                    const showPromo = isEntries && promoActive;

                    let promoText = b.text;
                    if (showPromo) {
                      const m = b.text.match(/(\d[\d,]*)/);
                      if (m) {
                        const orig = parseInt(m[1].replace(/,/g, ""));
                        const mult = activeTab === "membership" ? membershipPromoMultiplier : oneTimeEffectiveMultiplier;
                        promoText = b.text.replace(m[1], (orig * mult).toLocaleString());
                      }
                    }

                    return (
                      <span key={i} className="flex items-center gap-1 text-[10px] sm:text-[11px] text-gray-400 font-poppins">
                        <Check className="w-3 h-3 flex-shrink-0" style={{ color: colorScheme.accentHex }} />
                        {showPromo ? (
                          <span className="text-amber-400 font-semibold">{promoText}</span>
                        ) : (
                          <span>{b.text}</span>
                        )}
                      </span>
                    );
                  })}
                  <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-gray-400 font-poppins">
                    <Check className="w-3 h-3 flex-shrink-0" style={{ color: colorScheme.accentHex }} />
                    {pkg.partnerDiscounts} discounts
                  </span>
                </div>
              </div>
            );
          })}

          {/* Legend */}
          {activeTab === "membership" && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 pt-3 sm:pt-4 text-[10px] sm:text-xs text-gray-500 font-poppins">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-amber-500 inline-block" /> Active entries in month {timePeriod}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-amber-500/25 border border-white/10 inline-block" /> Total accumulated over {timePeriod} months
              </span>
            </div>
          )}

          {/* Tooltip */}
          {(() => {
            if (!hoveredPackageId || !tooltipPosition) return null;
            const hPkg = currentPackages.find((p) => p.id === hoveredPackageId);
            if (!hPkg) return null;
            const isSub = activeTab === "membership" && hPkg.entriesUnit === "mo";
            const acc = isSub ? getPackageAccumulation(hPkg) : null;
            if (!isSub || !acc) return null;
            return (
              <MonthProjectionTooltip
                isVisible
                position={tooltipPosition}
                current={acc.monthlyActiveEntries[0] || 0}
                nextMonth={acc.monthlyActiveEntries[1] || acc.monthlyActiveEntries[0] || 0}
                month3={acc.monthlyActiveEntries[2] || acc.monthlyActiveEntries[1] || acc.monthlyActiveEntries[0] || 0}
                promoMultiplier={membershipPromoMultiplier > 1 ? membershipPromoMultiplier : undefined}
              />
            );
          })()}
        </div>

        {/* CTA */}
        <div className="text-center mt-6 sm:mt-8">
          <button
            onClick={handleScrollToPackages}
            className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-black font-bold text-sm sm:text-base font-poppins shadow-[0_0_24px_rgba(251,191,36,0.35)] hover:shadow-[0_0_32px_rgba(251,191,36,0.5)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
          >
            Choose Your Package <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </SectionContainer>

      <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
    </section>
  );
}
