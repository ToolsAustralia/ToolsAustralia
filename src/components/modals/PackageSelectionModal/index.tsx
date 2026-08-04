"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ModalContainer, ModalHeader, ModalContent } from "../ui";
import { useMemberships } from "@/hooks/useMemberships";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useUserData } from "@/hooks/queries";
import { isForemanSubscriptionPlanId, isPublicPackage } from "@/utils/membership/additional-package-mapping";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import TabSwitcher from "./TabSwitcher";
import PlanGrid from "./PlanGrid";

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
  const isNarrowViewport = useMediaQuery("(max-width: 639px)");
  const { data: session } = useSession();
  const [selectedPlan, setSelectedPlan] = useState<LocalMembershipPlan>(currentPlan);
  // Sub-tab for one-time packages: allow switching between regular one-time and membership packages
  const [oneTimeSubTab, setOneTimeSubTab] = useState<"one-time" | "membership">("one-time");
  /** Pending auto-confirm pick (the 200ms tap→glow→select delay). Cancelled when the picker closes
   *  so a pick can't fire into a modal the user has already dismissed — previously a pick followed
   *  by an instant ✕ committed the plan into the CLOSED modal's state, leaving a stale preselected
   *  plan (which then skipped selection-first) on the next open. */
  const pendingPickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isOpen) return;
    if (pendingPickTimeoutRef.current) {
      clearTimeout(pendingPickTimeoutRef.current);
      pendingPickTimeoutRef.current = null;
    }
  }, [isOpen]);
  useEffect(
    () => () => {
      if (pendingPickTimeoutRef.current) clearTimeout(pendingPickTimeoutRef.current);
    },
    [],
  );

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
              { text: "50% Access to Partner Discounts" },
              // { text: "5% Off Shop" },
              { text: "15 Free Accumulated Entries" },
            ],
            buttonText: "Get Started",
            buttonStyle: "secondary",
            isAdditional: false,
          },
          {
            id: "foreman",
            name: "Foreman",
            subtitle: "Powerpass",
            price: 40,
            period: "mo",
            features: [
              { text: "75% Access to Partner Discounts" },
              // { text: "10% Off Shop" },
              { text: "40 Free Accumulated Entries" },
            ],
            isPopular: true,
            buttonText: "Go Pro",
            buttonStyle: "primary",
            isAdditional: false,
          },
          {
            id: "boss",
            name: "Boss",
            subtitle: "Hard Yakka",
            price: 80,
            period: "mo",
            features: [
              { text: "100% Access to Partner Discounts" },
              // { text: "20% Off Shop" },
              { text: "100 Free Accumulated Entries" },
            ],
            buttonText: "Become Boss",
            buttonStyle: "secondary",
            isAdditional: false,
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
              { text: "25% of Partner Discounts Available" },
              { text: "1 Days Access to Partner Discounts" },
              { text: "3 free entries" },
            ],
            buttonText: "Buy Now",
            buttonStyle: "secondary" as const,
            isAdditional: false,
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
              { text: "40% of Partner Discounts Available" },
              { text: "2 Days Access to Partner Discounts" },
              { text: "15 free entries" },
            ],
            isPopular: true,
            buttonText: "Get Tradie",
            buttonStyle: "primary" as const,
            isAdditional: false,
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
              { text: "55% of Partner Discounts Available" },
              { text: "4 Days Access to Partner Discounts" },
              { text: "30 free entries" },
            ],
            buttonText: "Go Foreman",
            buttonStyle: "secondary" as const,
            isAdditional: true,
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
              { text: "150 free entries" },
              { text: "10 Days Access to Partner Discounts" },
              { text: "70% of Partner Discounts Available" },
            ],
            buttonText: "Get Boss",
            buttonStyle: "secondary" as const,
            isAdditional: true,
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
              { text: "85% of Partner Discounts Available" },
              { text: "20 Days Access to Partner Discounts" },
              { text: "600 free entries" },
            ],
            buttonText: "Get Power",
            buttonStyle: "secondary" as const,
            isAdditional: true,
            metadata: {
              entriesCount: 600,
            },
          },
        ];

        // Filter out non-member packages for existing members
        const filteredPackages = isMember
          ? allOneTimePackages.filter((pkg) => !isPublicPackage(pkg.id))
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

    // Rapid re-pick within the glow window: the latest pick wins, exactly once.
    if (pendingPickTimeoutRef.current) clearTimeout(pendingPickTimeoutRef.current);

    setSelectedPlan(plan);

    // Auto-confirm: brief visual feedback then hand the pick to the parent (tap → glow → select).
    // Deliberately does NOT call onClose() here — closing after a pick is the PARENT's job inside
    // onPlanSelect (MembershipModal.handlePackageSelect does setIsPackageSelectionOpen(false)).
    // That keeps `onClose` meaning DISMISSAL ONLY (✕ / backdrop / Escape), so consumers can react
    // to "user backed out without choosing". The old select-then-onClose pair fired in the same
    // tick, BEFORE React committed the new plan — a dismiss-handler reading the selected plan
    // still saw the placeholder and wrongly closed the whole membership modal right after a pick.
    pendingPickTimeoutRef.current = setTimeout(() => {
      pendingPickTimeoutRef.current = null;
      onPlanSelect(plan);
    }, 200);
  };

  /** Selection-first opens with a placeholder plan — nothing has actually been picked yet. */
  const hasRealSelection = !selectedPlan.id.startsWith("placeholder");

  const isSelectedPlan = (plan: LocalMembershipPlan) => {
    // Until the visitor picks, the RECOMMENDED tier (Foreman) carries the selected treatment, so
    // the picker opens on a suggestion rather than three equal-weight cards.
    if (!hasRealSelection) return activeTab === "membership" && isForemanSubscriptionPlanId(plan.id);
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
        return plan.isAdditional === true;
      });
    } else {
      // For users without access, show packages based on sub-tab selection
      if (oneTimeSubTab === "one-time") {
        // Show regular one-time packages (non-member exclusive)
        finalMembershipPlans = finalMembershipPlans.filter((plan) => {
          return plan.isAdditional !== true && plan.period === "one-time";
        });
      } else {
        // Show membership packages (subscription) to encourage subscription
        // Already fetching subscription packages from API, so no additional filter needed
        finalMembershipPlans = finalMembershipPlans;
      }
    }
  }

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      height="fixed"
      fixedHeight="max-h-[80dvh]"
      presentation={isNarrowViewport ? "sheet" : "dialog"}
    >
      <ModalHeader title="Select Your Package" onClose={onClose} showLogo={true} />

      <ModalContent padding="lg" className="">
        {/* Member Status Info */}

        {/* Toggle - Show when viewing one-time packages and user doesn't have access to additional packages */}
        {activeTab === "one-time" && !hasAdditionalPackageAccessFlag && (
          <TabSwitcher
            oneTimeSubTab={oneTimeSubTab}
            onSelectOneTime={() => {
              setOneTimeSubTab("one-time");
              setSelectedPlan(currentPlan); // Reset selection when switching tabs
            }}
            onSelectMembership={() => {
              setOneTimeSubTab("membership");
              setSelectedPlan(currentPlan); // Reset selection when switching tabs
            }}
            resolvedOneTimeMultiplier={resolvedOneTimeMultiplier}
            resolvedMembershipMultiplier={resolvedMembershipMultiplier}
          />
        )}

        {/* Packages Stacked Vertically */}
        <PlanGrid
          plans={finalMembershipPlans}
          isCurrentPlan={isCurrentPlan}
          isSelectedPlan={isSelectedPlan}
          onSelect={handlePlanSelect}
        />


      </ModalContent>
    </ModalContainer>
  );
};

export default PackageSelectionModal;
