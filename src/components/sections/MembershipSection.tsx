"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Check } from "lucide-react";
import MembershipModal from "@/components/modals/MembershipModal";
import { useMemberships } from "@/hooks/useMemberships";
import { useUserContext } from "@/contexts/UserContext";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import PromoMultiplierBadge from "@/components/ui/PromoMultiplierBadge";

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

interface MembershipSectionProps {
  title?: string;
  padding?: string;
  titleColor?: string;
  onPlanSelect?: (plan: LocalMembershipPlan) => void;
}

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
  };
};

const getPackageIcon = (planId: string): StaticImageData | null => {
  return PACKAGE_ICONS[planId] || null;
};

export default function MembershipSection({
  title = "CHOOSE YOUR PACKAGE",
  padding = "py-12 sm:py-16 lg:py-20",
  titleColor = "text-black",
  onPlanSelect,
}: MembershipSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");
  const [showMemberExclusive, setShowMemberExclusive] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

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

  // Use the centralized membership modal hook
  const membershipModal = useMembershipModal();

  // Get active promo for one-time packages (also used for subscription initial purchase)
  const { data: oneTimePromo } = usePromoByType("one-time-packages");

  // Listen for upsell modal requests
  useEffect(() => {
    const handleOpenMembershipModal = (event: CustomEvent) => {
      console.log("🎯 MembershipSection received openMembershipModal event:", event.detail);
      const { plan } = event.detail;
      if (plan) {
        membershipModal.setSelectedPlan(plan);
        membershipModal.openModal();
      }
    };

    window.addEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);

    return () => {
      window.removeEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);
    };
  }, [membershipModal]);

  // Check if user has an active subscription (only for recurring subscription plans)
  const hasActiveSubscription = userData?.subscription?.isActive || false;
  const currentUserSubscription = userData?.subscriptionPackageData;

  // Update default tab based on subscription status
  useEffect(() => {
    if (!userLoading && userData) {
      if (hasActiveSubscription) {
        setActiveTab("one-time");
      } else {
        setActiveTab("membership");
      }
    }
  }, [hasActiveSubscription, userLoading, userData]);

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
    if (!hasActiveSubscription || !currentUserSubscription || plan.period === "one-time") {
      return { isCurrent: false, isUpgrade: false, isDowngrade: false, canPurchase: true };
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
      canPurchase: !isCurrent && !hasActiveSubscription, // Can only purchase if no active subscription
    };
  };

  // Handle plan selection and open modal
  const handlePlanSelect = (plan: LocalMembershipPlan) => {
    const hierarchy = getPlanHierarchy(plan);

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

    if (activeTab === "membership") {
      // Always show subscription packages
      apiPlans = subscriptionPackages;
      console.log("🔍 Showing subscription packages:", apiPlans.length);
    } else {
      // For one-time packages, filter based on membership status
      // Show default packages immediately, apply user-specific filtering when it loads
      if (userLoading) {
        // While user data is loading, show regular (non-member) packages to prevent flash
        apiPlans = oneTimePackages.filter((pkg) => !pkg.isMemberOnly);
        console.log("🔍 User loading - showing regular packages:", apiPlans.length);
      } else if (hasActiveSubscription) {
        // Show member-only packages for users with active subscriptions
        apiPlans = oneTimePackages.filter((pkg) => pkg.isMemberOnly === true);
        console.log("🔍 Member - showing member-only packages:", apiPlans.length);
      } else {
        // Show regular packages for non-members
        const regularPackages = oneTimePackages.filter((pkg) => !pkg.isMemberOnly);
        console.log("🔍 Non-member - regular packages:", regularPackages.length);

        // If toggle is enabled, show ONLY member-exclusive packages (hide regular ones)
        if (showMemberExclusive) {
          const memberExclusivePackages = oneTimePackages.filter((pkg) => pkg.isMemberOnly === true);
          apiPlans = memberExclusivePackages; // Only show member-exclusive packages
          console.log("🔍 Toggle enabled - showing member-exclusive packages:", apiPlans.length);
        } else {
          apiPlans = regularPackages; // Show only regular packages
          console.log("🔍 Toggle disabled - showing regular packages:", apiPlans.length);
        }
      }
    }

    const convertedPlans = apiPlans.map(convertToLocalPlan);

    // Apply promo multiplier to packages if there's an active promo
    const finalPlans = convertedPlans.map((plan) => {
      // Check if this is a one-time package with active promo
      if (activeTab === "one-time" && oneTimePromo && plan.period === "one-time") {
        const originalEntries = plan.metadata?.entriesCount || 0;
        const promoEntries = originalEntries * oneTimePromo.multiplier;

        return {
          ...plan,
          // Keep features unchanged - they already have original entries
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
        const originalEntries = plan.metadata?.entriesCount || 0;
        const promoEntries = originalEntries * oneTimePromo.multiplier;

        return {
          ...plan,
          // Keep features unchanged - they already have original entries
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

    console.log(
      "🔍 Final converted plans:",
      finalPlans.length,
      finalPlans.map((p) => ({
        id: p.id,
        name: p.name,
        entries: p.metadata?.entriesCount,
        isPromoActive: p.metadata?.isPromoActive,
        promoMultiplier: p.metadata?.promoMultiplier,
      }))
    );
    return finalPlans;
  })();

  return (
    <section id="membership" className={`${padding} w-full overflow-visible`}>
      <div className="w-full  sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto overflow-visible">
        {/* Section Header */}
        <div className="text-center">
          <h2
            className={`text-[20px] sm:text-[24px] lg:text-[32px] font-bold ${titleColor} mb-2 sm:mb-3 lg:mb-4 font-['Poppins'] leading-tight`}
          >
            {title}
          </h2>
        </div>

        {/* Toggle - Enhanced metallic design */}
        <div className="flex justify-center mb-4 sm:mb-6 lg:mb-8">
          <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[20px] p-[4px] shadow-[0_0_20px_rgba(0,0,0,0.6)] w-full max-w-full sm:max-w-none sm:w-auto">
            <div className="flex flex-row items-center justify-center w-full">
              <button
                onClick={() => {
                  setActiveTab("one-time");
                  setShowMemberExclusive(false); // Reset toggle when switching tabs
                }}
                className={`flex-1 px-4 py-2.5 rounded-[16px] font-bold text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
                  activeTab === "one-time"
                    ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                }`}
              >
                One-Time
                {/* Multiplier Badge - Mobile only, upper right, fiery metallic red */}
                {oneTimePromo && activeTab === "one-time" && (
                  <PromoMultiplierBadge multiplier={oneTimePromo.multiplier as 2 | 3 | 5 | 10} />
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab("membership");
                  setShowMemberExclusive(false); // Reset toggle when switching tabs
                }}
                className={`flex-1 px-4 py-2.5 rounded-[16px] font-bold text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
                  activeTab === "membership"
                    ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                }`}
              >
                Membership Packs
                {/* Multiplier Badge - Mobile only, upper right, fiery metallic red */}
                {oneTimePromo && activeTab === "membership" && (
                  <PromoMultiplierBadge multiplier={oneTimePromo.multiplier as 2 | 3 | 5 | 10} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile/Tablet: Vertical Stack Layout */}
        {!loading && !error && (
          <div className="lg:hidden overflow-visible pt-8">
            {(() => {
              // Determine if we should show 2 columns: when showing member-exclusive packages on one-time tab
              const showingMemberExclusive =
                activeTab === "one-time" &&
                (showMemberExclusive ||
                  hasActiveSubscription ||
                  (membershipPlans.length > 0 && membershipPlans.some((p) => p.isMemberOnly === true)));
              return (
                <div
                  className={`grid ${
                    showingMemberExclusive ? "grid-cols-2 gap-1 sm:gap-4" : "grid-cols-1 gap-12 sm:gap-14"
                  }  ${showingMemberExclusive ? "max-w-full  sm:px-4" : "max-w-md mx-auto"}`}
                >
                  {membershipPlans.map((plan) => {
                    const colorScheme = getPackageColorScheme(plan.id);
                    const isTwoColumn = showingMemberExclusive;
                    return (
                      <div
                        key={plan.id}
                        className={`relative w-full ${
                          isTwoColumn ? "h-[380px] sm:h-[400px]" : "h-[480px]"
                        } rounded-3xl shadow-[0_0_20px_rgba(0,0,0,0.6)] transition-all duration-300 lg:hover:scale-105 lg:hover:shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-visible ${
                          isCurrentSubscription(plan)
                            ? "ring-4 ring-green-400 ring-opacity-60 shadow-green-500/30"
                            : plan.isPopular
                            ? "ring-4 ring-gray-400 ring-opacity-60 shadow-gray-500/30"
                            : ""
                        }`}
                      >
                        {/* Card Background with Rounded Gradient Border */}
                        <div
                          className={`h-full rounded-3xl ${
                            isTwoColumn ? "p-2.5 sm:p-3" : "p-4 sm:p-4"
                          } transition-all duration-300 hover:${colorScheme.hoverShadow} relative`}
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
                          {/* Badges - Top Right Corner (Popular and Current Plan only) */}
                          <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
                            {/* Current Plan Badge - Highest Priority */}
                            {isCurrentSubscription(plan) && (
                              <div
                                className={`bg-gradient-to-r from-green-500 via-green-600 to-green-700 text-white ${
                                  isTwoColumn ? "px-1.5 py-0.5 text-[6px]" : "px-2 py-1 text-[8px]"
                                } rounded-full font-bold shadow-lg shadow-green-500/50 border border-green-400`}
                              >
                                CURRENT
                              </div>
                            )}
                            {/* Popular Badge - Show only if not current plan */}
                            {plan.isPopular && !isCurrentSubscription(plan) && (
                              <div
                                className={`bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-black ${
                                  isTwoColumn ? "px-1.5 py-0.5 text-[6px]" : "px-2 py-1 text-[8px]"
                                } rounded-full font-bold shadow-lg shadow-yellow-500/50 border border-yellow-300`}
                              >
                                POPULAR
                              </div>
                            )}
                          </div>

                          {/* Package Icon - Centered at top */}
                          {getPackageIcon(plan.id) && (
                            <div
                              className={`absolute ${
                                isTwoColumn ? "-top-6" : "-top-8"
                              } left-1/2 transform -translate-x-1/2 z-20`}
                            >
                              <div
                                className={`${
                                  isTwoColumn ? "w-14 h-14 sm:w-16 sm:h-16" : "w-20 h-20 sm:w-24 sm:h-24"
                                } relative ${plan.id.includes("boss") ? "scale-110 sm:scale-110" : ""}`}
                              >
                                <Image
                                  src={getPackageIcon(plan.id)!}
                                  alt={`${plan.name} icon`}
                                  className={`w-full h-full object-contain ${colorScheme.glow} opacity-90`}
                                />
                                {/* Promo Badge removed from mobile view - now shown on toggle instead */}
                              </div>
                            </div>
                          )}

                          <div
                            className={`h-full flex flex-col pt-6 relative ${
                              isTwoColumn ? "px-2 py-1.5 sm:px-3 sm:py-2" : "px-4 py-2"
                            }`}
                          >
                            {/* Plan Header - Centered */}
                            <div className="text-center ">
                              <h3
                                className={`${
                                  isTwoColumn ? "text-[14px] sm:text-[18px]" : "text-[22px] sm:text-[28px]"
                                } font-bold mb-1.5 ${colorScheme.text} tracking-wide`}
                              >
                                {plan.name}
                              </h3>
                              {plan.subtitle && (
                                <p
                                  className={`${
                                    isTwoColumn ? "text-[10px] sm:text-[13px]" : "text-[13px] sm:text-[16px]"
                                  } font-medium mb-3 text-white/80`}
                                >
                                  {plan.subtitle}
                                </p>
                              )}

                              {/* Entries - Main Focus */}
                              <div className="mb-3">
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
                                    const originalEntries = isPromoActive
                                      ? plan.metadata?.originalEntries || parseInt(entriesNumber)
                                      : parseInt(entriesNumber);

                                    return (
                                      <div className={`${colorScheme.text}`}>
                                        {isPromoActive ? (
                                          <div className="flex items-center justify-center gap-2">
                                            <span
                                              className={`${
                                                isTwoColumn
                                                  ? "text-[16px] sm:text-[24px]"
                                                  : "text-[28px] sm:text-[36px]"
                                              } font-bold line-through opacity-40 text-slate-400`}
                                            >
                                              {originalEntries}
                                            </span>
                                            <span
                                              className={`${
                                                isTwoColumn
                                                  ? "text-[14px] sm:text-[20px]"
                                                  : "text-[24px] sm:text-[28px]"
                                              } font-bold text-yellow-400`}
                                            >
                                              →
                                            </span>
                                            <span
                                              className={`${
                                                isTwoColumn
                                                  ? "text-[24px] sm:text-[36px]"
                                                  : "text-[48px] sm:text-[56px]"
                                              } font-bold bg-gradient-to-r ${
                                                colorScheme.gradient
                                              } bg-clip-text text-transparent`}
                                            >
                                              {plan.metadata?.entriesCount || entriesNumber}
                                            </span>
                                          </div>
                                        ) : (
                                          <span
                                            className={`${
                                              isTwoColumn ? "text-[24px] sm:text-[36px]" : "text-[48px] sm:text-[56px]"
                                            } font-bold bg-gradient-to-r ${
                                              colorScheme.gradient
                                            } bg-clip-text text-transparent`}
                                          >
                                            {entriesNumber}
                                          </span>
                                        )}
                                        <div
                                          className={`${
                                            isTwoColumn ? "text-[12px] sm:text-[16px]" : "text-[20px] sm:text-[24px]"
                                          } text-white/70 mt-1`}
                                        >
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
                            <div className="w-full p-[0.25px] bg-white/80 mb-3"></div>

                            {/* Features List - Flexible height with max height */}
                            <div
                              className={`flex-1 overflow-visible space-y-2 sm:space-y-3 mb-4 ${
                                isTwoColumn ? "pb-[55px]" : "pb-[70px]"
                              }`}
                            >
                              {/* Price Badge - Inside Features Section */}
                              <div className="pb-1">
                                <div
                                  className={`bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 backdrop-blur-sm ${
                                    isTwoColumn ? "px-2 py-1.5" : "px-3 py-2"
                                  } rounded-2xl border border-slate-600/50 shadow-lg shadow-black/30`}
                                >
                                  <div className="flex items-baseline gap-1">
                                    <div
                                      className={`${
                                        isTwoColumn ? "text-xs sm:text-lg" : "text-xl sm:text-2xl"
                                      } font-bold bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 bg-clip-text text-transparent`}
                                    >
                                      ${plan.price}
                                    </div>
                                    {plan.period !== "one-time" ? (
                                      <div
                                        className={`${
                                          isTwoColumn ? "text-[10px] sm:text-xs" : "text-sm"
                                        } font-semibold text-slate-200/90`}
                                      >
                                        {isHomeOrMembershipPage ? `/${plan.period}` : " Per Giveaway"}
                                      </div>
                                    ) : (
                                      <div
                                        className={`${
                                          isTwoColumn ? "text-[8px] sm:text-xs" : "text-sm"
                                        } font-semibold text-slate-200/90`}
                                      >
                                        One Time Payment
                                      </div>
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
                                      <div
                                        key={index}
                                        className={`flex items-start ${isTwoColumn ? "gap-2" : "gap-3"}`}
                                      >
                                        <div className="flex-shrink-0 mt-1">
                                          <Check
                                            className={`${isTwoColumn ? "h-3.5 w-3.5" : "h-5 w-5"} ${colorScheme.text}`}
                                          />
                                        </div>
                                        <span
                                          className={`${
                                            isTwoColumn ? "text-[11px] sm:text-[13px]" : "text-[14px] sm:text-[16px]"
                                          } leading-relaxed text-white/90`}
                                        >
                                          {updatedText}
                                        </span>
                                      </div>
                                    );
                                  }
                                }

                                // Default feature display
                                return (
                                  <div key={index} className={`flex items-start ${isTwoColumn ? "gap-2" : "gap-3"}`}>
                                    <div className="flex-shrink-0 mt-1">
                                      <Check
                                        className={`${isTwoColumn ? "h-3.5 w-3.5" : "h-5 w-5"} ${colorScheme.text}`}
                                      />
                                    </div>
                                    <span
                                      className={`${
                                        isTwoColumn ? "text-[11px] sm:text-[13px]" : "text-[14px] sm:text-[16px]"
                                      } leading-relaxed text-white/90`}
                                    >
                                      {feature.text}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Action Button - Fixed position at bottom */}
                            <div
                              className={`absolute bottom-0 left-2 right-2 ${
                                isTwoColumn ? "h-[55px] sm:h-[60px]" : "h-[60px] sm:h-[70px]"
                              } flex items-end`}
                            >
                              {isCurrentSubscription(plan) ? (
                                <button
                                  disabled
                                  className={`w-full ${
                                    isTwoColumn ? "h-[45px] sm:h-[50px]" : "h-[50px] sm:h-[55px]"
                                  } rounded-2xl flex items-center justify-center font-bold ${
                                    isTwoColumn ? "text-[12px] sm:text-[16px]" : "text-[16px] sm:text-[18px]"
                                  } bg-green-600 text-white cursor-not-allowed opacity-75 ${colorScheme.borderGlow}`}
                                >
                                  Current Plan
                                </button>
                              ) : !hasActiveSubscription && plan.isMemberOnly ? (
                                <button
                                  disabled
                                  className={`w-full ${
                                    isTwoColumn ? "h-[45px] sm:h-[50px]" : "h-[50px] sm:h-[55px]"
                                  } rounded-2xl flex items-center justify-center font-bold ${
                                    isTwoColumn ? "text-[12px] sm:text-[16px]" : "text-[16px] sm:text-[18px]"
                                  } bg-gray-500 text-white cursor-not-allowed opacity-75 ${colorScheme.borderGlow}`}
                                >
                                  Membership Required
                                </button>
                              ) : (
                                (() => {
                                  const hierarchy = getPlanHierarchy(plan);
                                  let buttonText = "Enter Now";
                                  let buttonClass = `w-full ${
                                    isTwoColumn ? "h-[45px] sm:h-[50px]" : "h-[50px] sm:h-[55px]"
                                  } rounded-2xl flex items-center justify-center font-bold ${
                                    isTwoColumn ? "text-[12px] sm:text-[16px]" : "text-[16px] sm:text-[18px]"
                                  } transition-all duration-300 transform lg:hover:scale-105 lg:hover:shadow-xl bg-gradient-to-r ${
                                    colorScheme.gradient
                                  } text-white lg:hover:shadow-[0_0_20px_rgba(0,0,0,0.8)]`;

                                  if (hasActiveSubscription && activeTab === "membership") {
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
              );
            })()}
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
              return (
                <div
                  key={plan.id}
                  className={`relative w-[290px] max-w-[320px] h-[520px] rounded-3xl shadow-[0_0_20px_rgba(0,0,0,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-visible ${
                    isCurrentSubscription(plan)
                      ? "ring-4 ring-green-400 ring-opacity-60 shadow-green-500/30"
                      : plan.isPopular
                      ? "ring-4 ring-gray-400 ring-opacity-60 shadow-gray-500/30"
                      : ""
                  }`}
                >
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
                        {plan.metadata?.isPromoActive && (
                          <div className="absolute -top-2 -right-2 z-10">
                            <PromoBadge multiplier={plan.metadata.promoMultiplier as 2 | 3 | 5 | 10} size="small" />
                          </div>
                        )}
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
                    {/* Badges - Top Right Corner (Popular and Current Plan only) */}
                    <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
                      {/* Current Plan Badge - Highest Priority */}
                      {isCurrentSubscription(plan) && (
                        <div className="bg-gradient-to-r from-green-500 via-green-600 to-green-700 text-white px-2 py-1 rounded-full font-bold text-[8px] shadow-lg shadow-green-500/50 border border-green-400">
                          CURRENT
                        </div>
                      )}
                      {/* Popular Badge - Show only if not current plan */}
                      {plan.isPopular && !isCurrentSubscription(plan) && (
                        <div className="bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-black px-2 py-1 rounded-full font-bold text-[8px] shadow-lg shadow-yellow-500/50 border border-yellow-300">
                          POPULAR
                        </div>
                      )}
                    </div>
                    <div className="h-full flex flex-col pt-10 relative px-4 py-2">
                      {/* Inside Glow - Whole Card with Margin */}
                      <div
                        className={`absolute inset-0.5 bg-gradient-to-t ${getPackageGlowColor(
                          plan.id
                        )} pointer-events-none rounded-2xl z-0`}
                      ></div>
                      {/* Plan Header - Centered */}
                      <div className="text-center ">
                        <h3 className={`text-[20px] sm:text-[24px] font-bold mb-2 ${colorScheme.text} tracking-wide`}>
                          {plan.name}
                        </h3>
                        {plan.subtitle && (
                          <p className={`text-[12px] sm:text-[14px] font-medium mb-4 text-white/80`}>{plan.subtitle}</p>
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

                              // Check if promo is active
                              const isPromoActive = plan.metadata?.isPromoActive;
                              const originalEntries = isPromoActive
                                ? plan.metadata?.originalEntries || parseInt(entriesNumber)
                                : parseInt(entriesNumber);

                              return (
                                <div className={`${colorScheme.text}`}>
                                  {isPromoActive ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <span className="text-[20px] sm:text-[24px] font-bold line-through opacity-40 text-slate-400">
                                        {originalEntries}
                                      </span>
                                      <span className="text-[18px] sm:text-[20px] font-bold text-yellow-400">→</span>
                                      <span
                                        className={`text-[36px] sm:text-[44px] font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                      >
                                        {plan.metadata?.entriesCount || entriesNumber}
                                      </span>
                                    </div>
                                  ) : (
                                    <span
                                      className={`text-[36px] sm:text-[44px] font-bold bg-gradient-to-r ${colorScheme.gradient} bg-clip-text text-transparent`}
                                    >
                                      {entriesNumber}
                                    </span>
                                  )}
                                  <div className={`text-[16px] sm:text-[20px] text-white/70 mt-1`}>Free Entries</div>
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
                          <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 backdrop-blur-sm px-3 py-2 rounded-2xl border border-slate-600/50 shadow-lg shadow-black/30">
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
                                  <span className={`text-[12px] sm:text-[14px] leading-relaxed text-white/90`}>
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
                              <span className={`text-[12px] sm:text-[14px] leading-relaxed text-white/90`}>
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
                            className={`w-full h-[50px] sm:h-[55px] rounded-2xl flex items-center justify-center font-bold text-[14px] sm:text-[16px] bg-green-600 text-white cursor-not-allowed opacity-75 ${colorScheme.borderGlow}`}
                          >
                            Current Plan
                          </button>
                        ) : !hasActiveSubscription && plan.isMemberOnly ? (
                          <button
                            disabled
                            className={`w-full h-[50px] sm:h-[55px] rounded-2xl flex items-center justify-center font-bold text-[14px] sm:text-[16px] bg-gray-500 text-white cursor-not-allowed opacity-75 ${colorScheme.borderGlow}`}
                          >
                            Membership Required
                          </button>
                        ) : (
                          (() => {
                            const hierarchy = getPlanHierarchy(plan);
                            let buttonText = "Enter Now";
                            let buttonClass = `w-full h-[50px] sm:h-[55px] rounded-2xl flex items-center justify-center font-bold text-[14px] sm:text-[16px] transition-all duration-300 transform hover:scale-105 hover:shadow-xl bg-gradient-to-r ${colorScheme.gradient} text-white hover:shadow-[0_0_20px_rgba(0,0,0,0.8)]`;

                            if (hasActiveSubscription && activeTab === "membership") {
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

      {/* Member Exclusive Toggle - Only show for non-members on one-time tab */}
      {!hasActiveSubscription && activeTab === "one-time" && (
        <div className="flex justify-center pt-4 sm:pt-10">
          <div className="flex items-center gap-3 bg-gray-100 rounded-[15px] p-3 border border-gray-200">
            <span className="text-[12px] sm:text-[14px] text-gray-700 font-medium">
              {showMemberExclusive ? "Hide Premium Packages" : "Show Premium Packages"}
            </span>
            <button
              onClick={() => setShowMemberExclusive(!showMemberExclusive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                showMemberExclusive ? "bg-red-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  showMemberExclusive ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Signup Modal */}
      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
      />
    </section>
  );
}
