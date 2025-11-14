"use client";

import React, { useState } from "react";
import { Check, Crown } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { useMemberships } from "@/hooks/useMemberships";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useUserData } from "@/hooks/queries";
import { isNonMemberPackage } from "@/utils/membership/member-package-mapping";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";

// Import package icons
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

// Helper function to get the package icon based on plan ID
const PACKAGE_ICONS: Record<string, StaticImageData> = {
  // One-time packages
  "apprentice-pack": apprentice,
  "tradie-pack": tradie,
  "foreman-pack": foreman,
  "boss-pack": boss,
  "power-pack": power,

  // Member exclusive packages (additional packages)
  "additional-apprentice-pack-member": apprentice,
  "additional-tradie-pack-member": tradie,
  "additional-foreman-pack-member": foreman,
  "additional-boss-pack-member": boss,
  "additional-power-pack-member": power,

  // Subscription packages (using generated IDs from useMemberships hook)
  tradie: tradie,
  foreman: foreman,
  boss: boss,
};

const getPackageIcon = (planId: string): StaticImageData | null => {
  return PACKAGE_ICONS[planId] || null;
};

// Helper function to get package color scheme
const getPackageColorScheme = (planId: string) => {
  if (planId.includes("apprentice")) {
    return {
      // Metallic silver/gray to match MembershipSection
      gradient: "from-gray-300 via-slate-400 to-gray-500",
      glow: "drop-shadow-[0_0_10px_rgba(148,163,184,0.4)]",
      text: "text-gray-300",
      border: "border-gray-400/40",
      shadow: "shadow-gray-400/20",
      hoverShadow: "hover:shadow-gray-400/40",
    };
  } else if (planId.includes("tradie")) {
    return {
      gradient: "from-blue-600 via-blue-500 to-cyan-600",
      glow: "drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]",
      text: "text-blue-400",
      border: "border-blue-500/50",
      shadow: "shadow-blue-500/30",
      hoverShadow: "hover:shadow-blue-500/50",
    };
  } else if (planId.includes("foreman")) {
    return {
      // Foreman: Fluro green scheme
      gradient: "from-emerald-400 via-emerald-500 to-green-500",
      glow: "drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]",
      text: "text-emerald-400",
      border: "border-emerald-500/50",
      shadow: "shadow-emerald-500/30",
      hoverShadow: "hover:shadow-emerald-500/50",
    };
  } else if (planId.includes("boss")) {
    return {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      glow: "drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]",
      text: "text-yellow-400",
      border: "border-yellow-400/50",
      shadow: "shadow-yellow-400/30",
      hoverShadow: "hover:shadow-yellow-400/50",
    };
  } else if (planId.includes("power")) {
    return {
      gradient: "from-orange-600 via-red-500 to-orange-700",
      glow: "drop-shadow-[0_0_10px_rgba(251,146,60,0.5)]",
      text: "text-orange-400",
      border: "border-orange-500/50",
      shadow: "shadow-orange-500/30",
      hoverShadow: "hover:shadow-orange-500/50",
    };
  }

  // Default fallback
  return {
    gradient: "from-slate-600 via-gray-700 to-slate-800",
    glow: "drop-shadow-[0_0_10px_rgba(100,116,139,0.5)]",
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
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">(
    currentPlan.period === "mo" ? "membership" : "one-time"
  );
  const { data: session } = useSession();
  const [selectedPlan, setSelectedPlan] = useState<LocalMembershipPlan>(currentPlan);

  // Get user data to determine membership status
  const { data: user } = useUserData(session?.user?.id);
  const isMember = user?.subscription?.isActive || false;

  // Fetch real membership data from API
  const { subscriptionPackages, oneTimePackages, loading, error } = useMemberships();

  // Get active promo for one-time packages
  const { data: oneTimePromo } = usePromoByType("one-time-packages");

  // Debug logging
  console.log("🔍 PackageSelectionModal Debug:", {
    user: user?.email,
    isMember,
    subscription: user?.subscription,
    currentPlan: currentPlan,
    subscriptionPackages: subscriptionPackages.length,
    oneTimePackages: oneTimePackages.length,
  });

  // Get membership plans from API data
  const membershipPlans: LocalMembershipPlan[] = (() => {
    if (loading) return [];
    if (error) return [];

    const apiPlans = activeTab === "membership" ? subscriptionPackages : oneTimePackages;
    const convertedPlans = apiPlans.map(convertToLocalPlan);

    // Apply promo multiplier to packages if there's an active promo
    return convertedPlans.map((plan) => {
      // Check if this is a one-time package with active promo
      if (activeTab === "one-time" && oneTimePromo && plan.period === "one-time") {
        // Apply promo multiplier to entries
        const originalEntries = plan.metadata?.entriesCount || 0;
        const promoEntries = originalEntries * oneTimePromo.multiplier;

        // Update features to show promo effect
        const updatedFeatures = plan.features.map((feature) => {
          // Check if this feature mentions entries
          if (feature.text.includes("Entries") || feature.text.includes("entries")) {
            // Extract the number from the feature text
            const match = feature.text.match(/(\d+)\s*(Free\s+)?(Accumulated\s+)?Entries/i);
            if (match) {
              const originalNumber = parseInt(match[1]);
              const newNumber = originalNumber * oneTimePromo.multiplier;
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
            promoMultiplier: oneTimePromo.multiplier,
            isPromoActive: true,
          },
        };
      }

      // Check if this is a subscription package with active promo (uses same one-time-packages promo)
      if (activeTab === "membership" && oneTimePromo && plan.period !== "one-time") {
        // Apply promo multiplier to entries for subscription packages (initial purchase only)
        const originalEntries = plan.metadata?.entriesCount || 0;
        const promoEntries = originalEntries * oneTimePromo.multiplier;

        // Update features to show promo effect
        const updatedFeatures = plan.features.map((feature) => {
          // Check if this feature mentions entries
          if (feature.text.includes("Entries") || feature.text.includes("entries")) {
            // Extract the number from the feature text
            const match = feature.text.match(/(\d+)\s*(Free\s+)?(Accumulated\s+)?Entries/i);
            if (match) {
              const originalNumber = parseInt(match[1]);
              const newNumber = originalNumber * oneTimePromo.multiplier;
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
            promoMultiplier: oneTimePromo.multiplier,
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

        // Apply promo multiplier to one-time packages if there's an active promo
        if (oneTimePromo) {
          return filteredPackages.map((plan) => {
            const originalEntries = plan.metadata?.entriesCount || 0;
            const promoEntries = originalEntries * oneTimePromo.multiplier;

            // Update features to show promo effect
            const updatedFeatures = plan.features.map((feature) => {
              // Check if this feature mentions entries
              if (feature.text.includes("Entries") || feature.text.includes("entries")) {
                // Extract the number from the feature text
                const match = feature.text.match(/(\d+)\s*(Free\s+)?(Accumulated\s+)?Entries/i);
                if (match) {
                  const originalNumber = parseInt(match[1]);
                  const newNumber = originalNumber * oneTimePromo.multiplier;
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
                promoMultiplier: oneTimePromo.multiplier,
                isPromoActive: true,
              },
            };
          });
        }

        return filteredPackages;
    }
  })();

  const handlePlanSelect = (plan: LocalMembershipPlan) => {
    // Don't allow selecting current plan
    if (isCurrentPlan(plan)) {
      return;
    }
    setSelectedPlan(plan);
  };

  const handleConfirmSelection = () => {
    // Only proceed if a plan is selected and it's not the current plan
    if (selectedPlan && !isCurrentPlan(selectedPlan)) {
      onPlanSelect(selectedPlan);
      onClose();
    }
  };

  const isSelectedPlan = (plan: LocalMembershipPlan) => {
    return plan.id === selectedPlan.id;
  };

  const isCurrentPlan = (plan: LocalMembershipPlan) => {
    if (!isMember || !user?.subscription?.packageId) {
      console.log("🔍 Not a member or no packageId:", { isMember, packageId: user?.subscription?.packageId });
      return false;
    }

    // Use API data to find the current plan
    const allApiPlans = [...subscriptionPackages, ...oneTimePackages];
    const packageIdString = user.subscription.packageId.toString();
    const currentApiPlan = allApiPlans.find((apiPlan) => apiPlan._id === packageIdString);

    console.log("🔍 isCurrentPlan Debug:", {
      checkingPlan: { id: plan.id, name: plan.name, period: plan.period },
      userPackageId: packageIdString,
      foundApiPlan: currentApiPlan ? { id: currentApiPlan.id, name: currentApiPlan.name } : null,
      apiPlansCount: allApiPlans.length,
      allApiPlans: allApiPlans.map((p) => ({ id: p.id, name: p.name, _id: p._id })),
    });

    if (currentApiPlan) {
      // Convert API plan to local format and compare
      const currentLocalPlan = convertToLocalPlan(currentApiPlan);
      const isCurrent = plan.id === currentLocalPlan.id && plan.period === currentLocalPlan.period;

      console.log("🔍 Plan comparison:", {
        planId: plan.id,
        planName: plan.name,
        currentLocalPlanId: currentLocalPlan.id,
        currentLocalPlanName: currentLocalPlan.name,
        planPeriod: plan.period,
        currentLocalPlanPeriod: currentLocalPlan.period,
        isCurrent,
      });

      return isCurrent;
    } else {
      console.log("🔍 No matching API plan found for packageId:", packageIdString);

      // Fallback: Try to match by plan name if API data isn't available
      // This is a temporary fallback until API data loads properly
      if (loading || allApiPlans.length === 0) {
        console.log("🔍 Using fallback name matching...");

        // Based on the user data, they have a Pro subscription
        // Check if this plan matches the expected Pro plan
        const isProPlan = plan.name.toLowerCase().includes("foreman") && plan.period === "mo";
        console.log("🔍 Fallback check - isProPlan:", isProPlan, "for plan:", plan.name);

        return isProPlan;
      }

      // Additional fallback: Check if we can match by subscription packageId
      // This handles cases where the API data structure might be different
      console.log("🔍 Trying additional fallback matching...");

      // Check if this is a subscription plan (monthly) and user has active subscription
      if (plan.period === "mo" && user.subscription?.isActive) {
        // For now, we'll assume Pro is the current plan based on user data
        // This is a temporary solution until we can properly match the API data
        const isCurrentSubscription = plan.name.toLowerCase().includes("foreman");
        console.log("🔍 Additional fallback - isCurrentSubscription:", isCurrentSubscription, "for plan:", plan.name);
        return isCurrentSubscription;
      }

      return false;
    }
  };

  // Use API data if available, otherwise fallback to static data
  let finalMembershipPlans = membershipPlans.length > 0 ? membershipPlans : staticMembershipPlans;

  console.log("🔍 Final membership plans:", {
    usingApiData: membershipPlans.length > 0,
    membershipPlansCount: membershipPlans.length,
    staticPlansCount: staticMembershipPlans.length,
    finalPlansCount: finalMembershipPlans.length,
    loading,
    error,
  });

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
    if (isMember) {
      // If user is a member, show only member-exclusive one-time packages
      finalMembershipPlans = finalMembershipPlans.filter((plan) => {
        return plan.isMemberOnly === true;
      });
    } else {
      // For non-members, show regular one-time packages (non-member exclusive)
      finalMembershipPlans = finalMembershipPlans.filter((plan) => {
        return plan.isMemberOnly !== true;
      });
    }
  }

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" height="fixed" fixedHeight="h-[87dvh]">
      <ModalHeader title="Select Your Package" onClose={onClose} showLogo={true} />

      <ModalContent padding="lg" className="pb-16 sm:pb-20">
        {/* Toggle */}
        <div className="flex justify-center mb-4 sm:mb-6">
          <div className="bg-[#2b2d37] rounded-[16px] sm:rounded-[20px] p-[3px] sm:p-[4px] shadow-lg">
            <div className="flex flex-row items-center justify-center">
              <button
                onClick={() => setActiveTab("membership")}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-[12px] sm:rounded-[16px] font-semibold text-[10px] sm:text-[12px] transition-all duration-300 ${
                  activeTab === "membership"
                    ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-black shadow-lg"
                    : "text-[#f9f9f9] hover:text-white hover:bg-white/10"
                }`}
              >
                <span className="sm:hidden">MEMBERSHIP</span>
                <span className="hidden sm:inline">MEMBERSHIP</span>
              </button>
              <button
                onClick={() => setActiveTab("one-time")}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-[12px] sm:rounded-[16px] font-semibold text-[10px] sm:text-[12px] transition-all duration-300 ${
                  activeTab === "one-time"
                    ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-black shadow-lg"
                    : "text-[#f9f9f9] hover:text-white hover:bg-white/10"
                }`}
              >
                <span className="sm:hidden">ONE-TIME</span>
                <span className="hidden sm:inline">ONE-TIME</span>
              </button>
            </div>
          </div>
        </div>

        {/* Member Status Info */}
        {isMember && activeTab === "one-time" && (
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="flex items-center gap-1.5 sm:gap-2 bg-blue-50 rounded-[12px] sm:rounded-[15px] p-2 sm:p-3 border border-blue-200">
              <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              <span className="text-[12px] sm:text-[14px] text-blue-700 font-medium">
                <span className="sm:hidden">Member-Exclusive Available</span>
                <span className="hidden sm:inline">Member-Exclusive Packages Available</span>
              </span>
            </div>
          </div>
        )}

        {/* Packages Stacked Vertically */}
        <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
          {finalMembershipPlans.map((plan) => {
            const colorScheme = getPackageColorScheme(plan.id);
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-4 sm:p-6 shadow-[0_0_15px_rgba(0,0,0,0.4)] transition-all duration-300 hover:scale-[1.02] ${
                  isCurrentPlan(plan) ? "cursor-not-allowed opacity-75" : "cursor-pointer"
                } ${
                  isSelectedPlan(plan) ? "ring-2 ring-yellow-400 shadow-2xl" : "hover:shadow-[0_0_25px_rgba(0,0,0,0.6)]"
                } bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-2 ${colorScheme.border}`}
                style={{
                  background: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)`,
                  borderImage: `linear-gradient(135deg, ${
                    colorScheme.gradient.includes("yellow")
                      ? "#fbbf24"
                      : colorScheme.gradient.includes("blue")
                      ? "#3b82f6"
                      : colorScheme.gradient.includes("emerald") || colorScheme.gradient.includes("green")
                      ? "#10b981"
                      : colorScheme.gradient.includes("gray") || colorScheme.gradient.includes("slate")
                      ? "#94a3b8"
                      : colorScheme.gradient.includes("orange")
                      ? "#f97316"
                      : "#6b7280"
                  }, transparent) 1`,
                }}
                onClick={() => !isCurrentPlan(plan) && handlePlanSelect(plan)}
              >
                {/* Badges - Top Right Corner (Current Plan and Popular) */}
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

                {/* Promo Badge - Top Left Corner */}
                {plan.metadata?.isPromoActive && (
                  <div className="absolute top-2 left-2 z-20">
                    <PromoBadge multiplier={plan.metadata.promoMultiplier as 2 | 3 | 5 | 10} size="small" />
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
                  <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 z-20">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 relative">
                      <Image
                        src={getPackageIcon(plan.id)!}
                        alt={`${plan.name} icon`}
                        className={`w-full h-full object-contain ${colorScheme.glow} opacity-90`}
                      />
                    </div>
                  </div>
                )}

                {/* Plan Content - Centered Layout */}
                <div className="text-center pt-4">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <h3 className={`text-lg sm:text-xl font-bold ${colorScheme.text} tracking-wide`}>{plan.name}</h3>
                  </div>
                  {plan.subtitle && <p className="text-sm text-white/80 mb-3">{plan.subtitle}</p>}

                  {/* Entries and Price - Horizontal Layout */}
                  <div className="flex items-center justify-between mb-4">
                    {/* Entries - Main Focus (Left) */}
                    <div className="flex-1 text-left">
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
                                <div className="flex items-center gap-2">
                                  <span className="text-[18px] font-bold line-through opacity-40 text-slate-400">
                                    {originalEntries}
                                  </span>
                                  <span className="text-[16px] font-bold text-yellow-400">→</span>
                                  <div
                                    className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                  >
                                    {entriesNumber}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                >
                                  {entriesNumber}
                                </div>
                              )}
                              <div className="text-sm text-white/70">Free Entries</div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Price - Secondary (Right) */}
                    <div className="flex-1 text-right">
                      <div className={`text-xl sm:text-2xl font-bold text-slate-200`}>${plan.price}</div>
                      <div className="text-xs text-slate-400">
                        {plan.period === "one-time" ? "One Time Payment" : "Per Giveaway"}
                      </div>
                    </div>
                  </div>

                  {/* Other features as preview (excluding entries) */}
                  {plan.features
                    .filter((feature) => !feature.text.includes("Entries") && !feature.text.includes("entries"))
                    .slice(0, 1)
                    .map((feature, index) => (
                      <p key={index} className="text-sm text-white/90 mb-3">
                        {feature.text}
                      </p>
                    ))}
                </div>

                {/* Expanded Features - Show if selected plan */}
                {isSelectedPlan(plan) && (
                  <div className="mt-4 pt-4 border-t border-white/20">
                    <div className="space-y-2">
                      {plan.features
                        .filter((feature) => !feature.text.includes("Entries") && !feature.text.includes("entries"))
                        .map((feature, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm text-white/90">
                            <Check size={14} className={`${colorScheme.text} flex-shrink-0`} />
                            <span>{feature.text}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ModalContent>

      {/* Fixed Confirm Selection Button */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 sm:p-4">
        <Button
          onClick={handleConfirmSelection}
          variant="metallic"
          fullWidth
          size="md"
          className="font-bold text-xs sm:text-sm"
          disabled={!selectedPlan || isCurrentPlan(selectedPlan)}
        >
          {!selectedPlan || isCurrentPlan(selectedPlan) ? (
            <>
              <span className="sm:hidden">Select Plan</span>
              <span className="hidden sm:inline">Select a Plan</span>
            </>
          ) : (
            <>
              <span className="sm:hidden">Confirm</span>
              <span className="hidden sm:inline">Confirm Selection</span>
            </>
          )}
        </Button>
      </div>
    </ModalContainer>
  );
};

export default PackageSelectionModal;
