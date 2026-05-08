"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import MembershipModal from "@/components/modals/MembershipModal";
import { useMemberships } from "@/hooks/useMemberships";
import { useUserContext } from "@/contexts/UserContext";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import PromoMultiplierBadge from "@/components/ui/PromoMultiplierBadge";
import BestValueBadge from "@/components/ui/BestValueBadge";
import CornerRibbonBadge from "@/components/ui/CornerRibbonBadge";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import {
  isOneTimeBestValuePlanId,
  isVipTierPlanId,
} from "@/utils/membership/member-package-mapping";
import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";
import PackageInclusionsExpanded from "@/components/modals/PackageInclusionsSlideUp";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import { VariantConfig } from "@/models/ab-testing/Variant";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import {
  getPackageColorSchemeForPromo,
  getMembershipSectionInnerSheenClassNames,
  getCardBorderStyle,
  type PackageColorScheme,
} from "@/utils/package-colors/packageColorScheme";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { hasMultiplierBanner } from "@/utils/promo/multiplier-banner";
import MultiplierBannerImage from "@/components/ui/MultiplierBannerImage";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { cn } from "@/utils/cn";

/** Per-package Enter Now — same building blocks as Schedule Downgrade in subscription management (gradient panel + border glow + shimmer). */
function packageEnterNowButtonStyle(colorScheme: PackageColorScheme): React.CSSProperties {
  return (colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle) as React.CSSProperties;
}

function packageEnterNowCtaClassName(
  colorScheme: PackageColorScheme,
  size: "mobile" | "desktop",
  visuallyDisabled: boolean
): string {
  const textClass = colorScheme.enterNowButtonTextClass ?? (colorScheme.textGradientStyle ? "" : "text-white");
  const textSize = size === "mobile" ? "text-[14px] sm:text-[17px]" : "text-[14px] sm:text-[16px]";
  const base = [
    "font-sans font-extrabold font-black uppercase w-full h-[44px] sm:h-[48px] rounded-2xl flex items-center justify-center px-5",
    textSize,
    "transition-all duration-300 transform",
    textClass,
    /* Pulsing box-shadow (brand-tuned in globals.css) — same family as Schedule Downgrade */
    colorScheme.borderGlow,
    "membership-enter-cta-animation",
  ];
  if (visuallyDisabled) {
    base.push("opacity-60 cursor-not-allowed hover:scale-100");
  } else {
    base.push("hover:scale-[1.02] hover:brightness-105");
  }
  return base.join(" ");
}

/** Outer halo uses package `glow` (filter) so it isn’t clipped by the CTA’s overflow-hidden shimmer. */
function packageEnterNowGlowWrapClassName(colorScheme: PackageColorScheme): string {
  return `w-full rounded-2xl ${colorScheme.glow}`;
}

function isVipPackPlan(planId: string): boolean {
  return isVipTierPlanId(planId);
}

/** Extra gold aura outside the card (stacks with tier highlight / popular shadows). */
function vipCardOuterShadow(base: React.CSSProperties): React.CSSProperties {
  const bs = base.boxShadow;
  if (typeof bs !== "string") return base;
  return {
    ...base,
    boxShadow: `${bs}, 0 0 28px rgba(212, 175, 55, 0.16), 0 0 48px rgba(212, 175, 55, 0.06), 0 0 0 1px rgba(212, 175, 55, 0.18)`,
  };
}

