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
  oneTimePromoMultiplier: number;
  getHeavyDutyPack: () => LocalMembershipPlan;
  openEntryFlow: (options?: { openLocalModal?: boolean }) => void;
}

/**
 * Shared hook that keeps the "Get More Entries" behaviour consistent across the app.
 * A new developer can call `openEntryFlow` and the hook handles every state change for them.
 *
 * Package Selection Logic:
 * - Non-members: Returns Foreman subscription package (40 entries/month, with promo support)
 * - Members: Returns additional-foreman-pack one-time package (100 entries, with promo support)
 */
export function useMajorDrawEntryCta(): UseMajorDrawEntryCtaResult {
  const { hasActiveSubscription, userData } = useUserContext();
  const membershipModal = useMembershipModal();
  const { requestModal, clearModalFromSession } = useModalPriorityStore();
  const { subscriptionPackages, oneTimePackages } = useMemberships();
  const safeOneTimePackages = useMemo(() => oneTimePackages ?? [], [oneTimePackages]);
  const safeSubscriptionPackages = useMemo(() => subscriptionPackages ?? [], [subscriptionPackages]);
  const { data: oneTimePromo } = usePromoByType("one-time-packages");

  // Promo multiplier applies to both subscription and one-time packages
  const promoMultiplier = oneTimePromo?.multiplier ?? 1;

  const getHeavyDutyPack = useCallback((): LocalMembershipPlan => {
    const isMember = userData?.subscription?.isActive ?? false;

    // For non-members: Use Foreman subscription package
    // For members: Use additional-foreman-pack (one-time package)
    if (isMember) {
      // Member path: Use additional-foreman-pack one-time package
      const targetPackageId = "additional-foreman-pack";

      if (safeOneTimePackages.length === 0) {
        // Fallback if packages aren't loaded yet
        const baseEntries = 100;
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Additional Foreman Pack",
          price: 100,
          period: "one-time",
          features: [
            { text: `${promoEntries} Free Entries${promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""}` },
            { text: "4 Days Access to Partner Discounts" },
            { text: "100% of Partner Discounts Available" },
          ],
          buttonText: "Go Foreman",
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
        const baseEntries = 100;
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Additional Foreman Pack",
          price: 100,
          period: "one-time",
          features: [
            { text: `${promoEntries} Free Entries${promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""}` },
            { text: "4 Days Access to Partner Discounts" },
            { text: "100% of Partner Discounts Available" },
          ],
          buttonText: "Go Foreman",
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
      // Non-member path: Use Foreman subscription package
      const targetPackageId = "foreman-subscription";

      if (safeSubscriptionPackages.length === 0) {
        // Fallback if packages aren't loaded yet
        const baseEntries = 40; // Foreman subscription has 40 entries per month
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Foreman",
          price: 40,
          period: "mo",
          features: [
            {
              text: `${promoEntries} Free Accumulated Entries${
                promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""
              }`,
            },
            // { text: "10% Off Shop purchases" }, // Temporarily disabled - Shop coming soon
            { text: "100% Access to Partner Discounts" },
            { text: "Mini Draws" },
          ],
          buttonText: "Go Foreman",
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
        const baseEntries = 40;
        const promoEntries = baseEntries * promoMultiplier;

        return {
          id: targetPackageId,
          name: "Foreman",
          price: 40,
          period: "mo",
          features: [
            {
              text: `${promoEntries} Free Accumulated Entries${
                promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""
              }`,
            },
            // { text: "10% Off Shop purchases" }, // Temporarily disabled - Shop coming soon
            { text: "100% Access to Partner Discounts" },
            { text: "Mini Draws" },
          ],
          buttonText: "Go Foreman",
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
  }, [safeOneTimePackages, safeSubscriptionPackages, promoMultiplier, userData]);

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
      oneTimePromoMultiplier: promoMultiplier,
      getHeavyDutyPack,
      openEntryFlow,
    }),
    [membershipModal, hasActiveSubscription, safeOneTimePackages, promoMultiplier, getHeavyDutyPack, openEntryFlow]
  );
}
