import { useCallback, useMemo } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { useMemberships } from "@/hooks/useMemberships";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";

interface UseMajorDrawEntryCtaResult {
  membershipModal: ReturnType<typeof useMembershipModal>;
  hasActiveSubscription: boolean;
  oneTimePackages: ReturnType<typeof useMemberships>["oneTimePackages"];
  membershipPromoMultiplier: number;
  oneTimePromoMultiplier: number;
  getHeavyDutyPack: () => LocalMembershipPlan;
  openEntryFlow: (options?: { openLocalModal?: boolean }) => void;
}

/**
 * Shared hook that keeps the "Get More Entries" behaviour consistent across the app.
 * A new developer can call `openEntryFlow` and the hook handles every state change for them.
 *
 * Package Selection Logic:
 * - Non-members: Returns Tradie subscription package (15 entries/month, with promo support)
 * - Members: Returns additional-apprentice-pack one-time package (10 entries, $25, with promo support) - lowest member package
 */
export function useMajorDrawEntryCta(): UseMajorDrawEntryCtaResult {
  const { hasActiveSubscription, userData } = useUserContext();
  const membershipModal = useMembershipModal();
  const { requestModal, clearModalFromSession } = useModalPriorityStore();
  const { subscriptionPackages, oneTimePackages } = useMemberships();
  const safeOneTimePackages = useMemo(() => oneTimePackages ?? [], [oneTimePackages]);
  const safeSubscriptionPackages = useMemo(() => subscriptionPackages ?? [], [subscriptionPackages]);
  const { data: membershipPromo } = usePromoByType("membership-packages");
  const { data: oneTimePromo } = usePromoByType("one-time-packages");

  const membershipPromoMultiplier = membershipPromo?.multiplier ?? 1;
  const oneTimePromoMultiplier = oneTimePromo?.multiplier ?? 1;

  const getHeavyDutyPack = useCallback((): LocalMembershipPlan => {
    const isMember = userData?.subscription?.isActive ?? false;

    // For non-members: Use Tradie subscription package
    // For members: Use additional-apprentice-pack (one-time package) - lowest member package
    if (isMember) {
      const promoMultiplier = oneTimePromoMultiplier;
      // Member path: Use additional-apprentice-pack one-time package (lowest price/entry option)
      const targetPackageId = "additional-apprentice-pack";

      if (safeOneTimePackages.length === 0) {
        // Fallback if packages aren't loaded yet
        const baseEntries = 10; // Additional Apprentice Pack has 10 entries
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Additional Apprentice Pack",
          price: 25,
          period: "one-time",
          features: [
            { text: `${promoEntries} Free Entries${promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""}` },
            { text: "1 Days Access to Partner Discounts" },
            { text: "100% of Partner Discounts Available" },
          ],
          buttonText: "Get Started",
          buttonStyle: "secondary",
          isMemberOnly: true,
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
        const baseEntries = 10; // Additional Apprentice Pack has 10 entries
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Additional Apprentice Pack",
          price: 25,
          period: "one-time",
          features: [
            { text: `${promoEntries} Free Entries${promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""}` },
            { text: "1 Days Access to Partner Discounts" },
            { text: "100% of Partner Discounts Available" },
          ],
          buttonText: "Get Started",
          buttonStyle: "secondary",
          isMemberOnly: true,
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
            { text: "100% Access to Partner Discounts" },
            { text: "Mini Draws" },
          ],
          buttonText: "Get Started",
          buttonStyle: "secondary",
          isMemberOnly: false,
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
            { text: "100% Access to Partner Discounts" },
            { text: "Mini Draws" },
          ],
          buttonText: "Get Started",
          buttonStyle: "secondary",
          isMemberOnly: false,
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
  }, [safeOneTimePackages, safeSubscriptionPackages, membershipPromoMultiplier, oneTimePromoMultiplier, userData]);

  const openEntryFlow = useCallback(
    ({ openLocalModal = true }: { openLocalModal?: boolean } = {}) => {
      if (hasActiveSubscription) {
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
    },
    [clearModalFromSession, getHeavyDutyPack, hasActiveSubscription, membershipModal, requestModal]
  );

  return useMemo(
    () => ({
      membershipModal,
      hasActiveSubscription,
      oneTimePackages: safeOneTimePackages,
      membershipPromoMultiplier,
      oneTimePromoMultiplier,
      getHeavyDutyPack,
      openEntryFlow,
    }),
    [
      membershipModal,
      hasActiveSubscription,
      safeOneTimePackages,
      membershipPromoMultiplier,
      oneTimePromoMultiplier,
      getHeavyDutyPack,
      openEntryFlow,
    ]
  );
}
