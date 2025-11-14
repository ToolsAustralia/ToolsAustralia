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
 */
export function useMajorDrawEntryCta(): UseMajorDrawEntryCtaResult {
  const { hasActiveSubscription, userData } = useUserContext();
  const membershipModal = useMembershipModal();
  const { requestModal, clearModalFromSession } = useModalPriorityStore();
  const { oneTimePackages } = useMemberships();
  const safePackages = useMemo(() => oneTimePackages ?? [], [oneTimePackages]);
  const { data: oneTimePromo } = usePromoByType("one-time-packages");

  const promoMultiplier = oneTimePromo?.multiplier ?? 1;

  const getHeavyDutyPack = useCallback((): LocalMembershipPlan => {
    const isMember = userData?.subscription?.isActive ?? false;
    const targetPackageId = isMember ? "additional-foreman-pack" : "foreman-pack";

    if (safePackages.length === 0) {
      const baseEntries = isMember ? 100 : 30;
      const promoEntries = baseEntries * promoMultiplier;

      return {
        id: targetPackageId,
        name: "Foreman Pack",
        price: 100,
        period: "one-time",
        features: [
          { text: `${promoEntries} Free Entries${promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""}` },
          { text: "4 Days Access to Partner Discounts" },
          { text: "100% of Partner Discounts Available" },
        ],
        buttonText: "Go Foreman",
        buttonStyle: "secondary",
        isMemberOnly: isMember,
        metadata: {
          entriesCount: promoEntries,
          promoMultiplier,
          originalEntries: baseEntries,
          isPromoActive: promoMultiplier > 1,
        },
      };
    }

    const packageData = safePackages.find((pkg) => pkg.id === targetPackageId);

    if (!packageData) {
      const baseEntries = isMember ? 100 : 30;
      const promoEntries = baseEntries * promoMultiplier;

      return {
        id: targetPackageId,
        name: "Foreman Pack",
        price: 100,
        period: "one-time",
        features: [
          { text: `${promoEntries} Free Entries${promoMultiplier > 1 ? ` (${promoMultiplier}X PROMO!)` : ""}` },
          { text: "4 Days Access to Partner Discounts" },
          { text: "100% of Partner Discounts Available" },
        ],
        buttonText: "Go Foreman",
        buttonStyle: "secondary",
        isMemberOnly: isMember,
        metadata: {
          entriesCount: promoEntries,
          promoMultiplier,
          originalEntries: baseEntries,
          isPromoActive: promoMultiplier > 1,
        },
      };
    }

    const localPlan = convertToLocalPlan(packageData);

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
  }, [safePackages, promoMultiplier, userData]);

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
      oneTimePackages: safePackages,
      oneTimePromoMultiplier: promoMultiplier,
      getHeavyDutyPack,
      openEntryFlow,
    }),
    [membershipModal, hasActiveSubscription, safePackages, promoMultiplier, getHeavyDutyPack, openEntryFlow]
  );
}
