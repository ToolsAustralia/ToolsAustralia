import { useCallback, useMemo } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { useMemberships } from "@/hooks/useMemberships";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";
import {
  MEMBERSHIP_PACKAGES_QUERY_PARAM,
  parseMembershipPackagesTab,
} from "@/utils/membership/packagesTabParam";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";

interface UseMajorDrawEntryCtaResult {
  membershipModal: ReturnType<typeof useMembershipModal>;
  hasActiveSubscription: boolean;
  oneTimePackages: ReturnType<typeof useMemberships>["oneTimePackages"];
  membershipPromoMultiplier: number;
  oneTimePromoMultiplier: number;
  getHeavyDutyPack: () => LocalMembershipPlan;
  /** Promo-boosted Tradie SUBSCRIPTION from the catalog — the canonical "Become a member" preselect. */
  getTradieSubscriptionPlan: () => LocalMembershipPlan;
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

  /**
   * The promo-boosted TRADIE SUBSCRIPTION plan from the real catalog — the canonical
   * "Become a member" preselect (same object a Tradie tier-card tap uses), regardless of the
   * user's additional-pack access. Contrast getHeavyDutyPack, which is access-dependent and
   * returns a ONE-TIME pack for entry-holders — wrong for a membership CTA.
   */
  const getTradieSubscriptionPlan = useCallback((): LocalMembershipPlan => {
    const promoMultiplier = membershipPromoMultiplier;
    const targetPackageId = "tradie-subscription";

    const packageData = safeSubscriptionPackages.find((pkg) => pkg.id === targetPackageId);

    if (!packageData) {
      // Fallback if packages aren't loaded yet (or the id is missing from the catalog)
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
  }, [safeSubscriptionPackages, membershipPromoMultiplier]);

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
      // Non-member path: the Tradie subscription (shared builder; handles catalog fallbacks + promo).
      return getTradieSubscriptionPlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- oneTimePromoMultiplier required for isMember path plan recalculation
  }, [
    safeOneTimePackages,
    getTradieSubscriptionPlan,
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

        // A user who already holds a (blocking) subscription — active / past_due / etc. — CANNOT create a
        // second subscription, so pre-select a ONE-TIME pack (getOneTimePlan), never a membership sub
        // (getHeavyDutyPack) which would fail with EXISTING_SUBSCRIPTION. This takes precedence.
        // Otherwise: ad landings with `?packages=one-time` also open the ONE-TIME flow (guests — members
        // with additional access already diverted above), falling back to the subscription default if no
        // one-time plan is resolvable yet; and plain non-subscribers get the Tradie sub as the default.
        const forcedOneTime =
          typeof window !== "undefined" &&
          parseMembershipPackagesTab(
            new URLSearchParams(window.location.search).get(MEMBERSHIP_PACKAGES_QUERY_PARAM)
          ) === "one-time";
        const correctPlan = hasBlockingSubscription(userData)
          ? getOneTimePlan()
          : forcedOneTime
            ? getOneTimePlan() ?? getHeavyDutyPack()
            : getHeavyDutyPack();

        if (openLocalModal) {
          if (correctPlan) {
            membershipModal.setSelectedPlan(correctPlan);
            membershipModal.openModal();
          } else {
            // No concrete one-time plan resolved yet → let the user pick a pack.
            membershipModal.openModalWithPackageSelectionFirst();
          }
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
      getOneTimePlan,
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
      getTradieSubscriptionPlan,
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
      getTradieSubscriptionPlan,
      getOneTimePlan,
      openEntryFlow,
      openWithOneTimePlan,
    ]
  );
}
