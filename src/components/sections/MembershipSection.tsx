"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import MembershipModal from "@/components/modals/MembershipModal";
import { useMemberships } from "@/hooks/useMemberships";
import { useUserContext } from "@/contexts/UserContext";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import PromoMultiplierBadge from "@/components/ui/PromoMultiplierBadge";
import BestChanceBadge from "@/components/ui/BestChanceBadge";
import { useUserMajorDrawStats, useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import PackageInclusionsExpanded from "@/components/modals/PackageInclusionsSlideUp";
import { getPackageIcon } from "@/utils/images/package-icons";
import { VariantConfig } from "@/models/ab-testing/Variant";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";

interface MembershipSectionProps {
  title?: string;
  padding?: string;
  titleColor?: string;
  onPlanSelect?: (plan: LocalMembershipPlan) => void;
  variantConfig?: VariantConfig["packages"]; // Optional variant config for packages
}

// Helper function to extract gradient colors for rounded borders
const getGradientColor = (gradient: string) => {
  if (gradient.includes("yellow-3") || gradient.includes("yellow-4")) return "#facc15";
  if (gradient.includes("blue")) return "#3b82f6";
  if (gradient.includes("purple")) return "#9333ea";
  if (gradient.includes("orange")) return "#f97316";
  if (gradient.includes("yellow-4") && gradient.includes("amber")) return "#fbbf24";
  if (gradient.includes("gray-300") || gradient.includes("slate-400")) return "#94a3b8"; // Silver
  if (gradient.includes("blue-500") || gradient.includes("blue-600")) return "#3b82f6"; // Blue
  if (gradient.includes("green-500") || gradient.includes("green-600")) return "#22c55e"; // Green
  return "#6b7280";
};

// Helper function to get package glow colors for inside glow
const getPackageGlowColor = (planId: string) => {
  if (planId.includes("apprentice")) {
    return "from-gray-400/10 via-gray-400/2.5 to-transparent"; // Silver
  } else if (planId.includes("tradie")) {
    return "from-blue-500/10 via-blue-500/2.5 to-transparent"; // Blue
  } else if (planId.includes("foreman")) {
    return "from-green-500/10 via-green-500/2.5 to-transparent"; // Green
  } else if (planId.includes("boss")) {
    return "from-yellow-500/10 via-yellow-500/2.5 to-transparent"; // Gold
  } else if (planId.includes("power")) {
    return "from-orange-500/10 via-orange-500/2.5 to-transparent"; // Orange
  }
  return "from-gray-500/10 via-gray-500/2.5 to-transparent"; // Default
};

// Helper function to get package color scheme
const getPackageColorScheme = (planId: string) => {
  if (planId.includes("apprentice")) {
    return {
      gradient: "from-gray-300 via-slate-400 to-gray-500",
      glow: "animate-glow-pulse-silver",
      text: "text-gray-300",
      border: "border-gray-400/40",
      shadow: "shadow-gray-400/20",
      hoverShadow: "hover:shadow-gray-400/40",
      borderGlow: "animate-border-glow-silver",
      badgeStyle: {
        background: "linear-gradient(135deg, #d1d5db 0%, #94a3b8 25%, #6b7280 50%, #4b5563 75%, #d1d5db 100%)",
        boxShadow: "0 0 25px rgba(148, 163, 184, 0.6), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.8)",
      },
    };
  } else if (planId.includes("tradie")) {
    return {
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      glow: "animate-glow-pulse-blue",
      text: "text-blue-400",
      border: "border-blue-500/50",
      shadow: "shadow-blue-500/30",
      hoverShadow: "hover:shadow-blue-500/50",
      borderGlow: "animate-border-glow-blue",
      badgeStyle: {
        background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 25%, #1d4ed8 50%, #1e40af 75%, #3b82f6 100%)",
        boxShadow: "0 0 25px rgba(59, 130, 246, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
        border: "1px solid rgba(147, 197, 253, 0.8)",
      },
    };
  } else if (planId.includes("foreman")) {
    return {
      gradient: "from-green-500 via-green-600 to-green-700",
      glow: "animate-glow-pulse-green",
      text: "text-green-300",
      border: "border-green-500/50",
      shadow: "shadow-green-500/30",
      hoverShadow: "hover:shadow-green-500/50",
      borderGlow: "animate-border-glow-green",
      badgeStyle: {
        background: "linear-gradient(135deg, #22c55e 0%, #16a34a 25%, #15803d 50%, #166534 75%, #22c55e 100%)",
        boxShadow: "0 0 25px rgba(34, 197, 94, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
        border: "1px solid rgba(134, 239, 172, 0.8)",
      },
    };
  } else if (planId.includes("boss")) {
    return {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      glow: "animate-glow-pulse-gold",
      text: "text-yellow-400",
      border: "border-yellow-400/50",
      shadow: "shadow-yellow-400/30",
      hoverShadow: "hover:shadow-yellow-400/50",
      borderGlow: "animate-border-glow-gold",
      badgeStyle: {
        background: "linear-gradient(135deg, #facc15 0%, #eab308 25%, #ca8a04 50%, #a16207 75%, #facc15 100%)",
        boxShadow: "0 0 25px rgba(234, 179, 8, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
        border: "1px solid rgba(253, 224, 71, 0.8)",
      },
    };
  } else if (planId.includes("power")) {
    return {
      gradient: "from-orange-600 via-red-500 to-orange-700",
      glow: "animate-glow-pulse-orange",
      text: "text-orange-400",
      border: "border-orange-500/50",
      shadow: "shadow-orange-500/30",
      hoverShadow: "hover:shadow-orange-500/50",
      borderGlow: "animate-border-glow-orange",
      badgeStyle: {
        background: "linear-gradient(135deg, #ea580c 0%, #ee0000 25%, #dc2626 50%, #b91c1c 75%, #ea580c 100%)",
        boxShadow: "0 0 25px rgba(239, 68, 68, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
        border: "1px solid rgba(251, 146, 60, 0.8)",
      },
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
    borderGlow: "animate-border-glow-blue",
    badgeStyle: {
      background: "linear-gradient(135deg, #64748b 0%, #475569 25%, #334155 50%, #1e293b 75%, #64748b 100%)",
      boxShadow: "0 0 25px rgba(100, 116, 139, 0.6), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
      border: "1px solid rgba(148, 163, 184, 0.8)",
    },
  };
};

export default function MembershipSection({
  title = "CHOOSE YOUR PACKAGE",
  padding = "py-12 sm:py-16 lg:py-20",
  titleColor = "text-black",
  onPlanSelect,
  variantConfig,
}: MembershipSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Get variant config from context for A/B testing (membershipModal config)
  const { variantConfig: contextVariantConfig } = useVariantContext();
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");
  const [isMounted, setIsMounted] = useState(false);
  const [isInclusionsExpanded, setIsInclusionsExpanded] = useState(false);

  // Handle client-side mounting to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Determine pricing suffix based on current page
  // Home page (/) and membership page (/membership) show "/mo", all other pages show "Per Giveaway"
  // Default to false (show "Per Giveaway") during SSR to match client-side behavior on non-home pages
  const isHomeOrMembershipPage = isMounted && (pathname === "/" || pathname === "/membership");

  // Fetch membership data from API
  const { subscriptionPackages, oneTimePackages, loading, error } = useMemberships();

  // Fetch user data to check membership status
  const { userData, loading: userLoading } = useUserContext();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const { data: currentMajorDraw } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();
  const { requestModal } = useModalPriorityStore();

  // Use the centralized membership modal hook
  const membershipModal = useMembershipModal();

  // Get resolved multipliers (includes scheduled, toggle, and alternating)
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");

  // Listen for upsell modal requests
  useEffect(() => {
    const handleOpenMembershipModal = (event: CustomEvent) => {
      console.log("🎯 MembershipSection received openMembershipModal event:", event.detail);
      const { plan } = event.detail;
      if (plan) {
        // Check if gates are closed (freeze period or gap period)
        const gatesClosed = currentMajorDraw?.status !== "active";
        if (gatesClosed) {
          // Show gate-closed modal instead of opening payment modals
          requestModal("gate-closed", true, {
            nextActivationDate: nextDraw?.activationDate ?? null,
            nextDrawName: nextDraw?.name,
          });
          return;
        }

        membershipModal.setSelectedPlan(plan);
        membershipModal.openModal();
      }
    };

    window.addEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);

    return () => {
      window.removeEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);
    };
  }, [membershipModal, currentMajorDraw, nextDraw, requestModal]);

  // Check if user has an active subscription (only for recurring subscription plans)
  const hasActiveSubscription = userData?.subscription?.isActive || false;
  const currentUserSubscription = userData?.subscriptionPackageData;

  // past_due users have a subscription that blocks new purchases - show "Update payment" not "Enter Now"
  const hasBlockingSub = hasBlockingSubscription(userData);
  const isPastDue = (userData?.subscription as { status?: string } | undefined)?.status === "past_due";

  // Check if user has access to additional packages (subscription OR current draw entries)
  const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(userData, userMajorDrawStats);

  // Update default tab based on subscription status or access
  useEffect(() => {
    if (!userLoading && userData) {
      // If user has access (subscription OR entries), show one-time only
      // Otherwise, show membership tab
      const newTab = hasAccessToAdditionalPackages ? "one-time" : "membership";
      setActiveTab(newTab);
      // Dispatch event for FloatingPromoBanner to sync
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("membershipTabChanged", {
            detail: { activeTab: newTab },
          })
        );
      }
    }
  }, [hasAccessToAdditionalPackages, userLoading, userData]);

  // Check if a plan is the user's current subscription
  // Note: This only applies to subscription plans, not one-time packages
  const isCurrentSubscription = (plan: LocalMembershipPlan) => {
    // Only check for subscription plans, not one-time packages
    if (!currentUserSubscription || !hasActiveSubscription) return false;

    // Only apply to subscription-type plans (not one-time packages)
    if (plan.period === "one-time" || plan.name.toLowerCase().includes("one-time")) {
      return false;
    }

    // Compare by name since plan.id is a string identifier and currentUserSubscription._id is MongoDB ObjectId
    const currentName = currentUserSubscription?.name;
    if (!currentName) return false;

    const isCurrent = plan.name.toLowerCase() === currentName.toLowerCase();

    // Debug logging
    if (process.env.NODE_ENV === "development") {
      console.log("Plan comparison:", {
        planName: plan.name,
        planPeriod: plan.period,
        currentPlanName: currentName,
        isCurrent,
        isSubscriptionPlan: plan.period !== "one-time",
      });
    }

    return isCurrent;
  };

  // Determine plan hierarchy for subscription management
  const getPlanHierarchy = (plan: LocalMembershipPlan) => {
    // past_due users cannot purchase - they must resolve payment first
    const isSubscriptionPlan = plan.period !== "one-time" && !plan.name.toLowerCase().includes("one-time");
    const cannotPurchaseDueToBlocking = hasBlockingSub && isSubscriptionPlan;

    if (!hasActiveSubscription || !currentUserSubscription || plan.period === "one-time") {
      return {
        isCurrent: false,
        isUpgrade: false,
        isDowngrade: false,
        canPurchase: !cannotPurchaseDueToBlocking,
      };
    }

    const currentPrice = currentUserSubscription.price || 0;
    const planPrice = plan.price || 0;
    const isCurrent = isCurrentSubscription(plan);
    const isUpgrade = planPrice > currentPrice;
    const isDowngrade = planPrice < currentPrice;

    return {
      isCurrent,
      isUpgrade,
      isDowngrade,
      canPurchase: !isCurrent && !hasActiveSubscription && !cannotPurchaseDueToBlocking,
    };
  };

  // Handle plan selection and open modal
  const handlePlanSelect = (plan: LocalMembershipPlan) => {
    // Check if gates are closed (freeze period or gap period)
    const gatesClosed = currentMajorDraw?.status !== "active";
    if (gatesClosed) {
      // Show gate-closed modal instead of opening payment modals
      requestModal("gate-closed", true, {
        nextActivationDate: nextDraw?.activationDate ?? null,
        nextDrawName: nextDraw?.name,
      });
      return;
    }

    const hierarchy = getPlanHierarchy(plan);

    // past_due users must resolve payment first - route to my-account (pay-failed-invoice flow)
    if (hasBlockingSub && isPastDue) {
      router.push("/my-account");
      return;
    }

    // If user has active subscription and this is a downgrade, navigate to my-account
    if (hasActiveSubscription && hierarchy.isDowngrade) {
      router.push("/my-account");
      return;
    }

    // If user has active subscription and this is an upgrade, navigate to my-account
    if (hasActiveSubscription && hierarchy.isUpgrade) {
      router.push("/my-account");
      return;
    }

    // If user has active subscription and this is the current plan, navigate to my-account
    if (hasActiveSubscription && hierarchy.isCurrent) {
      router.push("/my-account");
      return;
    }

    // For new subscriptions (no active subscription), use the modal
    membershipModal.openModal(plan);

    // Call the original onPlanSelect if provided
    if (onPlanSelect) {
      onPlanSelect(plan);
    }
  };

  // Get membership plans from API data and convert to local format
  const membershipPlans: LocalMembershipPlan[] = (() => {
    console.log("🔍 MembershipSection Debug:", {
      activeTab,
      loading,
      userLoading,
      error,
      hasActiveSubscription,
      subscriptionPackages: subscriptionPackages.length,
      oneTimePackages: oneTimePackages.length,
      oneTimePackagesData: oneTimePackages.map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        isMemberOnly: pkg.isMemberOnly,
      })),
    });

    // For static membership data, don't wait for API loading but allow user filtering
    if (loading) return []; // Only return empty if membership data is actually loading

    if (error) return [];

    let apiPlans;

    // Determine effective tab:
    // - On membership page: always respect activeTab (user can switch between tabs)
    // - On other pages: if user has access, force "one-time", otherwise use activeTab
    const effectiveTab =
      pathname === "/membership" ? activeTab : hasAccessToAdditionalPackages ? "one-time" : activeTab;

    if (effectiveTab === "membership") {
      // Always show subscription packages
      apiPlans = subscriptionPackages;
      console.log("🔍 Showing subscription packages:", apiPlans.length);
    } else {
      // For one-time packages, filter based on access (subscription OR current draw entries)
      if (userLoading) {
        apiPlans = oneTimePackages.filter((pkg) => !pkg.isMemberOnly);
        console.log("🔍 User loading - showing regular packages:", apiPlans.length);
      } else if (hasAccessToAdditionalPackages) {
        apiPlans = oneTimePackages.filter((pkg) => pkg.isMemberOnly === true);
        console.log("🔍 User with access - showing additional packages:", apiPlans.length);
      } else {
        apiPlans = oneTimePackages.filter((pkg) => !pkg.isMemberOnly);
        console.log("🔍 User without access - showing regular packages:", apiPlans.length);
      }
    }

    const convertedPlans = apiPlans.map(convertToLocalPlan);

    // Apply resolved multiplier to packages (includes alternating multiplier if no active promo)
    const finalPlans = convertedPlans.map((plan) => {
      // Check if this is a one-time package
      if (effectiveTab === "one-time" && plan.period === "one-time") {
        // Only apply multiplier if it exists and is greater than 1
        if (resolvedOneTimeMultiplier !== null && resolvedOneTimeMultiplier > 1) {
        const originalEntries = plan.metadata?.entriesCount || 0;
          const promoEntries = originalEntries * resolvedOneTimeMultiplier;

          // Update features array to show multiplied entries
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
            features: updatedFeatures, // Update features to show multiplied entries
          metadata: {
            ...plan.metadata,
            entriesCount: promoEntries,
            originalEntries,
              promoMultiplier: resolvedOneTimeMultiplier,
              isPromoActive: (resolvedOneTimeMultiplier ?? 1) > 1,
          },
        };
        }
      }

      // Check if this is a subscription package
      if (effectiveTab === "membership" && plan.period !== "one-time") {
        // Only apply multiplier if it exists and is greater than 1
        if (resolvedMembershipMultiplier !== null && resolvedMembershipMultiplier > 1) {
        const originalEntries = plan.metadata?.entriesCount || 0;
          const promoEntries = originalEntries * resolvedMembershipMultiplier;

        return {
          ...plan,
          // Keep features unchanged - they already have original entries
          metadata: {
            ...plan.metadata,
            entriesCount: promoEntries,
            originalEntries,
              promoMultiplier: resolvedMembershipMultiplier,
              isPromoActive: (resolvedMembershipMultiplier ?? 1) > 1, // True if active promo, false if alternating
            isInitialPurchaseOnly: true, // Mark as initial purchase only
          },
        };
        }
      }

      // Return plan unchanged if no multiplier applies
      return plan;
    });

    // Apply variant config if provided (reorder, highlight, hide)
    let variantAdjustedPlans = [...finalPlans];
    
    if (variantConfig) {
      try {
        // Filter out hidden packages
        if (variantConfig.hidePackages && variantConfig.hidePackages.length > 0) {
          variantAdjustedPlans = variantAdjustedPlans.filter(
            (plan) => !variantConfig.hidePackages!.includes(plan.id)
          );
        }

        // Reorder packages if displayOrder is provided
        if (variantConfig.displayOrder && variantConfig.displayOrder.length > 0) {
          const orderMap = new Map(variantConfig.displayOrder.map((id, index) => [id, index]));
          variantAdjustedPlans.sort((a, b) => {
            const aIndex = orderMap.get(a.id) ?? Infinity;
            const bIndex = orderMap.get(b.id) ?? Infinity;
            return aIndex - bIndex;
          });
        }
      } catch (error) {
        // Gracefully handle errors - fall back to default order
        console.error("Error applying variant config to packages:", error);
        variantAdjustedPlans = finalPlans;
      }
    }

    console.log(
      "🔍 Final converted plans:",
      variantAdjustedPlans.length,
      variantAdjustedPlans.map((p) => ({
        id: p.id,
        name: p.name,
        entries: p.metadata?.entriesCount,
        isPromoActive: p.metadata?.isPromoActive,
        promoMultiplier: p.metadata?.promoMultiplier,
      }))
    );
    return variantAdjustedPlans;
  })();
  
  // Check if a plan should be highlighted (from variant config)
  const isHighlighted = (planId: string): boolean => {
    return variantConfig?.highlightPackage === planId;
  };

  return (
    <section id="membership" className={`${padding} w-full overflow-visible`}>
      <div className="w-full  sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto overflow-visible">
        {/* Section Header */}
        <div className="text-center">
          <h2
            className={`font-agency font-black uppercase text-[20px] sm:text-[24px] lg:text-agency-title leading-tight ${titleColor} mb-2 sm:mb-3 lg:mb-4`}
          >
            {(() => {
              const displayTitle = hasAccessToAdditionalPackages ? "GET MORE ENTRIES 50% OFF" : title;
              // Highlight key words in red (#EE0000) - applies to all pages using MembershipSection
              const highlightRegex = /(50%|PACKAGE|WINNER|MEMBERSHIP|JOIN|PREMIUM|ODDS|ENTRIES|TOOLKIT)/gi;
              const parts = displayTitle.split(highlightRegex);
              const matchRegex = /^(50%|PACKAGE|WINNER|MEMBERSHIP|JOIN|PREMIUM|ODDS|ENTRIES|TOOLKIT)$/i;
              if (parts.length > 1) {
                return (
                  <>
                    {parts.map((part, i) =>
                      matchRegex.test(part) ? (
                        <span key={i} style={{ color: "#EE0000" }}>
                          {part}
                        </span>
                      ) : (
                        <React.Fragment key={i}>{part}</React.Fragment>
                      )
                    )}
                  </>
                );
              }
              return displayTitle;
            })()}
          </h2>
        </div>

        {/* Toggle - Enhanced metallic design */}
        {/* Show toggle if:
            - User doesn't have access (show both tabs), OR
            - User has access AND we're on the membership page (show both tabs)
            - Otherwise, if user has access and NOT on membership page, show only "One-Time Packs" label
        */}
        {(!hasAccessToAdditionalPackages || pathname === "/membership") && (
          <div className="flex justify-center mb-4 sm:mb-6 lg:mb-8">
            <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[20px] p-[4px] shadow-[0_0_20px_rgba(0,0,0,0.6)] w-full max-w-full sm:max-w-none sm:w-auto">
              <div className="flex flex-row items-center justify-center w-full">
                <button
                  onClick={() => {
                    setActiveTab("one-time");
                    // Dispatch event for FloatingPromoBanner to sync
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("membershipTabChanged", {
                          detail: { activeTab: "one-time" },
                        })
                      );
                    }
                  }}
                  suppressHydrationWarning
                  className={`font-agency font-black uppercase flex-1 px-4 py-2.5 rounded-[16px] text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
                    activeTab === "one-time"
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                  }`}
                >
                  One-Time
                  {/* Multiplier Badge - Upper right, fiery metallic red (mobile and desktop) */}
                  {/* Show badge if there's an active promo OR an alternating multiplier */}
                  {isMounted && activeTab === "one-time" && resolvedOneTimeMultiplier !== null && resolvedOneTimeMultiplier > 1 && (
                    <PromoMultiplierBadge multiplier={resolvedOneTimeMultiplier as 2 | 3 | 5 | 10} />
                  )}
                </button>
                <button
                  onClick={() => {
                    setActiveTab("membership");
                    // Dispatch event for FloatingPromoBanner to sync
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("membershipTabChanged", {
                          detail: { activeTab: "membership" },
                        })
                      );
                    }
                  }}
                  suppressHydrationWarning
                  className={`font-agency font-black uppercase flex-1 px-4 py-2.5 rounded-[16px] text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
                    activeTab === "membership"
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                  }`}
                >
                  Membership Packs
                  {/* Multiplier Badge - Upper right, fiery metallic red (mobile and desktop) */}
                  {/* Show badge if there's an active promo OR an alternating multiplier */}
                  {isMounted && activeTab === "membership" && resolvedMembershipMultiplier !== null && resolvedMembershipMultiplier > 1 && (
                    <PromoMultiplierBadge multiplier={resolvedMembershipMultiplier as 2 | 3 | 5 | 10} />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Show one-time only label when user has access AND NOT on membership page */}
        {hasAccessToAdditionalPackages && pathname !== "/membership" && (
          <div className="flex justify-center mb-4 sm:mb-6 lg:mb-8">
            <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[20px] p-[4px] shadow-[0_0_20px_rgba(0,0,0,0.6)] w-auto inline-block">
              <div className="flex flex-row items-center justify-center">
                                <div className="font-agency font-black uppercase px-4 py-2.5 rounded-[16px] text-[12px] sm:text-[14px] bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)] relative whitespace-nowrap">
                  One-Time Packs
                  {/* Multiplier Badge - Upper right, fiery metallic red (mobile and desktop) */}
                  {/* Show badge if there's an active promo OR an alternating multiplier */}
                  {isMounted && resolvedOneTimeMultiplier !== null && resolvedOneTimeMultiplier > 1 && (
                    <PromoMultiplierBadge multiplier={resolvedOneTimeMultiplier as 2 | 3 | 5 | 10} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile/Tablet: Vertical Stack Layout */}
        {!loading && !error && (
          <div className="lg:hidden overflow-visible ">
            <div className="grid grid-cols-1 gap-6 sm:gap-14 max-w-md mx-auto overflow-visible">
              {membershipPlans.map((plan, index) => {
                const colorScheme = getPackageColorScheme(plan.id);
                const highlighted = isHighlighted(plan.id);
                const isAdditionalPackage =
                  plan.isMemberOnly && plan.name.toLowerCase().includes("additional");
                return (
                  <div
                    key={plan.id}
                    className={`relative w-full ${
                      isAdditionalPackage ? "h-[310px]" : "h-[275px]"
                    } rounded-3xl shadow-[0_0_20px_rgba(0,0,0,0.6)] transition-all duration-300 lg:hover:scale-105 lg:hover:shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-visible ${
                          highlighted
                            ? "ring-4 ring-yellow-400 ring-opacity-80 shadow-yellow-500/50 scale-105"
                            : isCurrentSubscription(plan)
                            ? "ring-4 ring-green-400 ring-opacity-60 shadow-green-500/30"
                            : plan.isPopular
                            ? "ring-4 ring-gray-400 ring-opacity-60 shadow-gray-500/30"
                            : ""
                        }`}
                      >
                        {/* Promo Badge - Pin overlay at top-left, outside card */}
                        {plan.metadata?.isPromoActive && plan.metadata?.promoMultiplier && (
                          <div className="absolute -top-6 -left-6 z-30">
                            <Image
                              src={`/images/badge/X${plan.metadata.promoMultiplier}.png`}
                              alt={`${plan.metadata.promoMultiplier}x entries`}
                              width={96}
                              height={96}
                              className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                            />
                          </div>
                        )}
                        {/* Card Background with Rounded Gradient Border */}
                        <div
                          className={`h-full rounded-3xl p-4 transition-all duration-300 hover:${colorScheme.hoverShadow} relative`}
                          style={{
                            border: `2px solid transparent`,
                            backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${getGradientColor(
                              colorScheme.gradient
                            )}, transparent)`,
                            backgroundOrigin: `border-box`,
                            backgroundClip: `padding-box, border-box`,
                          }}
                        >
                          {/* Inside Glow - Whole Card with Margin */}
                          <div
                            className={`absolute inset-2 sm:inset-0.5 bg-gradient-to-t ${getPackageGlowColor(
                              plan.id
                            )} pointer-events-none rounded-2xl z-0`}
                          ></div>
                          {/* Badges - Top Right Corner (Popular and Current Plan) */}
                          {/* Best Chance Badge - Top Right (for boss/power packages) - Theme matches package */}
                          {(plan.id.includes("boss") || plan.id.includes("power")) && (
                            <div className="absolute top-1.5 right-1.5 z-20">
                              <BestChanceBadge size="medium" badgeStyle={colorScheme.badgeStyle} />
                            </div>
                          )}

                          {/* Popular and Current Plan Badges - Top Right - Only show if not boss/power */}
                          {!(plan.id.includes("boss") || plan.id.includes("power")) && (
                            <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end">
                              {/* Current Plan Badge - Highest Priority */}
                              {isCurrentSubscription(plan) && (
                                <div
                                  className={`bg-gradient-to-r from-green-500 via-green-600 to-green-700 text-white ${
                                    "px-2 py-1 text-[8px]"
                                  } rounded-full font-bold shadow-lg shadow-green-500/50 border border-green-400`}
                                >
                                  CURRENT
                                </div>
                              )}
                              {/* Popular Badge - Show only if not current plan - Theme matches package */}
                              {plan.isPopular && !isCurrentSubscription(plan) && (
                                <div
                                  className="relative overflow-hidden rounded-full font-bold shadow-lg px-2.5 py-1 text-[10px]"
                                  style={colorScheme.badgeStyle}
                                >
                                  {/* Subtle static highlight - no shimmer */}
                                  <div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                      background: `linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.15) 50%, transparent 100%)`,
                                    }}
                                  />
                                  {/* Content - white text for contrast on package-themed gradient */}
                                  <div className="relative z-10 flex items-center text-white">
                                    <span className="font-black whitespace-nowrap" style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.4)" }}>
                                      POPULAR
                                    </span>
                                  </div>
                                  <div
                                    className="absolute inset-0 rounded-full pointer-events-none"
                                    style={{
                                      background: `linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, transparent 50%, rgba(255, 255, 255, 0.15) 100%)`,
                                      border: "1px solid rgba(255, 255, 255, 0.4)",
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Package Icon - Centered at top */}
                          {getPackageIcon(plan.id) && (
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 z-20">
                              <div
                                className={`w-20 h-20 sm:w-24 sm:h-24 relative ${plan.id.includes("boss") ? "scale-110 sm:scale-110" : ""}`}
                              >
                                <Image
                                  src={getPackageIcon(plan.id)!}
                                  alt={`${plan.name} icon`}
                                  fill
                                  sizes="(max-width: 640px) 56px, (max-width: 1024px) 64px, 96px"
                                  priority={index === 0}
                                  className={`w-full h-full object-contain ${colorScheme.glow} opacity-90`}
                                />
                                {/* Promo Badge removed from mobile view - now shown on toggle instead */}
                              </div>
                            </div>
                          )}

                          <div className="h-full flex flex-col pt-6 px-4 py-1.5">
                            {/* Plan Header - Centered */}
                            <div className="text-center mb-0.5">
                              {(() => {
                                const isAdditionalPackage =
                                  plan.isMemberOnly && plan.name.toLowerCase().includes("additional");
                                const cleanedPlanName = isAdditionalPackage
                                  ? plan.name.replace(/Additional\s*/i, "").trim()
                                  : plan.name;

                                return (
                                  <h3
                                    className={`font-poppins text-[18px] sm:text-[24px] font-bold mb-0 ${colorScheme.text} leading-tight`}
                                  >
                                    {isAdditionalPackage ? (
                                      <>
                                        <span className="block">Additional</span>
                                        <span className="block">{cleanedPlanName}</span>
                                      </>
                                    ) : (
                                      plan.name
                                    )}
                                  </h3>
                                );
                              })()}
                              {plan.subtitle && (
                                <p
                                  className="font-poppins text-[13px] sm:text-[16px] font-medium mb-0.5 text-white/80"
                                >
                                  {plan.subtitle}
                                </p>
                              )}
                            </div>

                            {/* Entries - Centered */}
                            <div className="mb-0.5">
                              {(() => {
                                const entriesFeature = plan.features.find(
                                  (f) => f.text.includes("Entries") || f.text.includes("entries")
                                );
                                if (entriesFeature) {
                                  const entriesNumber = entriesFeature.text.match(/(\d+)/)?.[1] || "0";
                                  const promoMultiplier = typeof plan.metadata?.promoMultiplier === "number" ? plan.metadata.promoMultiplier : 0;
                                  const hasMultiplier = promoMultiplier > 1;
                                  const originalEntries = hasMultiplier ? plan.metadata?.originalEntries || parseInt(entriesNumber) : parseInt(entriesNumber);
                                  const displayEntries = hasMultiplier ? plan.metadata?.entriesCount || parseInt(entriesNumber) : parseInt(entriesNumber);

                                  return (
                                    <div className={`font-poppins ${colorScheme.text} text-center`}>
                                      {hasMultiplier ? (
                                        <div className="flex items-center justify-center gap-1.5">
                                          <span className="text-[24px] sm:text-[32px] font-bold line-through opacity-40 text-slate-400">
                                            {originalEntries}
                                          </span>
                                          <span className="text-[20px] sm:text-[24px] font-bold text-yellow-400">
                                            →
                                          </span>
                                          <span
                                            className={`text-[40px] sm:text-[48px] font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                          >
                                            {displayEntries}
                                          </span>
                                        </div>
                                      ) : (
                                        <span
                                          className={`text-[40px] sm:text-[48px] font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                        >
                                          {entriesNumber}
                                        </span>
                                      )}
                                      <div className={`text-[16px] sm:text-[20px] ${colorScheme.text} mt-0`}>
                                        Free Entries
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {/* Horizontal Divider */}
                            <div className="w-full p-[0.25px] bg-white/80 mb-2"></div>

                            {/* Price Badge - Centered, width fits content */}
                            <div className="flex-1 min-h-0 overflow-visible flex justify-center mb-2">
                              <div className="pb-0.5">
                                <div className="w-fit bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 backdrop-blur-sm px-2.5 py-1 rounded-2xl border border-slate-600/50 shadow-lg shadow-black/30">
                                  <div className="flex items-baseline gap-1">
                                    <div className="font-poppins font-bold text-xl sm:text-2xl bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 bg-clip-text text-transparent">
                                      ${plan.price}
                                    </div>
                                    {plan.period !== "one-time" ? (
                                      <div className="font-poppins font-semibold text-md sm:text-xs text-slate-200/90">
                                        {isHomeOrMembershipPage ? `/${plan.period}` : " Per Giveaway"}
                                      </div>
                                    ) : (
                                      <div className="font-poppins font-semibold text-md sm:text-xs text-slate-200/90">
                                        One Time Payment
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            {/* Tickmarks hidden on mobile - see "Click here to see full package inclusion" below */}

                            {/* Action Button - In flow, no overlay */}
                            <div className="flex-shrink-0 mt-auto pt-1">
                              {isCurrentSubscription(plan) ? (
                                <button
                                  disabled
                                  className={`font-agency font-black uppercase w-full h-[44px] sm:h-[48px] rounded-2xl flex items-center justify-center text-[16px] sm:text-[18px] bg-green-600 text-white cursor-not-allowed opacity-75 ${colorScheme.borderGlow}`}
                                >
                                  Current Plan
                                </button>
                              ) : !hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly ? (
                                <button
                                  disabled
                                  className={`font-agency font-black uppercase w-full h-[44px] sm:h-[48px] rounded-2xl flex items-center justify-center text-[16px] sm:text-[18px] bg-gray-500 text-white cursor-not-allowed opacity-75 ${colorScheme.borderGlow}`}
                                >
                                  Subscription or Entries Required
                                </button>
                              ) : (
                                (() => {
                                  const hierarchy = getPlanHierarchy(plan);
                                  const isSubscriptionPlan =
                                    plan.period !== "one-time" && !plan.name.toLowerCase().includes("one-time");
                                  let buttonText = "Enter Now";
                                  const buttonHeight = "h-[44px] sm:h-[48px]";
                                  let buttonClass = `font-agency font-black uppercase w-full ${buttonHeight} rounded-2xl flex items-center justify-center px-5 text-[15px] sm:text-[17px] transition-all duration-300 transform lg:hover:scale-105 lg:hover:shadow-xl bg-gradient-to-r ${
                                    colorScheme.gradient
                                  } text-white lg:hover:shadow-[0_0_20px_rgba(0,0,0,0.8)]`;

                                  // past_due: show "Update payment" for subscription plans - route to my-account
                                  if (hasBlockingSub && isPastDue && isSubscriptionPlan) {
                                    buttonText = "Update payment";
                                    buttonClass += " bg-amber-600 text-white hover:bg-amber-700";
                                  } else if (hasActiveSubscription && activeTab === "membership") {
                                    if (hierarchy.isCurrent) {
                                      buttonText = "Current Plan";
                                      buttonClass +=
                                        " bg-green-600 text-white cursor-default lg:hover:scale-100 lg:hover:shadow-none";
                                    } else if (hierarchy.isDowngrade) {
                                      buttonText = `Downgrade to ${plan.name}`;
                                      buttonClass += " bg-transparent text-white hover:bg-red-600 hover:text-white";
                                    } else if (hierarchy.isUpgrade) {
                                      buttonText = `Upgrade to ${plan.name}`;
                                      buttonClass += " bg-blue-600 text-white hover:bg-blue-700";
                                    }
                                  }

                                  return (
                                    <button
                                      className={`${buttonClass} ${colorScheme.borderGlow}`}
                                      onClick={() => handlePlanSelect(plan)}
                                      disabled={hasActiveSubscription && hierarchy.isCurrent}
                                      suppressHydrationWarning
                                    >
                                      {buttonText}
                                    </button>
                                  );
                                })()
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>
        )}
      </div>

      {/* Desktop: Grid Layout */}
      {!loading && !error && (
        <div
          className={`hidden lg:grid gap-4 sm:gap-5 justify-items-center overflow-visible pt-8 ${
            activeTab === "membership"
              ? "max-w-5xl mx-auto grid-cols-3 justify-center"
              : "max-w-7xl mx-auto grid-cols-1 md:grid-cols-3 xl:grid-cols-5"
          }`}
        >
          {membershipPlans.length > 0 ? (
            membershipPlans.map((plan) => {
              const colorScheme = getPackageColorScheme(plan.id);
              const highlighted = isHighlighted(plan.id);
              return (
                <div
                  key={plan.id}
                  className={`relative w-[290px] max-w-[320px] h-[520px] rounded-3xl shadow-[0_0_20px_rgba(0,0,0,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-visible isolate ${
                    highlighted
                      ? "ring-4 ring-yellow-400 ring-opacity-80 shadow-yellow-500/50 scale-105"
                      : isCurrentSubscription(plan)
                      ? "ring-4 ring-green-400 ring-opacity-60 shadow-green-500/30"
                      : plan.isPopular
                      ? "ring-4 ring-gray-400 ring-opacity-60 shadow-gray-500/30"
                      : ""
                  }`}
                >
                  {/* Promo Badge - Pin overlay at top-left, outside card */}
                  {plan.metadata?.isPromoActive && plan.metadata?.promoMultiplier && (
                    <div className="absolute -top-6 -left-6 z-30">
                      <Image
                        src={`/images/badge/X${plan.metadata.promoMultiplier}.png`}
                        alt={`${plan.metadata.promoMultiplier}x entries`}
                        width={120}
                        height={120}
                        className="w-24 h-24 object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                      />
                    </div>
                  )}
                  {/* Package Icon - Centered at top */}
                  {getPackageIcon(plan.id) && (
                    <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 z-20">
                      <div className={`w-24 h-24 relative ${plan.id.includes("boss") ? "scale-110" : ""}`}>
                        <Image
                          src={getPackageIcon(plan.id)!}
                          alt={`${plan.name} icon`}
                          className={`w-full h-full object-contain ${colorScheme.glow} opacity-90`}
                        />
                        {/* Promo Badge positioned on top of the image icon */}
                        {/* Promo badge on icon removed - now shown as hexagonal badge on card top-right */}
                      </div>
                    </div>
                  )}

                  {/* Card Background with Rounded Gradient Border */}
                  <div
                    className={`h-full rounded-3xl p-4 sm:p-2 transition-all duration-300 hover:${colorScheme.hoverShadow} relative`}
                    style={{
                      border: `2px solid transparent`,
                      backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${getGradientColor(
                        colorScheme.gradient
                      )}, transparent)`,
                      backgroundOrigin: `border-box`,
                      backgroundClip: `padding-box, border-box`,
                    }}
                  >
                    {/* Badges - Top Right Corner (Popular and Current Plan, Best Chance) */}
                    {/* Best Chance Badge - Top Right (for boss/power packages) - Theme matches package */}
                    {(plan.id.includes("boss") || plan.id.includes("power")) && (
                      <div className="absolute top-1.5 right-1.5 z-10">
                        <BestChanceBadge size="medium" badgeStyle={colorScheme.badgeStyle} />
                      </div>
                    )}

                    {/* Popular and Current Plan Badges - Top Right - Only show if not boss/power */}
                    {!(plan.id.includes("boss") || plan.id.includes("power")) && (
                      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end">
                        {/* Current Plan Badge - Highest Priority */}
                        {isCurrentSubscription(plan) && (
                          <div className="bg-gradient-to-r from-green-500 via-green-600 to-green-700 text-white px-2 py-1 rounded-full font-bold text-[8px] shadow-lg shadow-green-500/50 border border-green-400">
                            CURRENT
                          </div>
                        )}
                        {/* Popular Badge - Show only if not current plan - Theme matches package */}
                        {plan.isPopular && !isCurrentSubscription(plan) && (
                          <div
                            className="relative overflow-hidden rounded-full font-bold shadow-lg px-2.5 py-1 text-xs"
                            style={colorScheme.badgeStyle}
                          >
                            {/* Subtle static highlight - no shimmer */}
                            <div
                              className="absolute inset-0 pointer-events-none"
                              style={{
                                background: `linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.15) 50%, transparent 100%)`,
                              }}
                            />
                            <div className="relative z-10 flex items-center gap-1 text-white">
                              <span className="font-black whitespace-nowrap" style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.4)" }}>
                                POPULAR
                              </span>
                            </div>
                            <div
                              className="absolute inset-0 rounded-full pointer-events-none"
                              style={{
                                background: `linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, transparent 50%, rgba(255, 255, 255, 0.15) 100%)`,
                                border: "1px solid rgba(255, 255, 255, 0.4)",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="h-full flex flex-col pt-10 relative px-4 py-2">
                      {/* Inside Glow - Whole Card with Margin */}
                      <div
                        className={`absolute inset-0.5 bg-gradient-to-t ${getPackageGlowColor(
                          plan.id
                        )} pointer-events-none rounded-2xl z-0`}
                      ></div>
                      {/* Plan Header - Centered */}
                      <div className="text-center ">
                        {(() => {
                          const isAdditionalPackage =
                            plan.isMemberOnly && plan.name.toLowerCase().includes("additional");
                          const cleanedPlanName = isAdditionalPackage
                            ? plan.name.replace(/Additional\s*/i, "").trim()
                            : plan.name;

                          return (
                            <h3
                              className={`font-poppins font-bold text-[20px] sm:text-[24px] mb-2 ${colorScheme.text} leading-tight`}
                            >
                              {isAdditionalPackage ? (
                                <>
                                  <span className="block">Additional</span>
                                  <span className="block">{cleanedPlanName}</span>
                                </>
                              ) : (
                                plan.name
                              )}
                            </h3>
                          );
                        })()}
                        {plan.subtitle && (
                          <p className={`font-poppins text-[12px] sm:text-[14px] font-medium mb-4 text-white/80`}>{plan.subtitle}</p>
                        )}

                        {/* Entries - Main Focus */}
                        <div className="mb-4">
                          {(() => {
                            // Extract entries from features
                            const entriesFeature = plan.features.find(
                              (feature) => feature.text.includes("Entries") || feature.text.includes("entries")
                            );
                            if (entriesFeature) {
                              const entriesText = entriesFeature.text;
                              const entriesNumber = entriesText.match(/(\d+)/)?.[1] || "0";

                              // Check if multiplier is being applied (active promo OR alternating multiplier)
                              // Show original → multiplied format when multiplier > 1
                              const promoMultiplier = typeof plan.metadata?.promoMultiplier === 'number' ? plan.metadata.promoMultiplier : 0;
                              const hasMultiplier = promoMultiplier > 1;
                              const originalEntries = hasMultiplier
                                ? plan.metadata?.originalEntries || parseInt(entriesNumber)
                                : parseInt(entriesNumber);
                              const displayEntries = hasMultiplier
                                ? plan.metadata?.entriesCount || parseInt(entriesNumber)
                                : parseInt(entriesNumber);

                              return (
                                <div className={`font-poppins ${colorScheme.text}`}>
                                  {hasMultiplier ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <span className="text-[20px] sm:text-[24px] font-bold line-through opacity-40 text-slate-400">
                                        {originalEntries}
                                      </span>
                                      <span className="text-[18px] sm:text-[20px] font-bold text-yellow-400">→</span>
                                      <span
                                        className={`text-[36px] sm:text-[44px] font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                      >
                                        {displayEntries}
                                      </span>
                                    </div>
                                  ) : (
                                    <span
                                      className={`text-[36px] sm:text-[44px] font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                    >
                                      {entriesNumber}
                                    </span>
                                  )}
                                  <div className={`text-[16px] sm:text-[20px] ${colorScheme.text} mt-1`}>
                                    Free Entries
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>

                      {/* Horizontal Divider */}
                      <div className="w-full p-[0.5px] bg-white mb-4 rounded-full"></div>

                      {/* Features List - Flexible height with max height */}
                      <div className="flex-1 overflow-visible space-y-3 sm:space-y-4 mb-6 pb-[80px]">
                        {/* Price Badge - Inside Features Section */}
                        <div className="pb-2">
                          <div className="font-poppins bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 backdrop-blur-sm px-3 py-2 rounded-2xl border border-slate-600/50 shadow-lg shadow-black/30">
                            <div className="flex items-baseline gap-1">
                              <div className="text-lg sm:text-xl font-bold bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 bg-clip-text text-transparent">
                                ${plan.price}
                              </div>
                              {plan.period !== "one-time" ? (
                                <div className="text-sm font-semibold text-slate-200/90">
                                  {isHomeOrMembershipPage ? `/${plan.period}` : " Per Giveaway"}
                                </div>
                              ) : (
                                <div className="text-sm font-semibold text-slate-200/90">One Time Payment</div>
                              )}
                            </div>
                          </div>
                        </div>
                        {plan.features.map((feature, index) => {
                          // Check if this feature mentions entries and we have promo data
                          const isPromoActive = plan.metadata?.isPromoActive;
                          const originalEntries = plan.metadata?.originalEntries;

                          if (
                            isPromoActive &&
                            originalEntries &&
                            (feature.text.includes("Entries") || feature.text.includes("entries"))
                          ) {
                            // Replace the multiplied number with original number in the feature text
                            const match = feature.text.match(/(\d+)\s*(Free\s+)?(Accumulated\s+)?Entries/i);
                            if (match) {
                              const multipliedNumber = parseInt(match[1]);
                              const originalNumber = originalEntries;
                              const updatedText = feature.text.replace(
                                multipliedNumber.toString(),
                                originalNumber.toString()
                              );

                              return (
                                <div key={index} className="flex items-start gap-3">
                                  <div className="flex-shrink-0 mt-1">
                                    <Check className={`h-4 w-4 ${colorScheme.text}`} />
                                  </div>
                                  <span className={`font-poppins text-[12px] sm:text-[14px] leading-relaxed text-white/90`}>
                                    {updatedText}
                                  </span>
                                </div>
                              );
                            }
                          }

                          // Default feature display
                          return (
                            <div key={index} className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-1">
                                <Check className={`h-4 w-4 ${colorScheme.text}`} />
                              </div>
                              <span className={`font-poppins text-[12px] sm:text-[14px] leading-relaxed text-white/90`}>
                                {feature.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Action Button - Fixed position at bottom */}
                      <div className="absolute -bottom-8 left-2 right-2 h-[60px] sm:h-[70px] flex items-end">
                        {isCurrentSubscription(plan) ? (
                          <button
                            disabled
                            className={`font-agency font-black uppercase w-full h-[44px] sm:h-[48px] rounded-2xl flex items-center justify-center px-5 text-[14px] sm:text-[16px] bg-green-600 text-white cursor-not-allowed opacity-75 ${colorScheme.borderGlow}`}
                          >
                            Current Plan
                          </button>
                        ) : !hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly ? (
                          <button
                            disabled
                            className={`font-agency font-black uppercase w-full h-[44px] sm:h-[48px] rounded-2xl flex items-center justify-center px-5 text-[14px] sm:text-[16px] bg-gray-500 text-white cursor-not-allowed opacity-75 ${colorScheme.borderGlow}`}
                          >
                            Subscription or Entries Required
                          </button>
                        ) : (
                          (() => {
                            const hierarchy = getPlanHierarchy(plan);
                            const isSubscriptionPlan =
                              plan.period !== "one-time" && !plan.name.toLowerCase().includes("one-time");
                            let buttonText = "Enter Now";
                            const buttonHeight = "h-[44px] sm:h-[48px]";
                            let buttonClass = `font-agency font-black uppercase w-full ${buttonHeight} rounded-2xl flex items-center justify-center px-5 text-[14px] sm:text-[16px] transition-all duration-300 transform hover:scale-105 hover:shadow-xl bg-gradient-to-r ${colorScheme.gradient} text-white hover:shadow-[0_0_20px_rgba(0,0,0,0.8)]`;

                            // past_due: show "Update payment" for subscription plans - route to my-account
                            if (hasBlockingSub && isPastDue && isSubscriptionPlan) {
                              buttonText = "Update payment";
                              buttonClass += " bg-amber-600 text-white hover:bg-amber-700";
                            } else if (hasActiveSubscription && activeTab === "membership") {
                              if (hierarchy.isCurrent) {
                                buttonText = "Current Plan";
                                buttonClass +=
                                  " bg-green-600 text-white cursor-default hover:scale-100 hover:shadow-none";
                              } else if (hierarchy.isDowngrade) {
                                buttonText = `Downgrade to ${plan.name}`;
                                buttonClass += " bg-transparent text-white hover:bg-red-600 hover:text-white";
                              } else if (hierarchy.isUpgrade) {
                                buttonText = `Upgrade to ${plan.name}`;
                                buttonClass += " bg-blue-600 text-white hover:bg-blue-700";
                              }
                            }

                            return (
                              <button
                                className={`${buttonClass} ${colorScheme.borderGlow}`}
                                onClick={() => handlePlanSelect(plan)}
                                disabled={hasActiveSubscription && hierarchy.isCurrent}
                                suppressHydrationWarning
                              >
                                {buttonText}
                              </button>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-600">No membership packages available</p>
            </div>
          )}
        </div>
      )}

      

      {/* Toggle Button for Package Inclusions - Mobile Only, All Packages */}
      {(() => {
        const shouldShowToggle = membershipPlans.length > 0 && !loading && !error;

        if (!shouldShowToggle) return null;

        return (
          <div className="lg:hidden mt-8 sm:mt-10">
            <button
              onClick={() => setIsInclusionsExpanded(!isInclusionsExpanded)}
              className="font-poppins w-full py-3 px-4 bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-2xl text-white font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] border border-slate-700 flex items-center justify-center gap-2"
              >
              <span>Click here to see full package inclusion</span>
              {isInclusionsExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {/* Package Inclusions Expanded Component - shows all currently displayed packages */}
            <PackageInclusionsExpanded isExpanded={isInclusionsExpanded} packages={membershipPlans} />
          </div>
        );
      })()}

      {/* Signup Modal */}
      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
        membershipModalConfig={contextVariantConfig?.membershipModal}
      />
    </section>
  );
}