function membershipEnterGlowWrap(colorScheme: PackageColorScheme, isVip: boolean): string {
  if (isVip) {
    return "w-full rounded-2xl animate-vip-premium-enter-wrap";
  }
  return packageEnterNowGlowWrapClassName(colorScheme);
}

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
  
  // Check if a plan should be highlighted (from variant config)
  const isHighlighted = (planId: string): boolean => {
    return variantConfig?.highlightPackage === planId;
  };

  const showPromoHeaderBanner =
    effectivePromoMultiplier !== null &&
    effectivePromoMultiplier > 1 &&
    hasMultiplierBanner(effectivePromoMultiplier);

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
                  className={`font-sans font-extrabold font-black uppercase flex-1 px-4 py-2.5 rounded-[16px] text-[13px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
                    activeTab === "one-time"
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
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
                  className={`font-sans font-extrabold font-black uppercase flex-1 px-4 py-2.5 rounded-[16px] text-[13px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
                    activeTab === "membership"
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
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
              {membershipPlans.map((plan, index) => {
                const colorScheme = getPackageColorSchemeForPromo(plan.id, activeTab === "membership", contextVariantConfig);
                const highlighted = isHighlighted(plan.id);
                const isAdditionalPackage =
                  plan.isMemberOnly && plan.name.toLowerCase().includes("additional");
                const showBestValueRibbon =
                  (activeTab === "membership" && plan.id === "boss-subscription") ||
                  (activeTab === "one-time" && isOneTimeBestValuePlanId(plan.id));
                const isVip = isVipPackPlan(plan.id);
                return (
                  <div
                    key={plan.id}
                    className={`relative w-full ${
                      isAdditionalPackage ? "h-[300px] sm:h-[370px]" : "h-[275px] sm:h-[355px]"
                    } ${isVip ? "rounded-2xl" : "rounded-3xl"} transition-all duration-300 lg:hover:scale-105 overflow-visible ${highlighted ? "scale-105" : ""} ${isVip ? "vip-premium-shell-glow" : ""}`}
                    style={(() => {
                      const base: React.CSSProperties = highlighted
                        ? { boxShadow: `0 0 0 2px rgba(255,255,255,0.7), 0 0 28px ${colorScheme.accentHex}35, 0 8px 36px ${colorScheme.accentHex}20` }
                        : isCurrentSubscription(plan)
                          ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.6), 0 0 24px ${colorScheme.accentHex}25, 0 6px 28px ${colorScheme.accentHex}15` }
                          : plan.isPopular
                            ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.5), 0 0 24px ${colorScheme.accentHex}25, 0 6px 28px ${colorScheme.accentHex}15` }
                            : { boxShadow: `0 0 24px ${colorScheme.accentHex}30, 0 8px 32px ${colorScheme.accentHex}18` };
                      return isVip ? vipCardOuterShadow(base) : base;
                    })()}
                      >
                        {/* Promo Badge - Pin overlay at top-right, outside card */}
                        {plan.metadata?.isPromoActive && plan.metadata?.promoMultiplier && (
                          <div className="absolute -top-6 -right-8 z-30">
                            <Image
                              src={`/images/badge/X${plan.metadata.promoMultiplier}.webp`}
                              alt={`${plan.metadata.promoMultiplier}x entries`}
                              width={96}
                              height={96}
                              className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                            />
                          </div>
                        )}
                        {/* Best Value = last tier only: Boss subscription, or Power one-time (incl. member additional) */}
                        {showBestValueRibbon && (
                          <BestValueBadge position="top-left" size="medium" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme} />
                        )}
                        {!showBestValueRibbon &&
                          (isCurrentSubscription(plan) || (plan.isPopular && !isCurrentSubscription(plan))) && (
                          <CornerRibbonBadge
                            position="top-left"
                            size="medium"
                            badgeStyle={colorScheme.badgeStyle}
                            colorScheme={colorScheme}
                          >
                            {isCurrentSubscription(plan) ? "CURRENT" : "MOST POPULAR"}
                          </CornerRibbonBadge>
                        )}

                        {/* Card Background - Brand gradient (isolate prevents dark parent bg from bleeding through) */}
                        <div
                          className={cn("h-full", isVip ? "rounded-2xl" : "rounded-3xl", "p-4 transition-all duration-300 hover:", colorScheme.hoverShadow, "relative isolate")}
                          style={
                            {
                              background: colorScheme.bgGradient,
                              backgroundOrigin: "border-box",
                              ...getCardBorderStyle(colorScheme, colorScheme.bgGradient),
                            } as React.CSSProperties
                          }
                        >
                          {isVip && (
                            <div
                              className="vip-premium-inner-luminosity absolute inset-0 z-0 rounded-2xl"
                              aria-hidden
                            />
                          )}
                          {/* Inside Glow - Whole Card with Margin */}
                          <div
                            className={`absolute inset-2 sm:inset-0.5 ${getMembershipSectionInnerSheenClassNames(
                              plan.id,
                              activeTab === "membership",
                              contextVariantConfig
                            )} pointer-events-none ${isVip ? "rounded-xl" : "rounded-2xl"} ${isVip ? "z-[1]" : "z-0"}`}
                          ></div>

                          {/* Package Icon - Centered at top */}
                          {getPackageIcon(plan.id) && (
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 z-20">
                              <div
                                className={`w-20 h-20 sm:w-24 sm:h-24 relative ${getPackageIconWrapperScaleClass(plan.id, "modal")}`}
                              >
                                <Image
                                  src={getPackageIcon(plan.id)!}
                                  alt={`${plan.name} icon`}
                                  fill
                                  sizes="(max-width: 640px) 56px, (max-width: 1024px) 64px, 96px"
                                  priority={index === 0}
                                  className={`w-full h-full object-contain ${isVip ? "animate-vip-icon-halo" : `${colorScheme.glow}`} opacity-90`}
                                />
                                {/* Promo Badge removed from mobile view - now shown on toggle instead */}
                              </div>
                            </div>
                          )}

                          <div className={cn("h-full flex flex-col pt-6 px-4 py-1.5 uppercase", isVip ? "relative z-10" : "")}>
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
                                    className={cn("font-sans font-bold mb-0", colorScheme.textGradientStyle ? "" : colorScheme.text, "leading-tight", activeTab === "one-time" ? "text-[15px] sm:text-[16px]" : "text-[19px] sm:text-[20px]")}
                                    style={colorScheme.textGradientStyle}
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
                                  className={cn("font-sans text-[14px] sm:text-[16px] font-medium mb-0.5", colorScheme.textGradientStyle ? "" : colorScheme.textMuted)}
                                  style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : undefined}
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
                                    <div className={cn("font-sans", colorScheme.textGradientStyle ? "" : colorScheme.text, "text-center")}>
                                      {hasMultiplier ? (
                                        <div className="flex items-center justify-center gap-1.5">
                                          <span className={cn("text-[22px] sm:text-[24px] font-bold line-through opacity-40", colorScheme.textMuted)}>
                                            {originalEntries}
                                          </span>
                                          <span
                                            className={cn("text-[19px] sm:text-[18px] font-bold", colorScheme.textGradientStyle ? "" : colorScheme.entriesText)}
                                            style={colorScheme.textGradientStyle}
                                          >
                                            →
                                          </span>
                                          <span
                                            className={cn("text-[34px] sm:text-[36px] font-bold", colorScheme.textGradientStyle ? "" : colorScheme.entriesText)}
                                            style={colorScheme.textGradientStyle}
                                          >
                                            {displayEntries}
                                          </span>
                                        </div>
                                      ) : (
                                        <span
                                          className={cn("text-[34px] sm:text-[36px] font-bold", colorScheme.textGradientStyle ? "" : colorScheme.entriesText)}
                                          style={colorScheme.textGradientStyle}
                                        >
                                          {entriesNumber}
                                        </span>
                                      )}
                                      <div
                                        className={cn("text-[17px] sm:text-[18px] font-semibold mt-0", colorScheme.textGradientStyle ? "" : colorScheme.textMuted)}
                                        style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : undefined}
                                      >
                                        Free Entries
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {/* Horizontal Divider */}
                            <div
                              className={`w-full p-[0.25px] mb-2 rounded-full ${
                                isVip
                                  ? "bg-gradient-to-r from-transparent via-[#D4AF37]/55 to-transparent"
                                  : "bg-white/80 dark:bg-neutral-600/50"
                              }`}
                            ></div>

                            {/* Price / Prize section - original Enter Now design (package gradient), clickable to open payment flow */}
                            <div className="flex-1 min-h-0 overflow-visible flex justify-center mb-2">
                              <div className="pb-0.5 w-full flex justify-center">
                                <button
                                  type="button"
                                  className={`font-sans w-fit px-2.5 py-1 rounded-2xl overflow-hidden uppercase bg-gradient-to-r ${colorScheme.gradient} ${colorScheme.buttonShadow} ${colorScheme.buttonHoverShadow} ${isVip ? "animate-vip-premium-price-halo" : colorScheme.borderGlow} hover:opacity-90 transition-all duration-300 ${(isCurrentSubscription(plan) || (!hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly)) ? "cursor-not-allowed opacity-90 hover:opacity-90" : "cursor-pointer"}`}
                                  onClick={() => {
                                    if (isCurrentSubscription(plan) || (!hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly)) return;
                                    handlePlanSelect(plan);
                                  }}
                                  disabled={isCurrentSubscription(plan) || (!hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly)}
                                  aria-label={`Select ${plan.name} for $${plan.price}`}
                                >
                                  <div className={cn("flex items-baseline gap-1 justify-center", colorScheme.buttonText)}>
                                    <span className="font-bold text-[20px] sm:text-lg">${plan.price}</span>
                                    {plan.period !== "one-time" ? (
                                      <span className="font-semibold text-[14px] sm:text-2xs opacity-90">Per Giveaway</span>
                                    ) : (
                                      <span className="font-semibold text-[14px] sm:text-2xs opacity-90">One Time Payment</span>
                                    )}
                                  </div>
                                </button>
                              </div>
                            </div>
                            {/* Tickmarks hidden on mobile - see "Click here to see full package inclusion" below */}

                            {/* Action Button - In flow, no overlay (8px below price for grouped feel) */}
                            <div className="flex-shrink-0 mt-auto pt-0">
                              {isCurrentSubscription(plan) ? (
                                <div className={membershipEnterGlowWrap(colorScheme, isVip)}>
                                  <button
                                    type="button"
                                    disabled
                                    className={packageEnterNowCtaClassName(colorScheme, "mobile", true)}
                                    style={packageEnterNowButtonStyle(colorScheme)}
                                  >
                                    <span className="relative z-10" style={colorScheme.textGradientStyle ?? undefined}>
                                      Current Plan
                                    </span>
                                  </button>
                                </div>
                              ) : !hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly ? (
                                <button
                                  disabled
                                  className="font-sans font-extrabold font-black uppercase w-full h-[44px] sm:h-[48px] rounded-2xl flex items-center justify-center text-[14px] sm:text-[18px] bg-gray-500 text-white cursor-not-allowed opacity-75 border border-gray-400/30"
                                >
                                  Subscription or Entries Required
                                </button>
                              ) : (
                                (() => {
                                  const hierarchy = getPlanHierarchy(plan);
                                  const isSubscriptionPlan =
                                    plan.period !== "one-time" && !plan.name.toLowerCase().includes("one-time");
                                  let buttonText = "Enter Now";

                                  if (hasBlockingSub && isPastDue && isSubscriptionPlan) {
                                    buttonText = "Update payment";
                                  } else if (hasActiveSubscription && activeTab === "membership") {
                                    if (hierarchy.isCurrent) buttonText = "Current Plan";
                                    else if (hierarchy.isDowngrade) buttonText = `Downgrade to ${plan.name}`;
                                    else if (hierarchy.isUpgrade) buttonText = `Upgrade to ${plan.name}`;
                                  }

                                  const isCtaDisabled = hasActiveSubscription && hierarchy.isCurrent;

                                  return (
                                    <div className={membershipEnterGlowWrap(colorScheme, isVip)}>
                                      <button
                                        type="button"
                                        className={packageEnterNowCtaClassName(colorScheme, "mobile", isCtaDisabled)}
                                        style={packageEnterNowButtonStyle(colorScheme)}
                                        onClick={() => handlePlanSelect(plan)}
                                        disabled={isCtaDisabled}
                                        suppressHydrationWarning
                                      >
                                        <span className="relative z-10" style={colorScheme.textGradientStyle ?? undefined}>
                                          {buttonText}
                                        </span>
                                      </button>
                                    </div>
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

      {/* Desktop: Grid Layout */}
      {!loading && !error && (
        <div className="hidden lg:block overflow-visible">
          <div
            className={`grid gap-3 sm:gap-4 overflow-visible pt-8 max-w-7xl mx-auto grid-cols-1 w-full ${
              membershipPlans.length === 5 ? "lg:grid-cols-5" : "md:grid-cols-3"
            }`}
          >
            {membershipPlans.length > 0 ? (
              membershipPlans.map((plan) => {
              const colorScheme = getPackageColorSchemeForPromo(plan.id, activeTab === "membership", contextVariantConfig);
              const highlighted = isHighlighted(plan.id);
              const isAdditionalPackage =
                plan.isMemberOnly && plan.name.toLowerCase().includes("additional");
              const showBestValueRibbon =
                (activeTab === "membership" && plan.id === "boss-subscription") ||
                (activeTab === "one-time" && isOneTimeBestValuePlanId(plan.id));
              const isVip = isVipPackPlan(plan.id);
              return (
                <div
                  key={plan.id}
                  className={cn("relative", isAdditionalPackage ? "h-[350px]" : "h-[320px]", isVip ? "rounded-2xl" : "rounded-3xl", "transition-all duration-300 overflow-visible w-full min-w-0", highlighted ? "scale-105" : "", isVip ? "vip-premium-shell-glow" : "")}
                  style={(() => {
                    const base: React.CSSProperties = highlighted
                      ? { boxShadow: `0 0 0 2px rgba(255,255,255,0.7), 0 0 28px ${colorScheme.accentHex}35, 0 8px 36px ${colorScheme.accentHex}20` }
                      : isCurrentSubscription(plan)
                        ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.6), 0 0 24px ${colorScheme.accentHex}25, 0 6px 28px ${colorScheme.accentHex}15` }
                        : plan.isPopular
                          ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.5), 0 0 24px ${colorScheme.accentHex}25, 0 6px 28px ${colorScheme.accentHex}15` }
                          : { boxShadow: `0 0 24px ${colorScheme.accentHex}30, 0 8px 32px ${colorScheme.accentHex}18` };
                    return isVip ? vipCardOuterShadow(base) : base;
                  })()}
                >
                  {/* Best Value = last tier only: Boss subscription, or Power one-time (incl. member additional) */}
                  {showBestValueRibbon && (
                    <BestValueBadge position="top-left" size="medium" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme} />
                  )}
                  {!showBestValueRibbon &&
                    (isCurrentSubscription(plan) || (plan.isPopular && !isCurrentSubscription(plan))) && (
                    <CornerRibbonBadge
                      position="top-left"
                      size="medium"
                      badgeStyle={colorScheme.badgeStyle}
                      colorScheme={colorScheme}
                    >
                      {isCurrentSubscription(plan) ? "CURRENT" : "MOST POPULAR"}
                    </CornerRibbonBadge>
                  )}

                  {/* Promo Badge - Pin overlay at top-right, outside card */}
                  {plan.metadata?.isPromoActive && plan.metadata?.promoMultiplier && (
                    <div className="absolute -top-10 -right-8 z-30">
                      <Image
                        src={`/images/badge/X${plan.metadata.promoMultiplier}.webp`}
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
                      <div
                        className={`w-24 h-24 relative ${getPackageIconWrapperScaleClass(
                          plan.id,
                          activeTab === "one-time" ? "membership-desktop-one-time" : "membership-desktop-subscription"
                        )}`}
                      >
                        <Image
                          src={getPackageIcon(plan.id)!}
                          alt={`${plan.name} icon`}
                          className={cn("w-full h-full object-contain", isVip ? "animate-vip-icon-halo" : colorScheme.glow, "opacity-90")}
                        />
                        {/* Promo Badge positioned on top of the image icon */}
                        {/* Promo badge on icon removed - now shown as hexagonal badge on card top-right */}
                      </div>
                    </div>
                  )}

                  {/* Card Background - Brand gradient (isolate prevents dark parent bg from bleeding through) */}
                  <div
                    className={cn("h-full", isVip ? "rounded-2xl" : "rounded-3xl", "p-4 sm:p-2 transition-all duration-300 hover:", colorScheme.hoverShadow, "relative isolate")}
                    style={
                      {
                        background: colorScheme.bgGradient,
                        backgroundOrigin: "border-box",
                        ...getCardBorderStyle(colorScheme, colorScheme.bgGradient),
                      } as React.CSSProperties
                    }
                  >
                    {isVip && (
                      <div
                        className="vip-premium-inner-luminosity absolute inset-0 z-0 rounded-2xl"
                        aria-hidden
                      />
                    )}
                    <div className={cn("h-full flex flex-col pt-10 relative px-4 py-2 uppercase", isVip ? "z-10" : "")}>
                      {/* Inside Glow - Whole Card with Margin */}
                      <div
                        className={`absolute inset-0.5 ${getMembershipSectionInnerSheenClassNames(
                              plan.id,
                              activeTab === "membership",
                              contextVariantConfig
                            )} pointer-events-none ${isVip ? "rounded-xl" : "rounded-2xl"} ${isVip ? "z-[1]" : "z-0"}`}
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
                              className={cn("font-sans font-bold mb-2", colorScheme.textGradientStyle ? "" : colorScheme.text, "leading-tight", activeTab === "one-time" ? "text-[14px] sm:text-[16px]" : "text-[16px] sm:text-[20px]")}
                              style={colorScheme.textGradientStyle}
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
                            className={cn("font-sans text-[12px] sm:text-[14px] font-medium mb-4", colorScheme.textGradientStyle ? "" : colorScheme.textMuted)}
                            style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : undefined}
                          >
                            {plan.subtitle}
                          </p>
                        )}

                        {/* Entries - Main Focus */}
                        <div className="mb-4 lg:mb-2">
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
                                <div className={cn("font-sans", colorScheme.textGradientStyle ? "" : colorScheme.text)}>
                                  {hasMultiplier ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <span className={cn("text-[16px] sm:text-[18px] font-bold line-through opacity-40", colorScheme.textMuted)}>
                                        {originalEntries}
                                      </span>
                                      <span
                                        className={cn("text-[14px] sm:text-[16px] font-bold", colorScheme.textGradientStyle ? "" : colorScheme.entriesText)}
                                        style={colorScheme.textGradientStyle}
                                      >
                                        →
                                      </span>
                                      <span
                                        className={cn("text-[28px] sm:text-[34px] font-bold", colorScheme.textGradientStyle ? "" : colorScheme.entriesText)}
                                        style={colorScheme.textGradientStyle}
                                      >
                                        {displayEntries}
                                      </span>
                                    </div>
                                  ) : (
                                    <span
                                      className={cn("text-[28px] sm:text-[34px] font-bold", colorScheme.textGradientStyle ? "" : colorScheme.entriesText)}
                                      style={colorScheme.textGradientStyle}
                                    >
                                      {entriesNumber}
                                    </span>
                                  )}
                                  <div
                                    className={cn("text-[17px] sm:text-[18px] font-semibold mt-1", colorScheme.textGradientStyle ? "" : colorScheme.textMuted)}
                                    style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : undefined}
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
                      <div
                        className={`w-full p-[0.5px] mb-4 lg:mb-2 rounded-full ${
                          isVip
                            ? "bg-gradient-to-r from-transparent via-[#D4AF37]/55 to-transparent"
                            : "bg-white dark:bg-neutral-600/50"
                        }`}
                      ></div>

                      {/* Features List - Tick marks hidden on desktop (see "View package inclusions" below) */}
                      <div className="flex-1 lg:flex-initial overflow-visible space-y-3 sm:space-y-3 mb-4 sm:mb-0 lg:mb-2">
                        {/* Price / Prize section - original Enter Now design (package gradient), clickable to open payment flow */}
                        <div className="pb-2 flex justify-center">
                          <button
                            type="button"
                            className={`font-sans w-fit px-3 py-2 rounded-2xl overflow-hidden uppercase bg-gradient-to-r ${colorScheme.gradient} ${colorScheme.buttonShadow} ${colorScheme.buttonHoverShadow} ${isVip ? "animate-vip-premium-price-halo" : colorScheme.borderGlow} hover:opacity-90 transition-all duration-300 ${(isCurrentSubscription(plan) || (!hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly)) ? "cursor-not-allowed opacity-90 hover:opacity-90" : "cursor-pointer"}`}
                            onClick={() => {
                              if (isCurrentSubscription(plan) || (!hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly)) return;
                              handlePlanSelect(plan);
                            }}
                            disabled={isCurrentSubscription(plan) || (!hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly)}
                            aria-label={`Select ${plan.name} for $${plan.price}`}
                          >
                            <div className={cn("flex flex-row items-baseline gap-1 justify-center lg:flex-col lg:items-center lg:gap-0", colorScheme.buttonText)}>
                              <span className="text-base sm:text-lg lg:text-xl font-bold">${plan.price}</span>
                              {plan.period !== "one-time" ? (
                                <span className="text-xs lg:text-sm font-semibold opacity-90">Per Giveaway</span>
                              ) : (
                                <span className="text-xs lg:text-sm font-semibold opacity-90">One Time Payment</span>
                              )}
                            </div>
                          </button>
                        </div>
                        {/* Tick marks hidden on desktop - see "Click here to see full package inclusion" below */}
                      </div>

                      {/* Action Button - Inside card at bottom (8px below price for grouped feel) */}
                      <div className="flex-shrink-0 pt-0">
                        {isCurrentSubscription(plan) ? (
                          <div className={membershipEnterGlowWrap(colorScheme, isVip)}>
                            <button
                              type="button"
                              disabled
                              className={packageEnterNowCtaClassName(colorScheme, "desktop", true)}
                              style={packageEnterNowButtonStyle(colorScheme)}
                            >
                              <span className="relative z-10" style={colorScheme.textGradientStyle ?? undefined}>
                                Current Plan
                              </span>
                            </button>
                          </div>
                        ) : !hasAdditionalPackageAccess(userData, userMajorDrawStats) && plan.isMemberOnly ? (
                          <button
                            disabled
                            className="font-sans font-extrabold font-black uppercase w-full h-[44px] sm:h-[48px] rounded-2xl flex items-center justify-center px-5 text-[14px] sm:text-[16px] bg-gray-500 text-white cursor-not-allowed opacity-75 border border-gray-400/30"
                          >
                            Subscription or Entries Required
                          </button>
                        ) : (
                          (() => {
                            const hierarchy = getPlanHierarchy(plan);
                            const isSubscriptionPlan =
                              plan.period !== "one-time" && !plan.name.toLowerCase().includes("one-time");
                            let buttonText = "Enter Now";

                            if (hasBlockingSub && isPastDue && isSubscriptionPlan) {
                              buttonText = "Update payment";
                            } else if (hasActiveSubscription && activeTab === "membership") {
                              if (hierarchy.isCurrent) buttonText = "Current Plan";
                              else if (hierarchy.isDowngrade) buttonText = `Downgrade to ${plan.name}`;
                              else if (hierarchy.isUpgrade) buttonText = `Upgrade to ${plan.name}`;
                            }

                            const isCtaDisabled = hasActiveSubscription && hierarchy.isCurrent;

                            return (
                              <div className={membershipEnterGlowWrap(colorScheme, isVip)}>
                                <button
                                  type="button"
                                  className={packageEnterNowCtaClassName(colorScheme, "desktop", isCtaDisabled)}
                                  style={packageEnterNowButtonStyle(colorScheme)}
                                  onClick={() => handlePlanSelect(plan)}
                                  disabled={isCtaDisabled}
                                  suppressHydrationWarning
                                >
                                  <span className="relative z-10" style={colorScheme.textGradientStyle ?? undefined}>
                                    {buttonText}
                                  </span>
                                </button>
                              </div>
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
              className={`font-sans w-full py-3 px-4 rounded-2xl text-white font-semibold text-[15px] sm:text-base shadow-lg transition-all duration-300 hover:scale-[1.02] border flex items-center justify-center ${
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
