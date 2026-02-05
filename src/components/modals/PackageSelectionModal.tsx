"use client";

import React, { useState } from "react";
import { Check } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { useMemberships } from "@/hooks/useMemberships";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useUserData } from "@/hooks/queries";
import { isNonMemberPackage } from "@/utils/membership/member-package-mapping";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import BestChanceBadge from "@/components/ui/BestChanceBadge";
import PromoMultiplierBadge from "@/components/ui/PromoMultiplierBadge";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import VerticalAccumulationChart from "@/components/ui/VerticalAccumulationChart";
import { getPackageIcon } from "@/utils/images/package-icons";

// Helper function to extract gradient color for rounded borders
const getGradientColor = (gradient: string) => {
  if (gradient.includes("yellow-4") || gradient.includes("yellow-400")) return "#fbbf24";
  if (gradient.includes("blue-6") || gradient.includes("blue-500") || gradient.includes("blue-600")) return "#3b82f6";
  if (gradient.includes("emerald") || gradient.includes("green-5") || gradient.includes("green-500")) return "#10b981";
  if (gradient.includes("gray-3") || gradient.includes("slate-4") || gradient.includes("gray-400")) return "#94a3b8";
  if (gradient.includes("orange-6") || gradient.includes("orange-5") || gradient.includes("orange-500"))
    return "#f97316";
  return "#6b7280";
};

