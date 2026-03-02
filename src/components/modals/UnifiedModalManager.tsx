"use client";

import React, { useEffect, useMemo } from "react";
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
import { markExplainerSeen } from "@/utils/subscription-explainer-storage";
import { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";

// Import data
import { getMemberOnlyPackages } from "@/data/membershipPackages";

/**
 * Unified Modal Manager
 *
 * This component manages all modals with proper priority handling:
 * 1. Upsell (highest priority, triggered after purchase)
 * 2. User Setup (second priority, once per session)
 * 3. Special Packages (lower priority, once per session)
 * 4. Pixel Consent (lowest priority)
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

  // Modal store states
  // Modal states are now managed by the priority system
  const isSetupModalOpen = activeModal === "user-setup";
  const isUpsellActive = activeModal === "upsell";
  const isSpecialPackagesOpen = activeModal === "special-packages";
  const isGateClosedOpen = activeModal === "gate-closed";
  const isSubscriptionExplainerOpen = activeModal === "subscription-explainer";

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
  ) => {
    if (modalType === "subscription-explainer") {
      const data = activeModalData as { userId?: string } | null;
      if (data?.userId) markExplainerSeen(data.userId);
    } else {
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
        return (
          <SpecialPackagesModal
            isOpen={isSpecialPackagesOpen}
            onClose={() => handleModalClose("special-packages")}
            packages={specialPackages}
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

      default:
        return null;
    }
  };

  return <>{renderActiveModal()}</>;
};

export default UnifiedModalManager;
