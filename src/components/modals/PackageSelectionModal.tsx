"use client";

import React, { useState } from "react";
import { Check } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { ModalContainer, ModalHeader, ModalContent } from "./ui";
import { useMemberships } from "@/hooks/useMemberships";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useUserData } from "@/hooks/queries";
import { isNonMemberPackage } from "@/utils/membership/member-package-mapping";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import BestChanceBadge from "@/components/ui/BestChanceBadge";
import CornerRibbonBadge from "@/components/ui/CornerRibbonBadge";
import PromoMultiplierBadge from "@/components/ui/PromoMultiplierBadge";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { getPackageIcon } from "@/utils/images/package-icons";
import { getPackageColorSchemeForPromo, getCardBorderStyle } from "@/utils/package-colors/packageColorScheme";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";

// Helper function to convert hex color to rgba for box-shadow
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface PackageSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: LocalMembershipPlan;
  onPlanSelect: (plan: LocalMembershipPlan) => void;
}

const PackageSelectionModal: React.FC<PackageSelectionModalProps> = ({
  isOpen,
  onClose,
  currentPlan,
  onPlanSelect,
}) => {
  // Determine active tab based on current plan (no toggle, just display what's selected)
  const activeTab: "membership" | "one-time" = currentPlan.period === "mo" ? "membership" : "one-time";
  const { variantConfig } = useVariantContext();
  const { data: session } = useSession();
  const [selectedPlan, setSelectedPlan] = useState<LocalMembershipPlan>(currentPlan);
  // Sub-tab for one-time packages: allow switching between regular one-time and membership packages
  const [oneTimeSubTab, setOneTimeSubTab] = useState<"one-time" | "membership">("one-time");

  // Get user data to determine membership status
  const { data: user } = useUserData(session?.user?.id);
  const isMember = user?.subscription?.isActive || false;
  const { data: userMajorDrawStats } = useUserMajorDrawStats(user?._id);
  // Check if user has access to additional packages (subscription OR current draw entries)
  const hasAdditionalPackageAccessFlag = hasAdditionalPackageAccess(user, userMajorDrawStats);

  // Fetch real membership data from API
  const { subscriptionPackages, oneTimePackages, loading, error } = useMemberships();

  // Get resolved multipliers (includes scheduled, toggle, and alternating)
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");

  // Debug logging
  // console.log("🔍 PackageSelectionModal Debug:", {
  //   user: user?.email,
  //   isMember,
  //   subscription: user?.subscription,
  //   currentPlan: currentPlan,
  //   subscriptionPackages: subscriptionPackages.length,
  //   oneTimePackages: oneTimePackages.length,
  // });

  // Get membership plans from API data
  const membershipPlans: LocalMembershipPlan[] = (() => {
    if (loading) return [];
    if (error) return [];

    // When activeTab is "one-time" and user doesn't have access, we might need both types for sub-tab switching
    const needsBothTypes = activeTab === "one-time" && !hasAdditionalPackageAccessFlag;

    // Get the appropriate API plans based on activeTab and sub-tab
    let apiPlans;
    if (activeTab === "membership") {
      apiPlans = subscriptionPackages;
    } else if (needsBothTypes && oneTimeSubTab === "membership") {
      // When showing membership sub-tab in one-time view, show subscription packages
      apiPlans = subscriptionPackages;
    } else {
      // Default: show one-time packages
      apiPlans = oneTimePackages;
    }

    const convertedPlans = apiPlans.map(convertToLocalPlan);

    // Apply promo multiplier to packages if there's an active promo
    return convertedPlans.map((plan) => {
      // Determine if we're showing one-time packages (either from activeTab or sub-tab)
      const showingOneTime = activeTab === "one-time" && oneTimeSubTab === "one-time";
      const showingMembership =
        activeTab === "membership" || (activeTab === "one-time" && oneTimeSubTab === "membership");

      // One-time packages: use membership multiplier for member-only packages when user is a member
      if (showingOneTime && plan.period === "one-time") {
        const effectiveType = getEffectivePromoType(plan.id, "one-time", isMember);
        const resolvedMultiplier =
          effectiveType === "membership-packages" ? resolvedMembershipMultiplier : resolvedOneTimeMultiplier;
        if (resolvedMultiplier !== null && resolvedMultiplier > 1) {
          const originalEntries = plan.metadata?.entriesCount || 0;
          const promoMultiplier = resolvedMultiplier;
          const promoEntries = originalEntries * promoMultiplier;

          const updatedFeatures = plan.features.map((feature) => {
            if (feature.text.includes("Entries") || feature.text.includes("entries")) {
              const match = feature.text.match(/(\d+)\s*(Free\s+)?(Accumulated\s+)?Entries/i);
              if (match) {
                const originalNumber = parseInt(match[1]);
                const newNumber = originalNumber * promoMultiplier;
                return { text: feature.text.replace(originalNumber.toString(), newNumber.toString()) };
              }
            }
            return feature;
          });

          return {
            ...plan,
            features: updatedFeatures,
            metadata: {
              ...plan.metadata,
              entriesCount: promoEntries,
              originalEntries,
              promoMultiplier,
              isPromoActive: (resolvedMultiplier ?? 1) > 1,
            },
          };
        }
      }

      // Check if this is a subscription package (use resolved multiplier)
      if (showingMembership && plan.period !== "one-time" && resolvedMembershipMultiplier !== null && resolvedMembershipMultiplier > 1) {
        // Apply resolved multiplier to entries (includes alternating if no active promo)
        const originalEntries = plan.metadata?.entriesCount || 0;
        const promoMultiplier = resolvedMembershipMultiplier;
        const promoEntries = originalEntries * promoMultiplier;

        // Update features to show promo effect
        const updatedFeatures = plan.features.map((feature) => {
          // Check if this feature mentions entries
          if (feature.text.includes("Entries") || feature.text.includes("entries")) {
            // Extract the number from the feature text
            const match = feature.text.match(/(\d+)\s*(Free\s+)?(Accumulated\s+)?Entries/i);
            if (match) {
              const originalNumber = parseInt(match[1]);
              const newNumber = originalNumber * promoMultiplier;
              // Replace the number in the feature text
              return { text: feature.text.replace(originalNumber.toString(), newNumber.toString()) };
            }
          }
          return feature;
        });

        return {
          ...plan,
          features: updatedFeatures,
          metadata: {
            ...plan.metadata,
            entriesCount: promoEntries,
            originalEntries,
            promoMultiplier,
            isPromoActive: true,
            isInitialPurchaseOnly: true, // Mark as initial purchase only
          },
        };
      }

      // Return plan unchanged if no promo applies
      return plan;
    });
  })();

  // Fallback static data (in case API fails)
  const staticMembershipPlans: LocalMembershipPlan[] = (() => {
    switch (activeTab) {
      case "membership":
        return [
          // Monthly Membership Packages
          {
            id: "tradie",
            name: "Tradie",
            subtitle: "Tradie",
            price: 20,
            period: "mo",
            features: [
              { text: "15 Free Accumulated Entries" },
              // { text: "5% Off Shop" },
              { text: "100% Access to Partner Discounts" },
            ],
            buttonText: "Get Started",
            buttonStyle: "secondary",
            isMemberOnly: false,
          },
          {
            id: "foreman",
            name: "Foreman",
            subtitle: "Powerpass",
            price: 40,
            period: "mo",
            features: [
              { text: "40 Free Accumulated Entries" },
              // { text: "10% Off Shop" },
              { text: "100% Access to Partner Discounts" },
            ],
            isPopular: true,
            buttonText: "Go Pro",
            buttonStyle: "primary",
            isMemberOnly: false,
          },
          {
            id: "boss",
            name: "Boss",
            subtitle: "Hard Yakka",
            price: 80,
            period: "mo",
            features: [
              { text: "100 Free Accumulated Entries" },
              // { text: "20% Off Shop" },
              { text: "100% Access to Partner Discounts" },
            ],
            buttonText: "Become Boss",
            buttonStyle: "secondary",
            isMemberOnly: false,
          },
        ];

      case "one-time":
        const allOneTimePackages = [
          // One-Time Packages (Non-Member)
          {
            id: "apprentice-pack",
            name: "Apprentice Pack",
            price: 25,
            period: "one-time",
            features: [
              { text: "3 Free Entries" },
              { text: "1 Days Access to Partner Discounts" },
              { text: "100% of Partner Discounts Available" },
            ],
            buttonText: "Buy Now",
            buttonStyle: "secondary" as const,
            isMemberOnly: false,
            metadata: {
              entriesCount: 3,
            },
          },
          {
            id: "tradie-pack",
            name: "Tradie Pack",
            price: 50,
            period: "one-time",
            features: [
              { text: "15 Free Entries" },
              { text: "2 Days Access to Partner Discounts" },
              { text: "100% of Partner Discounts Available" },
            ],
            isPopular: true,
            buttonText: "Get Tradie",
            buttonStyle: "primary" as const,
            isMemberOnly: false,
            metadata: {
              entriesCount: 15,
            },
          },
          // Member-Exclusive One-Time Packages
          {
            id: "foreman-pack",
            name: "Foreman Pack",
            price: 100,
            period: "one-time",
            features: [
              { text: "30 Free Entries" },
              { text: "4 Days Access to Partner Discounts" },
              { text: "100% of Partner Discounts Available" },
            ],
            buttonText: "Go Foreman",
            buttonStyle: "secondary" as const,
            isMemberOnly: true,
            metadata: {
              entriesCount: 30,
            },
          },
          {
            id: "boss-pack",
            name: "Boss Pack",
            price: 250,
            period: "one-time",
            features: [
              { text: "150 Free Entries" },
              { text: "10 Days Access to Partner Discounts" },
              { text: "100% of Partner Discounts Available" },
            ],
            buttonText: "Get Boss",
            buttonStyle: "secondary" as const,
            isMemberOnly: true,
            metadata: {
              entriesCount: 150,
            },
          },
          {
            id: "power-pack",
            name: "Power Pack",
            price: 500,
            period: "one-time",
            features: [
              { text: "600 Free Entries" },
              { text: "20 Days Access to Partner Discounts" },
              { text: "100% of Partner Discounts Available" },
            ],
            buttonText: "Get Power",
            buttonStyle: "secondary" as const,
            isMemberOnly: true,
            metadata: {
              entriesCount: 600,
            },
          },
        ];

        // Filter out non-member packages for existing members
        const filteredPackages = isMember
          ? allOneTimePackages.filter((pkg) => !isNonMemberPackage(pkg.id))
          : allOneTimePackages;

        // Apply resolved multiplier to one-time packages (includes alternating if no active promo)
        if (resolvedOneTimeMultiplier !== null && resolvedOneTimeMultiplier > 1) {
          return filteredPackages.map((plan) => {
            const originalEntries = plan.metadata?.entriesCount || 0;
            const promoEntries = originalEntries * resolvedOneTimeMultiplier;

            // Update features to show promo effect
            const updatedFeatures = plan.features.map((feature) => {
              // Check if this feature mentions entries
              if (feature.text.includes("Entries") || feature.text.includes("entries")) {
                // Extract the number from the feature text
                const match = feature.text.match(/(\d+)\s*(Free\s+)?(Accumulated\s+)?Entries/i);
                if (match) {
                  const originalNumber = parseInt(match[1]);
                  const newNumber = originalNumber * resolvedOneTimeMultiplier;
                  // Replace the number in the feature text
                  return { text: feature.text.replace(originalNumber.toString(), newNumber.toString()) };
                }
              }
              return feature;
            });

            return {
              ...plan,
              features: updatedFeatures,
              metadata: {
                ...plan.metadata,
                entriesCount: promoEntries,
                originalEntries,
                promoMultiplier: resolvedOneTimeMultiplier,
                isPromoActive: (resolvedOneTimeMultiplier ?? 1) > 1,
              },
            };
          });
        }

        return filteredPackages;
    }
  })();

  const handlePlanSelect = (plan: LocalMembershipPlan) => {
    if (isCurrentPlan(plan)) return;

    setSelectedPlan(plan);

    // Auto-confirm: brief visual feedback then close (tap → glow → close)
    setTimeout(() => {
      onPlanSelect(plan);
      onClose();
    }, 200);
  };

  const isSelectedPlan = (plan: LocalMembershipPlan) => {
    return plan.id === selectedPlan.id;
  };

  const isCurrentPlan = (plan: LocalMembershipPlan) => {
    if (!isMember || !user?.subscription?.packageId) {
      // console.log("🔍 Not a member or no packageId:", { isMember, packageId: user?.subscription?.packageId });
      return false;
    }

    // Use API data to find the current plan
    const allApiPlans = [...subscriptionPackages, ...oneTimePackages];
    const packageIdString = user.subscription.packageId.toString();
    const currentApiPlan = allApiPlans.find((apiPlan) => apiPlan._id === packageIdString);

    // console.log("🔍 isCurrentPlan Debug:", {
    //   checkingPlan: { id: plan.id, name: plan.name, period: plan.period },
    //   userPackageId: packageIdString,
    //   foundApiPlan: currentApiPlan ? { id: currentApiPlan.id, name: currentApiPlan.name } : null,
    //   apiPlansCount: allApiPlans.length,
    //   allApiPlans: allApiPlans.map((p) => ({ id: p.id, name: p.name, _id: p._id })),
    // });

    if (currentApiPlan) {
      // Convert API plan to local format and compare
      const currentLocalPlan = convertToLocalPlan(currentApiPlan);
      const isCurrent = plan.id === currentLocalPlan.id && plan.period === currentLocalPlan.period;

      // console.log("🔍 Plan comparison:", {
      //   planId: plan.id,
      //   planName: plan.name,
      //   currentLocalPlanId: currentLocalPlan.id,
      //   currentLocalPlanName: currentLocalPlan.name,
      //   planPeriod: plan.period,
      //   currentLocalPlanPeriod: currentLocalPlan.period,
      //   isCurrent,
      // });

      return isCurrent;
    } else {
      // console.log("🔍 No matching API plan found for packageId:", packageIdString);

      // Fallback: Try to match by plan name if API data isn't available
      // This is a temporary fallback until API data loads properly
      if (loading || allApiPlans.length === 0) {
        // console.log("🔍 Using fallback name matching...");

        // Based on the user data, they have a Pro subscription
        // Check if this plan matches the expected Pro plan
        const isProPlan = plan.name.toLowerCase().includes("foreman") && plan.period === "mo";
        // console.log("🔍 Fallback check - isProPlan:", isProPlan, "for plan:", plan.name);

        return isProPlan;
      }

      // Additional fallback: Check if we can match by subscription packageId
      // This handles cases where the API data structure might be different
      // console.log("🔍 Trying additional fallback matching...");

      // Check if this is a subscription plan (monthly) and user has active subscription
      if (plan.period === "mo" && user.subscription?.isActive) {
        // For now, we'll assume Pro is the current plan based on user data
        // This is a temporary solution until we can properly match the API data
        const isCurrentSubscription = plan.name.toLowerCase().includes("foreman");
        // console.log("🔍 Additional fallback - isCurrentSubscription:", isCurrentSubscription, "for plan:", plan.name);
        return isCurrentSubscription;
      }

      return false;
    }
  };

  // Use API data if available, otherwise fallback to static data
  let finalMembershipPlans = membershipPlans.length > 0 ? membershipPlans : staticMembershipPlans;

  // console.log("🔍 Final membership plans:", {
  //   usingApiData: membershipPlans.length > 0,
  //   membershipPlansCount: membershipPlans.length,
  //   staticPlansCount: staticMembershipPlans.length,
  //   finalPlansCount: finalMembershipPlans.length,
  //   loading,
  //   error,
  // });

  // Filter packages based on membership status and current plan
  if (activeTab === "membership") {
    if (isMember) {
      // If user has active subscription, show all subscription packages (including current plan)
      // The current plan will be marked as non-selectable
      finalMembershipPlans = finalMembershipPlans;
    } else {
      // For non-members, show all subscription packages
      finalMembershipPlans = finalMembershipPlans;
    }
  } else if (activeTab === "one-time") {
    if (hasAdditionalPackageAccessFlag) {
      // If user has access (subscription OR entries), show additional packages
      finalMembershipPlans = finalMembershipPlans.filter((plan) => {
        return plan.isMemberOnly === true;
      });
    } else {
      // For users without access, show packages based on sub-tab selection
      if (oneTimeSubTab === "one-time") {
        // Show regular one-time packages (non-member exclusive)
        finalMembershipPlans = finalMembershipPlans.filter((plan) => {
          return plan.isMemberOnly !== true && plan.period === "one-time";
        });
      } else {
        // Show membership packages (subscription) to encourage subscription
        // Already fetching subscription packages from API, so no additional filter needed
        finalMembershipPlans = finalMembershipPlans;
      }
    }
  }

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="sm" height="fixed" fixedHeight="max-h-[80dvh]">
      <ModalHeader title="Select Your Package" onClose={onClose} showLogo={true} />

      <ModalContent padding="lg" className="">
        {/* Member Status Info */}

        {/* Toggle - Show when viewing one-time packages and user doesn't have access to additional packages */}
        {activeTab === "one-time" && !hasAdditionalPackageAccessFlag && (
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[20px] p-[4px] shadow-[0_0_20px_rgba(0,0,0,0.6)] w-full max-w-full sm:max-w-none sm:w-auto">
              <div className="flex flex-row items-center justify-center w-full">
                <button
                  onClick={() => {
                    setOneTimeSubTab("one-time");
                    setSelectedPlan(currentPlan); // Reset selection when switching tabs
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-[16px] font-bold text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
                    oneTimeSubTab === "one-time"
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                  }`}
                >
                  One-Time
                  {/* Multiplier Badge - Upper right */}
                  {resolvedOneTimeMultiplier !== null && resolvedOneTimeMultiplier > 1 && oneTimeSubTab === "one-time" && (
                    <PromoMultiplierBadge multiplier={resolvedOneTimeMultiplier as 2 | 3 | 5 | 10} />
                  )}
                </button>
                <button
                  onClick={() => {
                    setOneTimeSubTab("membership");
                    setSelectedPlan(currentPlan); // Reset selection when switching tabs
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-[16px] font-bold text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
                    oneTimeSubTab === "membership"
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                  }`}
                >
                  Membership Packs
                  {/* Multiplier Badge - Upper right */}
                  {resolvedMembershipMultiplier != null && resolvedMembershipMultiplier > 1 && oneTimeSubTab === "membership" && (
                    <PromoMultiplierBadge multiplier={resolvedMembershipMultiplier as 2 | 3 | 5 | 10} />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Packages Stacked Vertically */}
        <div className="space-y-2 sm:space-y-3 max-w-2xl mx-auto">
          {finalMembershipPlans.map((plan) => {
            const isMembershipTab = plan.period !== "one-time";
            const colorScheme = getPackageColorSchemeForPromo(plan.id, isMembershipTab, variantConfig);
            const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-2.5 sm:p-4 shadow-[0_0_15px_rgba(0,0,0,0.4)] transition-all duration-300 hover:scale-[1.02] ${
                  isCurrentPlan(plan) ? "cursor-not-allowed opacity-75" : "cursor-pointer"
                } ${
                  isSelectedPlan(plan)
                    ? "ring-4 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-2xl"
                    : "hover:shadow-[0_0_25px_rgba(0,0,0,0.6)]"
                }`}
                style={{
                  ...(colorScheme.cardBorderGradient
                    ? getCardBorderStyle(colorScheme, "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)")
                    : {
                        border: isSelectedPlan(plan)
                          ? `3px solid ${accentHex}`
                          : `2px solid transparent`,
                        backgroundImage: isSelectedPlan(plan)
                          ? `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${hexToRgba(
                              accentHex,
                              0.8
                            )}, ${hexToRgba(accentHex, 0.5)})`
                          : `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${accentHex}, transparent)`,
                        backgroundOrigin: "border-box",
                        backgroundClip: "padding-box, border-box",
                      }),
                  boxShadow: isSelectedPlan(plan)
                    ? `0 0 20px ${hexToRgba(accentHex, 0.6)}, 0 0 40px ${hexToRgba(
                        accentHex,
                        0.4
                      )}, 0 0 60px rgba(251, 191, 36, 0.3), 0 0 0 4px rgba(251, 191, 36, 0.2)`
                    : `0 0 15px ${hexToRgba(accentHex, 0.4)}, 0 0 30px ${hexToRgba(
                        accentHex,
                        0.2
                      )}`,
                }}
                onClick={() => !isCurrentPlan(plan) && handlePlanSelect(plan)}
              >
                {/* Promo Badge (10x entries) - Upper right, like MembershipSection */}
                {plan.metadata?.isPromoActive && plan.metadata?.promoMultiplier && (
                  <div className="absolute -top-4 -right-4 sm:-top-5 sm:-right-5 z-30">
                    <Image
                      src={`/images/badge/X${plan.metadata.promoMultiplier}.png`}
                      alt={`${plan.metadata.promoMultiplier}x entries`}
                      width={64}
                      height={64}
                      className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                    />
                  </div>
                )}

                {/* Price - Absolute top-left, no background */}
                <div className="absolute top-1.5 left-1.5 z-20 font-poppins text-center">
                  <div
                    className={`font-bold text-base sm:text-lg leading-tight ${colorScheme.textGradientStyle ? "" : colorScheme.priceText}`}
                    style={colorScheme.textGradientStyle ?? { color: accentHex }}
                  >
                    ${plan.price}
                  </div>
                  <div
                    className="text-[9px] sm:text-[10px] font-semibold"
                    style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : { color: "rgba(255,255,255,0.9)" }}
                  >
                    {plan.period === "one-time" ? "One Time" : "Per Giveaway"}
                  </div>
                </div>

                {/* Corner ribbon badges - Top Right (Best Chance, Popular, or Current) */}
                {(plan.id.includes("boss") || plan.id.includes("power")) && (
                  <BestChanceBadge position="top-right" size="small" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme} />
                )}
                {!(plan.id.includes("boss") || plan.id.includes("power")) && (isCurrentPlan(plan) || (plan.isPopular && !isCurrentPlan(plan))) && (
                  <CornerRibbonBadge
                    position="top-right"
                    size="small"
                    badgeStyle={colorScheme.badgeStyle}
                    colorScheme={colorScheme}
                  >
                    {isCurrentPlan(plan) ? "CURRENT" : "MOST POPULAR"}
                  </CornerRibbonBadge>
                )}

                {/* Current Selection Indicator */}
                {isSelectedPlan(plan) && !isCurrentPlan(plan) && (
                  <div
                    className="absolute -top-1 -right-1 text-white rounded-full p-0.5 sm:p-1 flex items-center justify-center"
                    style={{ background: accentHex }}
                  >
                    <Check size={10} className="sm:hidden" />
                    <Check size={12} className="hidden sm:block" />
                  </div>
                )}

                {/* Package Icon - Centered at top */}
                {getPackageIcon(plan.id) && (
                  <div className="absolute -top-4 sm:-top-5 left-1/2 transform -translate-x-1/2 z-20">
                    <div
                      className={`w-8 h-8 sm:w-12 sm:h-12 relative ${
                        plan.id.includes("boss") ? "scale-110 sm:scale-110" : ""
                      }`}
                    >
                      <Image
                        src={getPackageIcon(plan.id)!}
                        alt={`${plan.name} icon`}
                        fill
                        sizes="(max-width: 640px) 32px, 48px"
                        className={`w-full h-full object-contain ${colorScheme.glow} opacity-90`}
                      />
                    </div>
                  </div>
                )}

                {/* Plan Content - Centered Layout */}
                <div className="text-center pt-8 sm:pt-8">
                  <div className="flex items-center justify-center gap-2 mb-1 sm:mb-1.5">
                    <h3
                      className="text-base sm:text-lg font-bold tracking-wide"
                      style={colorScheme.textGradientStyle ?? { color: accentHex }}
                    >
                      {plan.name}
                    </h3>
                  </div>
                  {plan.subtitle && (
                    <p
                      className="text-xs sm:text-sm mb-1.5 sm:mb-2"
                      style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : { color: "rgba(255,255,255,0.8)" }}
                    >
                      {plan.subtitle}
                    </p>
                  )}

                  {/* Entries - Centered */}
                  <div className="flex items-center justify-center mb-2 sm:mb-3">
                    <div className="text-center">
                      {(() => {
                        const entriesFeature = plan.features.find(
                          (feature) => feature.text.includes("Entries") || feature.text.includes("entries")
                        );
                        if (entriesFeature) {
                          const entriesText = entriesFeature.text;
                          const entriesNumber = entriesText.match(/(\d+)/)?.[1] || "0";
                          const isPromoActive = plan.metadata?.isPromoActive;
                          const promoMultiplier = (plan.metadata?.promoMultiplier as number) || 1;
                          const originalEntries = isPromoActive
                            ? Math.floor(parseInt(entriesNumber) / promoMultiplier)
                            : parseInt(entriesNumber);

                          return (
                            <div className={colorScheme.textGradientStyle ? "" : "text-white"}>
                              {isPromoActive ? (
                                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                                  <span className="text-sm sm:text-base font-bold line-through opacity-40 text-white/70">
                                    {originalEntries}
                                  </span>
                                  <span
                                    className="text-sm sm:text-base font-bold"
                                    style={colorScheme.textGradientStyle ?? { color: "white" }}
                                  >
                                    →
                                  </span>
                                  <span
                                    className="text-xl sm:text-2xl font-bold"
                                    style={colorScheme.textGradientStyle ?? { color: accentHex }}
                                  >
                                    {entriesNumber}
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className="text-xl sm:text-2xl font-bold"
                                  style={colorScheme.textGradientStyle ?? { color: accentHex }}
                                >
                                  {entriesNumber}
                                </span>
                              )}
                              <div
                                className="text-xs sm:text-sm"
                                style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : { color: accentHex }}
                              >
                                Free Entries Major Giveaway
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* Other features as preview (excluding entries) */}
                  {plan.features
                    .filter((feature) => !feature.text.includes("Entries") && !feature.text.includes("entries"))
                    .slice(0, 1)
                    .map((feature, index) => (
                      <p key={index} className="text-xs sm:text-sm text-white/80 mb-0">
                        {feature.text}
                      </p>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

       
      </ModalContent>
    </ModalContainer>
  );
};

export default PackageSelectionModal;
