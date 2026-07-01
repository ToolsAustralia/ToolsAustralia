import { useCallback, useMemo } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { useMemberships } from "@/hooks/useMemberships";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";

interface UseMajorDrawEntryCtaResult {
  membershipModal: ReturnType<typeof useMembershipModal>;
  hasActiveSubscription: boolean;
  oneTimePackages: ReturnType<typeof useMemberships>["oneTimePackages"];
  membershipPromoMultiplier: number;
  oneTimePromoMultiplier: number;
  getHeavyDutyPack: () => LocalMembershipPlan;
  getOneTimePlan: () => LocalMembershipPlan | null;
  openEntryFlow: (options?: { openLocalModal?: boolean }) => void;
  openWithOneTimePlan: () => void;
}

/**
 * Shared hook that keeps the "Get More Entries" behaviour consistent across the app.
 * A new developer can call `openEntryFlow` and the hook handles every state change for them.
 *
 * Package Selection Logic:
 * - Non-members: Returns Tradie subscription package (15 entries/month, with promo support)
 * - Members: Returns additional-tradie-pack one-time package (lowest active additional tier; with promo support)
 */
export function useMajorDrawEntryCta(): UseMajorDrawEntryCtaResult {
  const { hasActiveSubscription, userData } = useUserContext();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  const membershipModal = useMembershipModal();
  const { requestModal, clearModalFromSession } = useModalPriorityStore();
  const { subscriptionPackages, oneTimePackages } = useMemberships();
  const safeOneTimePackages = useMemo(() => oneTimePackages ?? [], [oneTimePackages]);
  const safeSubscriptionPackages = useMemo(() => subscriptionPackages ?? [], [subscriptionPackages]);
  // Use resolved multiplier (scheduled > toggle > alternating) so preselected package shows correct entries when "Enter Now" is clicked
  const resolvedMembership = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTime = useResolvedMultiplier("one-time-packages", "display");

  const membershipPromoMultiplier = resolvedMembership ?? 1;
  const oneTimePromoMultiplier = resolvedOneTime ?? 1;

  const getHeavyDutyPack = useCallback((): LocalMembershipPlan => {
    // Check if user has access to additional packages (subscription OR current draw entries)
    const hasAccess = hasAdditionalPackageAccess(userData, userMajorDrawStats);

    // For users without access: Use Tradie subscription package
    // For users with access: Use additional-tradie-pack (lowest active additional one-time)
    // Membership multiplier only for active members; one-time multiplier for non-members with entries
    if (hasAccess) {
      const targetPackageId = "additional-tradie-pack";
      const promoMultiplier =
        getEffectivePromoType(targetPackageId, "one-time", hasActiveSubscription) === "membership-packages"
          ? membershipPromoMultiplier
          : oneTimePromoMultiplier;

      if (safeOneTimePackages.length === 0) {
        // Fallback if packages aren't loaded yet
        const baseEntries = 15;
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Additional Tradie Pack",
          price: 25,
          period: "one-time",
          features: [
            { text: "40% of Partner Discounts Available" },
            { text: "2 Days Access to Partner Discounts" },
            { text: `${promoEntries} Free Entries${promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""}` },
          ],
          buttonText: "Get Started",
          buttonStyle: "secondary",
          isAdditional: true,
          metadata: {
            entriesCount: promoEntries,
            promoMultiplier,
            originalEntries: baseEntries,
            isPromoActive: promoMultiplier > 1,
          },
        };
      }

      const packageData = safeOneTimePackages.find((pkg) => pkg.id === targetPackageId);

      if (!packageData) {
        // Fallback if package not found
        const baseEntries = 15;
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Additional Tradie Pack",
          price: 25,
          period: "one-time",
          features: [
            { text: "40% of Partner Discounts Available" },
            { text: "2 Days Access to Partner Discounts" },
            { text: `${promoEntries} Free Entries${promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""}` },
          ],
          buttonText: "Get Started",
          buttonStyle: "secondary",
          isAdditional: true,
          metadata: {
            entriesCount: promoEntries,
            promoMultiplier,
            originalEntries: baseEntries,
            isPromoActive: promoMultiplier > 1,
          },
        };
      }

      const localPlan = convertToLocalPlan(packageData);

      // Apply promo multiplier if active
      if (promoMultiplier <= 1) {
        return localPlan;
      }

      const originalEntries = localPlan.metadata?.entriesCount ?? 0;
      const promoEntries = originalEntries * promoMultiplier;

      return {
        ...localPlan,
        features: localPlan.features.map((feature) => {
          if (feature.text.toLowerCase().includes("entries")) {
            return {
              ...feature,
              text: feature.text.replace(/\d+/, promoEntries.toString()),
            };
          }
          return feature;
        }),
        metadata: {
          ...localPlan.metadata,
          entriesCount: promoEntries,
          originalEntries,
          promoMultiplier,
          isPromoActive: true,
        },
      };
    } else {
      const promoMultiplier = membershipPromoMultiplier;
      // Non-member path: Use Tradie subscription package
      const targetPackageId = "tradie-subscription";

      if (safeSubscriptionPackages.length === 0) {
        // Fallback if packages aren't loaded yet
        const baseEntries = 15; // Tradie subscription has 15 entries per month
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Tradie",
          price: 20,
          period: "mo",
          features: [
            {
              text: `${promoEntries} Free Accumulated Entries${
                promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""
              }`,
            },
            // { text: "5% Off Shop purchases" }, // Temporarily disabled - Shop coming soon
            { text: "50% Access to Partner Discounts" },
            { text: "Mini Draws" },
          ],
          buttonText: "Get Started",
          buttonStyle: "secondary",
          isAdditional: false,
          metadata: {
            entriesCount: promoEntries,
            promoMultiplier,
            originalEntries: baseEntries,
            isPromoActive: promoMultiplier > 1,
          },
        };
      }

      const packageData = safeSubscriptionPackages.find((pkg) => pkg.id === targetPackageId);

      if (!packageData) {
        // Fallback if package not found
        const baseEntries = 15; // Tradie subscription has 15 entries per month
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Tradie",
          price: 20,
          period: "mo",
          features: [
            {
              text: `${promoEntries} Free Accumulated Entries${
                promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""
              }`,
            },
            // { text: "5% Off Shop purchases" }, // Temporarily disabled - Shop coming soon
            { text: "50% Access to Partner Discounts" },
            { text: "Mini Draws" },
          ],
          buttonText: "Get Started",
          buttonStyle: "secondary",
          isAdditional: false,
          metadata: {
            entriesCount: promoEntries,
            promoMultiplier,
            originalEntries: baseEntries,
            isPromoActive: promoMultiplier > 1,
          },
        };
      }

      const localPlan = convertToLocalPlan(packageData);

      // Apply promo multiplier if active
      if (promoMultiplier <= 1) {
        return localPlan;
      }

      const originalEntries = localPlan.metadata?.entriesCount ?? 0;
      const promoEntries = originalEntries * promoMultiplier;

      return {
        ...localPlan,
        features: localPlan.features.map((feature) => {
          if (feature.text.toLowerCase().includes("entries")) {
            return {
              ...feature,
              text: feature.text.replace(/\d+/, promoEntries.toString()),
            };
          }
          return feature;
        }),
        metadata: {
          ...localPlan.metadata,
          entriesCount: promoEntries,
          originalEntries,
          promoMultiplier,
          isPromoActive: true,
        },
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- oneTimePromoMultiplier required for isMember path plan recalculation
  }, [
    safeOneTimePackages,
    safeSubscriptionPackages,
    membershipPromoMultiplier,
    oneTimePromoMultiplier,
    userData,
    userMajorDrawStats,
  ]);

  const getOneTimePlan = useCallback((): LocalMembershipPlan | null => {
    const hasAccess = hasAdditionalPackageAccess(userData, userMajorDrawStats);
    if (hasAccess) {
      return getHeavyDutyPack();
    }
    const promoMultiplier = oneTimePromoMultiplier;
    const nonMemberOneTime = safeOneTimePackages.find(
      (pkg) => (pkg.period === "one-time" || pkg.period === "once") && !pkg.isAdditional
    );
    if (!nonMemberOneTime) return null;
    const localPlan = convertToLocalPlan(nonMemberOneTime);
    if (promoMultiplier <= 1) return localPlan;
    const originalEntries = localPlan.metadata?.entriesCount ?? 0;
    const promoEntries = originalEntries * promoMultiplier;
    return {
      ...localPlan,
      features: localPlan.features.map((feature) => {
        if (feature.text.toLowerCase().includes("entries")) {
          return { ...feature, text: feature.text.replace(/\d+/, promoEntries.toString()) };
        }
        return feature;
      }),
      metadata: {
        ...localPlan.metadata,
        entriesCount: promoEntries,
        originalEntries,
        promoMultiplier,
        isPromoActive: true,
      },
    };
  }, [
    userData,
    userMajorDrawStats,
    getHeavyDutyPack,
    safeOneTimePackages,
    oneTimePromoMultiplier,
  ]);

  const openWithOneTimePlan = useCallback(() => {
    whenGatesOpenElseGateModal(() => {
      const oneTimePlan = getOneTimePlan();
      if (oneTimePlan) {
        membershipModal.setSelectedPlan(oneTimePlan);
        membershipModal.openModal();
      } else {
        membershipModal.openModalWithPackageSelectionFirst();
      }
    });
  }, [getOneTimePlan, membershipModal, whenGatesOpenElseGateModal]);

  const openEntryFlow = useCallback(
    ({ openLocalModal = true }: { openLocalModal?: boolean } = {}) => {
      whenGatesOpenElseGateModal(() => {
        const hasAccess = hasAdditionalPackageAccess(userData, userMajorDrawStats);
        if (hasAccess) {
          clearModalFromSession("special-packages");
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("specialPackagesModalShown");
          }
          requestModal("special-packages", true);
          return;
        }

        const correctPlan = getHeavyDutyPack();

        if (openLocalModal) {
          membershipModal.setSelectedPlan(correctPlan);
          membershipModal.openModal();
          return;
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("openMembershipModal", {
              detail: { plan: correctPlan },
            })
          );
        }
      });
    },
    [
      whenGatesOpenElseGateModal,
      clearModalFromSession,
      getHeavyDutyPack,
      userData,
      userMajorDrawStats,
      membershipModal,
      requestModal,
    ]
  );

  return useMemo(
    () => ({
      membershipModal,
      hasActiveSubscription,
      oneTimePackages: safeOneTimePackages,
      membershipPromoMultiplier,
      oneTimePromoMultiplier,
      getHeavyDutyPack,
      getOneTimePlan,
      openEntryFlow,
      openWithOneTimePlan,
    }),
    [
      membershipModal,
      hasActiveSubscription,
      safeOneTimePackages,
      membershipPromoMultiplier,
      oneTimePromoMultiplier,
      getHeavyDutyPack,
      getOneTimePlan,
      openEntryFlow,
      openWithOneTimePlan,
    ]
  );
}
