"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Lazy-loaded: MembershipModal bundles Stripe + payment forms.
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), {
  ssr: false,
});
import { useMemberships } from "@/hooks/useMemberships";
import { useUserContext } from "@/contexts/UserContext";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import PromoMultiplierBadge from "@/components/ui/PromoMultiplierBadge";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import {
  isOneTimeBestValuePlanId,
} from "@/utils/membership/member-package-mapping";
import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";
import PackageInclusionsExpanded from "@/components/modals/PackageInclusionsSlideUp";
import { VariantConfig } from "@/models/ab-testing/Variant";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import {
  getMembershipSectionColorScheme,
} from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { useHtmlDarkForUi } from "@/hooks/useHtmlDarkForUi";
import ElectricPackageCard from "@/components/sections/membership/ElectricPackageCard";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { hasMultiplierBanner } from "@/utils/promo/multiplier-banner";
import MultiplierBannerImage from "@/components/ui/MultiplierBannerImage";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { cn } from "@/utils/cn";

interface MembershipSectionProps {
  title?: string;
  padding?: string;
  titleColor?: string;
  onPlanSelect?: (plan: LocalMembershipPlan) => void;
  variantConfig?: VariantConfig["packages"]; // Optional variant config for packages
}

export default function MembershipSection({
  title: _title = "CHOOSE YOUR PACKAGE",
  padding = "py-12 sm:py-16 lg:py-20",
  titleColor = "text-black",
  onPlanSelect,
  variantConfig,
}: MembershipSectionProps) {
  const router = useRouter();
  const isDark = useHtmlDarkForUi();
  const theme = usePromoTheme();
  const promoThemeSlug = usePromoThemeStore((s) => s.slug);
  const promoToolsetSlug = usePromoThemeStore((s) => s.toolsetSlug);

  // Get variant config from context for A/B testing (membershipModal config)
  const { variantConfig: contextVariantConfig } = useVariantContext();
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");
  const [isMounted, setIsMounted] = useState(false);
  const [isInclusionsExpanded, setIsInclusionsExpanded] = useState(false);
  /** Must be top-level — image onError fallback for multiplier banner */
  const [multiplierBannerLoadFailed, setMultiplierBannerLoadFailed] = useState(false);

  // Handle client-side mounting to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch membership data from API
  const { subscriptionPackages, oneTimePackages, loading, error } = useMemberships();

  // Fetch user data to check membership status
  const { userData, loading: userLoading } = useUserContext();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();

  // Use the centralized membership modal hook
  const membershipModal = useMembershipModal();

  // Get resolved multipliers (includes scheduled, toggle, and alternating)
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");

  // Listen for upsell modal requests
  useEffect(() => {
    const handleOpenMembershipModal = (event: CustomEvent) => {
      console.log("🎯 MembershipSection received openMembershipModal event:", event.detail);
      const detail = event.detail ?? {};
      const plan = detail.plan as LocalMembershipPlan | undefined;

      whenGatesOpenElseGateModal(() => {
        if (plan) {
          membershipModal.setSelectedPlan(plan);
        }
        membershipModal.openModal();
      });
    };

    window.addEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);

    return () => {
      window.removeEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);
    };
  }, [membershipModal, whenGatesOpenElseGateModal]);

  // Check if user has an active subscription (only for recurring subscription plans)
  const hasActiveSubscription = userData?.subscription?.isActive || false;
  const currentUserSubscription = userData?.subscriptionPackageData;

  // past_due users have a subscription that blocks new purchases - show "Update payment" not "Enter Now"
  const hasBlockingSub = hasBlockingSubscription(userData);
  const isPastDue = (userData?.subscription as { status?: string } | undefined)?.status === "past_due";

  // Check if user has access to additional packages (subscription OR current draw entries)
  const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(userData, userMajorDrawStats);

  const effectivePromoMultiplier =
    activeTab === "membership"
      ? resolvedMembershipMultiplier
      : hasAccessToAdditionalPackages && hasActiveSubscription
        ? resolvedMembershipMultiplier
        : resolvedOneTimeMultiplier;

  useEffect(() => {
    setMultiplierBannerLoadFailed(false);
  }, [effectivePromoMultiplier, activeTab, promoThemeSlug, promoToolsetSlug]);

  // Update default tab: no active subscription → membership tab; with subscription and access → one-time
  useEffect(() => {
    if (!userLoading && userData) {
      // Users without an active subscription always default to membership so they can subscribe
      const newTab = !hasActiveSubscription
        ? "membership"
        : hasAccessToAdditionalPackages
          ? "one-time"
          : "membership";
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
  }, [hasActiveSubscription, hasAccessToAdditionalPackages, userLoading, userData]);

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
    whenGatesOpenElseGateModal(() => {
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
    });
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

    // Respect user's tab choice everywhere so they can see both one-time and membership packs
    const effectiveTab = activeTab;

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
    // For one-time: use membership multiplier when plan is member-only and user is a member
    const isMember = hasActiveSubscription;
    const finalPlans = convertedPlans.map((plan) => {
      if (effectiveTab === "one-time" && plan.period === "one-time") {
        const effectiveType = getEffectivePromoType(plan.id, "one-time", isMember);
        const resolvedMultiplier =
          effectiveType === "membership-packages" ? resolvedMembershipMultiplier : resolvedOneTimeMultiplier;
        if (resolvedMultiplier !== null && resolvedMultiplier > 1) {
          const originalEntries = plan.metadata?.entriesCount || 0;
          const promoEntries = originalEntries * resolvedMultiplier;

          const updatedFeatures = plan.features.map((feature) => {
            if (feature.text.includes("Entries") || feature.text.includes("entries")) {
              const match = feature.text.match(/(\d+)\s*(Free\s+)?(Accumulated\s+)?Entries/i);
              if (match) {
                const originalNumber = parseInt(match[1]);
                const newNumber = originalNumber * resolvedMultiplier;
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
              promoMultiplier: resolvedMultiplier,
              isPromoActive: (resolvedMultiplier ?? 1) > 1,
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
  
  const showPromoHeaderBanner =
    effectivePromoMultiplier !== null &&
    effectivePromoMultiplier > 1 &&
    hasMultiplierBanner(effectivePromoMultiplier);

  /** Single source of truth for a package card — used by both the mobile and desktop grids. */
  const renderPlanCard = (plan: LocalMembershipPlan) => {
    const colorScheme =
      activeTab === "membership"
        ? getMembershipSectionColorScheme(plan.id, true)
        : getElectricPackageColorScheme(plan.id);
    const discount = activeTab === "one-time" ? getAdditionalPackDiscount(plan.id) : null;
    const locked = !hasAccessToAdditionalPackages && !!plan.isMemberOnly;
    const current = isCurrentSubscription(plan);
    const hierarchy = getPlanHierarchy(plan);
    const isSubscriptionPlan = plan.period !== "one-time" && !plan.name.toLowerCase().includes("one-time");
    let ctaLabel = "Enter Now";
    if (hasBlockingSub && isPastDue && isSubscriptionPlan) ctaLabel = "Update payment";
    else if (hasActiveSubscription && activeTab === "membership") {
      if (hierarchy.isCurrent) ctaLabel = "Current Plan";
      else if (hierarchy.isDowngrade) ctaLabel = `Downgrade to ${getPackageDisplayName(plan)}`;
      else if (hierarchy.isUpgrade) ctaLabel = `Upgrade to ${getPackageDisplayName(plan)}`;
    }
    const showBestValueRibbon =
      (activeTab === "membership" && plan.id === "boss-subscription") ||
      (activeTab === "one-time" && isOneTimeBestValuePlanId(plan.id));
    const ribbon = plan.isPopular ? "MOST POPULAR" : null;
    return (
      <div key={plan.id} className="overflow-visible px-1 pt-8 sm:pt-12">
        <ElectricPackageCard
          plan={plan}
          colorScheme={colorScheme}
          state={{ locked, lockReason: "Subscription or Entries Required", isCurrent: current }}
          discount={discount ? { regularPrice: discount.regularPrice, percentOff: discount.percentOff } : null}
          onSelect={handlePlanSelect}
          showBestValue={showBestValueRibbon}
          ribbon={showBestValueRibbon ? null : ribbon}
          ctaLabel={ctaLabel}
          theme={isDark ? "dark" : "light"}
        />
      </div>
    );
  };

  return (
    <section id="membership" className={cn(padding, "w-full px-4 sm:px-6 lg:px-8 overflow-visible relative z-10")}>
  
        {/* Section Header - Promo-based: show banner image when active promo */}
        {effectivePromoMultiplier !== null && effectivePromoMultiplier > 1 && (
          <div className="text-center mb-2 sm:mb-3 lg:mb-4">
            {showPromoHeaderBanner && !multiplierBannerLoadFailed ? (
              <div className="flex justify-center">
                <MultiplierBannerImage
                  multiplier={effectivePromoMultiplier}
                  slug={promoThemeSlug}
                  toolsetSlug={promoToolsetSlug}
                  alt={`${effectivePromoMultiplier}X Promo Activated`}
                  className="w-full max-w-2xl lg:max-w-md h-auto object-contain"
                  priority
                  onExhausted={() => setMultiplierBannerLoadFailed(true)}
                />
              </div>
            ) : (
              <h2
                className={cn("font-sans font-extrabold font-black uppercase text-[22px] sm:text-[24px] lg:text-agency-title leading-tight", titleColor, "dark:text-white")}
              >
                <span style={{ color: theme.primary }}>{effectivePromoMultiplier}X PROMO</span> ACTIVATED
              </h2>
            )}
          </div>
        )}

        {/* Toggle - Always show One-Time and Membership Packs so user can switch between both */}
        <div className="flex justify-center mb-4 ">
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
                  className={`font-sans font-extrabold font-black uppercase flex-1 px-4 py-2.5 rounded-[16px] text-[13px] sm:text-[14px] transition-[colors,transform,box-shadow] duration-[var(--ta-transition-dur)] whitespace-nowrap focus:outline-none relative ${
                    activeTab === "one-time"
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-[colors] duration-[var(--ta-transition-dur)]"
                  }`}
                >
                  One-Time
                  {/* Multiplier Badge: one-time multiplier for non-members; membership multiplier only when user is a member with access */}
                  {isMounted && activeTab === "one-time" &&
                    (hasAccessToAdditionalPackages && hasActiveSubscription
                      ? resolvedMembershipMultiplier !== null && resolvedMembershipMultiplier > 1 && (
                          <PromoMultiplierBadge multiplier={resolvedMembershipMultiplier as PromoMultiplier} />
                        )
                      : resolvedOneTimeMultiplier !== null && resolvedOneTimeMultiplier > 1 && (
                          <PromoMultiplierBadge multiplier={resolvedOneTimeMultiplier as PromoMultiplier} />
                        ))}
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
                  className={`font-sans font-extrabold font-black uppercase flex-1 px-4 py-2.5 rounded-[16px] text-[13px] sm:text-[14px] transition-[colors,transform,box-shadow] duration-[var(--ta-transition-dur)] whitespace-nowrap focus:outline-none relative ${
                    activeTab === "membership"
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-[colors] duration-[var(--ta-transition-dur)]"
                  }`}
                >
                  Membership Packs
                  {/* Multiplier Badge - Upper right, fiery metallic red (mobile and desktop) */}
                  {/* Show badge if there's an active promo OR an alternating multiplier */}
                  {isMounted && activeTab === "membership" && resolvedMembershipMultiplier !== null && resolvedMembershipMultiplier > 1 && (
                    <PromoMultiplierBadge multiplier={resolvedMembershipMultiplier as PromoMultiplier} />
                  )}
                </button>
              </div>
            </div>
          </div>

        {/* Mobile/Tablet: Vertical Stack Layout */}
        {!loading && !error && (
          <div className="lg:hidden overflow-visible ">
            <div className="grid grid-cols-1 gap-4 sm:gap-6 max-w-md mx-auto overflow-visible">
              {membershipPlans.map(renderPlanCard)}
            </div>
          </div>
        )}

      {/* Desktop: Grid Layout */}
      {!loading && !error && (
        <div className="hidden lg:block overflow-visible">
          <div
            className={`grid gap-3 sm:gap-4 overflow-visible pt-8 max-w-7xl mx-auto grid-cols-1 w-full ${
              membershipPlans.length === 5 ? "lg:grid-cols-5" : "md:grid-cols-3"
            }`}
          >
            {membershipPlans.length > 0 ? (
              membershipPlans.map(renderPlanCard)
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-600 dark:text-neutral-400">No membership packages available</p>
            </div>
          )}
          </div>
        
        </div>
      )}

      

      {/* Toggle Button for Package Inclusions - All screen sizes (mobile and desktop) */}
      {(() => {
        const shouldShowToggle = membershipPlans.length > 0 && !loading && !error;

        if (!shouldShowToggle) return null;

        return (
          <div className="mt-8 sm:mt-10">
            <button
              suppressHydrationWarning
              onClick={() => setIsInclusionsExpanded(!isInclusionsExpanded)}
              className={`font-sans w-full py-3 px-4 rounded-2xl text-white font-semibold text-[15px] sm:text-base shadow-lg transition-[transform,box-shadow,colors] duration-[var(--ta-transition-dur)] hover:scale-[1.02] border flex items-center justify-center ${
                isInclusionsExpanded
                  ? "bg-gradient-to-r from-slate-600 via-slate-700 to-slate-600 border-slate-500 hover:shadow-xl"
                  : "bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 border-slate-700 hover:shadow-xl"
              }`}
            >
              <span>Click here to see full package inclusion</span>
            </button>

            {/* Package Inclusions Expanded Component - shows all currently displayed packages */}
            <PackageInclusionsExpanded isExpanded={isInclusionsExpanded} packages={membershipPlans} showAccumulationChart={activeTab === "membership"} />
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
