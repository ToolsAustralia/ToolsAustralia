"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
// Individual modal stores removed - using unified modal priority system
import { useUserContext } from "@/contexts/UserContext";

// Import modal components
import UserSetupModal from "./UserSetupModal";
import UpsellModal from "./UpsellModal";
import SpecialPackagesModal from "./SpecialPackagesModal";
import PixelConsentModal from "./PixelConsentModal";
import GateClosedModal from "./GateClosedModal";
import SubscriptionExplainerModal from "./SubscriptionExplainerModal";
import RenewalFailedModal from "./RenewalFailedModal";
import { markExplainerSeen } from "@/utils/subscription-explainer-storage";
import { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import type { IUser } from "@/models/User";

// Import data
import { getMemberOnlyPackages } from "@/data/membershipPackages";
import { useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";

/**
 * Unified Modal Manager
 *
 * This component manages all modals with proper priority handling:
 * 1. Upsell (highest priority, triggered after purchase)
 * 2. Failed renewal (high priority, dashboard routes)
 * 3. User Setup (second priority, once per session)
 * 4. Special Packages / subscription explainer (lower)
 * 5. Pixel Consent (lowest priority)
 *
 * Features:
 * - Prevents modal conflicts
 * - Session-based tracking for one-time modals
 * - Proper modal queuing and priority handling
 * - Automatic modal progression
 */
const UnifiedModalManager: React.FC = () => {
  const { activeModal, activeModalData, closeModal, markModalShown, requestModal } = useModalPriorityStore();
  const { isAuthenticated, userData, loading } = useUserContext();
  const pathname = usePathname();
  const renewalFailedRequestedRef = useRef(false);
  const { data: currentMajorDraw } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();
  const interceptedSpecialPackagesRef = useRef(false);

  // Modal store states
  // Modal states are now managed by the priority system
  const isSetupModalOpen = activeModal === "user-setup";
  const isUpsellActive = activeModal === "upsell";
  const isSpecialPackagesOpen = activeModal === "special-packages";
  const isGateClosedOpen = activeModal === "gate-closed";
  const isSubscriptionExplainerOpen = activeModal === "subscription-explainer";
  const isRenewalFailedOpen = activeModal === "renewal-failed";

  // Get exclusive member-only packages for SpecialPackagesModal
  const specialPackages = useMemo(() => {
    return getMemberOnlyPackages().filter((pkg) => pkg.type === "one-time");
  }, []);

  /**
   * Initialize modal session on component mount
   */
  useEffect(() => {
    import("@/stores/useModalPriorityStore").then(({ initializeModalSession }) => {
      initializeModalSession();
    });
  }, []);

  /**
   * Auto-open renewal failed modal when user is on dashboard routes with past_due subscription.
   * Renders via this manager's renewal-failed branch (store alone is not enough).
   */
  useEffect(() => {
    if (loading || !isAuthenticated || !userData) return;
    const path = pathname ?? "";
    if (!path.startsWith("/my-account")) return;

    if (!hasFailedRenewal(userData as unknown as IUser)) {
      renewalFailedRequestedRef.current = false;
      return;
    }
    if (renewalFailedRequestedRef.current) return;
    renewalFailedRequestedRef.current = true;
    requestModal("renewal-failed", true);
  }, [isAuthenticated, userData, loading, pathname, requestModal]);

  useEffect(() => {
    if (activeModal !== "special-packages") {
      if (activeModal !== "gate-closed") {
        interceptedSpecialPackagesRef.current = false;
      }
      return;
    }
    if (currentMajorDraw?.status === "active") {
      interceptedSpecialPackagesRef.current = false;
      return;
    }
    if (interceptedSpecialPackagesRef.current) return;
    interceptedSpecialPackagesRef.current = true;
    requestModal("gate-closed", true, {
      nextActivationDate: nextDraw?.activationDate ?? null,
      nextDrawName: nextDraw?.name,
    });
  }, [activeModal, currentMajorDraw?.status, nextDraw?.activationDate, nextDraw?.name, requestModal]);

  /**
   * Handle modal close with proper cleanup and queue progression
   */
  const handleModalClose = (
    modalType:
      | "user-setup"
      | "upsell"
      | "special-packages"
      | "pixel-consent"
      | "gate-closed"
      | "subscription-explainer"
      | "renewal-failed"
  ) => {
    if (modalType === "subscription-explainer") {
      const data = activeModalData as { userId?: string } | null;
      if (data?.userId) markExplainerSeen(data.userId);
    } else if (modalType !== "renewal-failed") {
      markModalShown(modalType);
    }
    closeModal();
  };

  /**
   * Auto-trigger modals based on user state
   * Note: User setup modal is now only triggered on my-account page
   */
  useEffect(() => {
    if (loading || !isAuthenticated || !userData) return;

    // Removed automatic user setup modal trigger
    // User setup modal now only appears on my-account page
    // This prevents the modal from appearing on other pages
  }, [isAuthenticated, userData, loading, requestModal]);

  // Modal states are now directly managed by the priority system
  // No need to sync with individual stores

  /**
   * Render the active modal based on priority
   */
  const renderActiveModal = () => {
    if (!activeModal) return null;

    switch (activeModal) {
      case "user-setup":
        return (
          <UserSetupModal
            isOpen={isSetupModalOpen}
            onClose={() => handleModalClose("user-setup")}
            onComplete={() => handleModalClose("user-setup")}
            initialStep={typeof activeModalData?.initialStep === "number" ? activeModalData.initialStep : 1}
          />
        );

      case "upsell":
        const upsellData = activeModalData as {
          offer: UpsellOffer;
          userContext: UpsellUserContext;
          originalPurchaseContext?: OriginalPurchaseContext;
        } | null;
        if (!upsellData?.offer || !upsellData?.userContext) {
          console.error("Upsell modal missing required data");
          return null;
        }
        return (
          <UpsellModal
            isOpen={isUpsellActive}
            onClose={() => handleModalClose("upsell")}
            offer={upsellData.offer}
            userContext={upsellData.userContext}
            originalPurchaseContext={upsellData.originalPurchaseContext}
            onAccept={() => {
              // Handle upsell acceptance
              handleModalClose("upsell");
            }}
            onDecline={() => {
              // Handle upsell decline
              handleModalClose("upsell");
            }}
          />
        );

      case "special-packages":
        const specialPackagesData = activeModalData as { initialCouponCode?: string } | null;
        return (
          <SpecialPackagesModal
            isOpen={isSpecialPackagesOpen}
            onClose={() => handleModalClose("special-packages")}
            packages={specialPackages}
            initialCouponCode={specialPackagesData?.initialCouponCode}
            onPackageSelect={(_pkg) => {
              // Handle package selection - this would typically trigger purchase flow
              // console.log("Special package selected:", pkg);
            }}
          />
        );

      case "pixel-consent":
        return (
          <PixelConsentModal
            isOpen={false} // This would be controlled by pixel consent logic
            onCloseAction={() => handleModalClose("pixel-consent")}
            onAccept={() => {
              // Handle pixel consent acceptance
              handleModalClose("pixel-consent");
            }}
            onDecline={() => {
              // Handle pixel consent decline
              handleModalClose("pixel-consent");
            }}
          />
        );

      case "gate-closed":
        const gateClosedData = activeModalData as {
          nextActivationDate: string | null;
          nextDrawName?: string;
        } | null;
        return (
          <GateClosedModal
            isOpen={isGateClosedOpen}
            onClose={() => handleModalClose("gate-closed")}
            nextActivationDate={gateClosedData?.nextActivationDate ?? null}
            nextDrawName={gateClosedData?.nextDrawName}
          />
        );

      case "subscription-explainer":
        const explainerData = activeModalData as {
          entriesPerMonth: number;
          packageName?: string;
          userId?: string;
          lastMonthAccumulatedEntries?: number;
          selectedPackageId?: string;
        } | null;
        if (!explainerData || typeof explainerData.entriesPerMonth !== "number") return null;
        return (
          <SubscriptionExplainerModal
            isOpen={isSubscriptionExplainerOpen}
            onClose={() => handleModalClose("subscription-explainer")}
            entriesPerMonth={explainerData.entriesPerMonth}
            packageName={explainerData.packageName}
            lastMonthAccumulatedEntries={explainerData.lastMonthAccumulatedEntries ?? 0}
            selectedPackageId={explainerData.selectedPackageId}
          />
        );

      case "renewal-failed":
        return (
          <RenewalFailedModal
            isOpen={isRenewalFailedOpen}
            onClose={() => handleModalClose("renewal-failed")}
          />
        );

      default:
        return null;
    }
  };

  return <>{renderActiveModal()}</>;
};

export default UnifiedModalManager;