// Helper function to convert hex color to rgba for box-shadow
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Helper function to get package color scheme
const getPackageColorScheme = (planId: string) => {
  if (planId.includes("apprentice")) {
    return {
      // Metallic silver/gray to match MembershipSection
      gradient: "from-gray-300 via-slate-400 to-gray-500",
      glow: "drop-shadow-[0_0_12px_rgba(148,163,184,0.52)]",
      text: "text-gray-300",
      border: "border-gray-400/40",
      shadow: "shadow-gray-400/20",
      hoverShadow: "hover:shadow-gray-400/40",
    };
  } else if (planId.includes("tradie")) {
    return {
      gradient: "from-blue-600 via-blue-500 to-cyan-600",
      glow: "drop-shadow-[0_0_12px_rgba(59,130,246,0.65)]",
      text: "text-blue-400",
      border: "border-blue-500/50",
      shadow: "shadow-blue-500/30",
      hoverShadow: "hover:shadow-blue-500/50",
    };
  } else if (planId.includes("foreman")) {
    return {
      // Foreman: Fluro green scheme
      gradient: "from-emerald-400 via-emerald-500 to-green-500",
      glow: "drop-shadow-[0_0_15px_rgba(16,185,129,0.78)]",
      text: "text-emerald-400",
      border: "border-emerald-500/50",
      shadow: "shadow-emerald-500/30",
      hoverShadow: "hover:shadow-emerald-500/50",
    };
  } else if (planId.includes("boss")) {
    return {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      glow: "drop-shadow-[0_0_12px_rgba(251,191,36,0.65)]",
      text: "text-yellow-400",
      border: "border-yellow-400/50",
      shadow: "shadow-yellow-400/30",
      hoverShadow: "hover:shadow-yellow-400/50",
    };
  } else if (planId.includes("power")) {
    return {
      gradient: "from-orange-600 via-red-500 to-orange-700",
      glow: "drop-shadow-[0_0_12px_rgba(251,146,60,0.65)]",
      text: "text-orange-400",
      border: "border-orange-500/50",
      shadow: "shadow-orange-500/30",
      hoverShadow: "hover:shadow-orange-500/50",
    };
  }

  // Default fallback
  return {
    gradient: "from-slate-600 via-gray-700 to-slate-800",
    glow: "drop-shadow-[0_0_12px_rgba(100,116,139,0.65)]",
    text: "text-gray-400",
    border: "border-gray-500/50",
    shadow: "shadow-gray-500/30",
    hoverShadow: "hover:shadow-gray-500/50",
  };
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

      // Check if this is a one-time package (use resolved multiplier)
      if (showingOneTime && plan.period === "one-time" && resolvedOneTimeMultiplier !== null && resolvedOneTimeMultiplier > 1) {
        // Apply resolved multiplier to entries (includes alternating if no active promo)
        const originalEntries = plan.metadata?.entriesCount || 0;
        const promoMultiplier = resolvedOneTimeMultiplier;
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
            isPromoActive: (resolvedOneTimeMultiplier ?? 1) > 1,
          },
        };
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
              { text: "5% Off Shop" },
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
              { text: "10% Off Shop" },
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
              { text: "20% Off Shop" },
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
    <ModalContainer isOpen={isOpen} onClose={onClose} size="sm" height="fixed" fixedHeight="min-h-[80dvh]">
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
            const colorScheme = getPackageColorScheme(plan.id);
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
                  border: isSelectedPlan(plan)
                    ? `3px solid ${getGradientColor(colorScheme.gradient)}`
                    : `2px solid transparent`,
                  backgroundImage: isSelectedPlan(plan)
                    ? `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${hexToRgba(
                        getGradientColor(colorScheme.gradient),
                        0.8
                      )}, ${hexToRgba(getGradientColor(colorScheme.gradient), 0.5)})`
                    : `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${getGradientColor(
                        colorScheme.gradient
                      )}, transparent)`,
                  backgroundOrigin: `border-box`,
                  backgroundClip: `padding-box, border-box`,
                  boxShadow: isSelectedPlan(plan)
                    ? `0 0 20px ${hexToRgba(getGradientColor(colorScheme.gradient), 0.6)}, 0 0 40px ${hexToRgba(
                        getGradientColor(colorScheme.gradient),
                        0.4
                      )}, 0 0 60px rgba(251, 191, 36, 0.3), 0 0 0 4px rgba(251, 191, 36, 0.2)`
                    : `0 0 15px ${hexToRgba(getGradientColor(colorScheme.gradient), 0.4)}, 0 0 30px ${hexToRgba(
                        getGradientColor(colorScheme.gradient),
                        0.2
                      )}`,
                }}
                onClick={() => !isCurrentPlan(plan) && handlePlanSelect(plan)}
              >
                {/* Promo Badge - Top Left Corner */}
                {plan.metadata?.isPromoActive && plan.metadata?.promoMultiplier && (
                  <div className="absolute top-2 left-2 z-20">
                    <PromoBadge
                      multiplier={plan.metadata.promoMultiplier as 2 | 3 | 5 | 10}
                      size="small"
                      showPromoText={false}
                    />
                  </div>
                )}

                {/* Best Chance Badge - Top Right Corner (for boss/power packages) */}
                {(plan.id.includes("boss") || plan.id.includes("power")) && (
                  <div className="absolute top-1.5 right-1.5 z-20">
                    <BestChanceBadge size="xs" />
                  </div>
                )}

                {/* Badges - Top Right Corner (Current Plan and Popular) - Only show if not boss/power */}
                {!(plan.id.includes("boss") || plan.id.includes("power")) && (
                  <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
                    {/* Current Plan Badge - Highest Priority */}
                    {isCurrentPlan(plan) && (
                      <div className="bg-green-500 text-white rounded-full px-1.5 sm:px-2 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold shadow-lg">
                        <span className="sm:hidden">CURRENT</span>
                        <span className="hidden sm:inline">CURRENT PLAN</span>
                      </div>
                    )}
                    {/* Popular Badge - Show only if not current plan */}
                    {plan.isPopular && !isCurrentPlan(plan) && (
                      <div className="bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-black px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-bold text-[8px] sm:text-[10px] shadow-xl shadow-yellow-500/50 border border-yellow-300">
                        <span className="sm:hidden">POPULAR</span>
                        <span className="hidden sm:inline">POPULAR</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Current Selection Indicator */}
                {isSelectedPlan(plan) && !isCurrentPlan(plan) && (
                  <div className="absolute -top-1 -right-1 bg-yellow-400 text-black rounded-full p-0.5 sm:p-1">
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
                <div className="text-center pt-2 sm:pt-3">
                  <div className="flex items-center justify-center gap-2 mb-1 sm:mb-1.5">
                    <h3 className={`text-base sm:text-lg font-bold ${colorScheme.text} tracking-wide`}>{plan.name}</h3>
                  </div>
                  {plan.subtitle && <p className="text-xs sm:text-sm text-white/80 mb-1.5 sm:mb-2">{plan.subtitle}</p>}

                  {/* Price and Entries - Reordered Layout */}
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    {/* Price - Left Side (moved from right) */}
                    <div className="flex-1 text-left">
                      <div className={`text-lg sm:text-xl font-bold text-slate-200`}>${plan.price}</div>
                      <div className="text-[10px] sm:text-xs text-slate-400">
                        {plan.period === "one-time" ? "One Time Payment" : "Per Giveaway"}
                      </div>
                    </div>

                    {/* Free Entries - Center (moved from left) */}
                    <div className="flex-1 text-center">
                      {(() => {
                        // Extract entries from features
                        const entriesFeature = plan.features.find(
                          (feature) => feature.text.includes("Entries") || feature.text.includes("entries")
                        );
                        if (entriesFeature) {
                          const entriesText = entriesFeature.text;
                          const entriesNumber = entriesText.match(/(\d+)/)?.[1] || "0";

                          // Check if promo is active
                          const isPromoActive = plan.metadata?.isPromoActive;
                          const promoMultiplier = (plan.metadata?.promoMultiplier as number) || 1;
                          const originalEntries = isPromoActive
                            ? Math.floor(parseInt(entriesNumber) / promoMultiplier)
                            : parseInt(entriesNumber);

                          return (
                            <div className={`${colorScheme.text}`}>
                              {isPromoActive ? (
                                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                                  <span className="text-sm sm:text-base font-bold line-through opacity-40 text-slate-400">
                                    {originalEntries}
                                  </span>
                                  <span className="text-sm sm:text-base font-bold text-yellow-400">→</span>
                                  <div
                                    className={`text-xl sm:text-2xl font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                  >
                                    {entriesNumber}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`text-xl sm:text-2xl font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                >
                                  {entriesNumber}
                                </div>
                              )}
                              <div className={`text-xs sm:text-sm ${colorScheme.text}`}>Free Entries</div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Empty space for balance - Right */}
                    <div className="flex-1"></div>
                  </div>

                  {/* Other features as preview (excluding entries) */}
                  {plan.features
                    .filter((feature) => !feature.text.includes("Entries") && !feature.text.includes("entries"))
                    .slice(0, 1)
                    .map((feature, index) => (
                      <p key={index} className="text-xs sm:text-sm text-white/90 mb-0">
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
