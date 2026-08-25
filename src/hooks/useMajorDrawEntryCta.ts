import { useCallback, useMemo } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { useMemberships } from "@/hooks/useMemberships";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { isForemanSubscriptionPlanId } from "@/utils/membership/additional-package-mapping";
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
  /** Promo-boosted RECOMMENDED subscription (Foreman) from the catalog — the canonical "Become a member" preselect. */
  getRecommendedSubscriptionPlan: () => LocalMembershipPlan;
  getOneTimePlan: () => LocalMembershipPlan | null;
  openEntryFlow: (options?: { openLocalModal?: boolean; packageSelectionFirst?: boolean }) => void;
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
   * The promo-boosted RECOMMENDED SUBSCRIPTION plan from the real catalog — the canonical
   * "Become a member" preselect (same object a Foreman tier-card tap uses), regardless of the
   * user's additional-pack access. Contrast getHeavyDutyPack, which is access-dependent and
   * returns a ONE-TIME pack for entry-holders — wrong for a membership CTA.
   *
   * The recommended tier is FOREMAN — the same tier the package picker and the selected-package
   * card flag as RECOMMENDED, so every "we picked one for you" surface agrees.
   */
  const getRecommendedSubscriptionPlan = useCallback((): LocalMembershipPlan => {
    const promoMultiplier = membershipPromoMultiplier;
    const targetPackageId = "foreman-subscription";

    // `useMemberships` slugifies the package NAME into `plan.id` ("Foreman" → `foreman`), so the
    // catalog `_id` is not what shows up here — match on either form.
    const packageData = safeSubscriptionPackages.find((pkg) => isForemanSubscriptionPlanId(pkg.id));

    if (!packageData) {
      // Fallback if packages aren't loaded yet (or the id is missing from the catalog)
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
          { text: "15% Off Shop purchases" },
          { text: "75% Access to Partner Discounts" },
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
      // Non-member path: the recommended subscription (shared builder; handles catalog fallbacks + promo).
      return getRecommendedSubscriptionPlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- oneTimePromoMultiplier required for isMember path plan recalculation
  }, [
    safeOneTimePackages,
    getRecommendedSubscriptionPlan,
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
      // Picker first here too — the visitor chooses — with the resolved one-time pack behind it, so
      // the picker opens on the ONE-TIME tab (PackageSelectionModal derives the tab from the plan's
      // period) and dismissing lands on a real pack. Falls back to the recommended subscription only
      // when no one-time pack resolves, which still beats an empty payment step.
      membershipModal.openModalWithPackageSelectionFirst(
        getOneTimePlan() ?? getRecommendedSubscriptionPlan()
      );
    });
  }, [getOneTimePlan, getRecommendedSubscriptionPlan, membershipModal, whenGatesOpenElseGateModal]);

  const openEntryFlow = useCallback(
    ({
      openLocalModal = true,
      packageSelectionFirst = true,
    }: { openLocalModal?: boolean; packageSelectionFirst?: boolean } = {}) => {
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
        // Otherwise: a `?packages=one-time` URL also opens the ONE-TIME flow (guests — members with
        // additional access already diverted above), falling back to the subscription default if no
        // one-time plan is resolvable yet; and plain non-subscribers get the Tradie sub as the default.
        // That param comes from an ad landing OR from the visitor toggling the section's own tab
        // (MembershipSection.selectTab writes it), so this CTA pre-selects the pack matching whatever
        // tab they are actually looking at.
        const forcedOneTime =
          typeof window !== "undefined" &&
          parseMembershipPackagesTab(
            new URLSearchParams(window.location.search).get(MEMBERSHIP_PACKAGES_QUERY_PARAM)
          ) === "one-time";
        // DEFAULT BEHAVIOUR for every entry CTA: the "Select Your Package" picker is the first
        // view, with the RECOMMENDED tier (Foreman) already selected behind it. The user chooses,
        // and backing out of the picker still leaves them on a real, payable package — never the
        // empty payment step. Opting out (`packageSelectionFirst: false`) is for callers that must
        // land straight on a specific plan.
        //
        // `?packages=one-time` no longer SKIPS the picker (2026-08-04). It used to, on the
        // reasoning that a membership tier is the wrong pre-select for a one-time visitor —
        // true, but the fix is to pre-select a one-time PACK and let the picker open on that
        // tab, not to send those visitors down a different number of steps. The picker
        // derives its tab from the plan it is handed (`currentPlan.period`), so passing the
        // one-time plan lands them exactly where they were looking, with the same flow
        // everyone else gets.
        //
        // Still skipped for a blocking subscription: that visitor cannot create a second
        // subscription at all, so the picker's membership tab would offer them nothing
        // payable.
        if (packageSelectionFirst && !hasBlockingSubscription(userData)) {
          // Fall back to the subscription default when no one-time plan has resolved yet,
          // so a slow package fetch never opens the picker with nothing selected.
          const preselectedPlan = forcedOneTime
            ? getOneTimePlan() ?? getRecommendedSubscriptionPlan()
            : getRecommendedSubscriptionPlan();
          if (openLocalModal) {
            membershipModal.openModalWithPackageSelectionFirst(preselectedPlan);
          } else if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("openMembershipModal", {
                detail: { plan: preselectedPlan, packageSelectionFirst: true },
              })
            );
          }
          return;
        }

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
            // No concrete one-time plan resolved yet → let the user pick, with the recommended
            // subscription behind the picker so there is never an empty payment step.
            membershipModal.openModalWithPackageSelectionFirst(getRecommendedSubscriptionPlan());
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
      // Required: without it the callback keeps the first-render getter, and the default tier it
      // pre-selects would carry stale entry counts (catalog / promo multiplier resolve later).
      getRecommendedSubscriptionPlan,
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
      getRecommendedSubscriptionPlan,
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
      getRecommendedSubscriptionPlan,
      getOneTimePlan,
      openEntryFlow,
      openWithOneTimePlan,
    ]
  );
}
