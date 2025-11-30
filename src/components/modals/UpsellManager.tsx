"use client";

import React, { useState, useEffect, useCallback } from "react";
import UpsellModal from "./UpsellModal";
import FloatingGiftIcon from "../ui/FloatingGiftIcon";
import { UpsellManagerProps, UpsellOffer, SAMPLE_UPSELL_OFFERS } from "@/types/upsell";

/**
 * UpsellManager Component
 * Manages the logic for showing relevant upsell offers to users
 * Handles timing, user segmentation, and offer selection
 */
const UpsellManager: React.FC<UpsellManagerProps> = ({
  triggerEvent,
  userContext,
  originalPurchaseContext,
  onOfferShown,
  onOfferAccepted,
  onOfferDeclined,
}) => {
  const [currentOffer, setCurrentOffer] = useState<UpsellOffer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasShownOffer, setHasShownOffer] = useState(false);
  const [showFloatingGift, setShowFloatingGift] = useState(false);
  const [declinedOffer, setDeclinedOffer] = useState<UpsellOffer | null>(null);
  const [invoiceFinalized, setInvoiceFinalized] = useState(false);
  const [finalizationTimeoutId, setFinalizationTimeoutId] = useState<NodeJS.Timeout | null>(null);

  /**
   * Select the most relevant offer for the user based on context
   */
  const selectRelevantOffer = useCallback((): UpsellOffer | null => {
    // Filter offers based on trigger event and user segments
    const relevantOffers = SAMPLE_UPSELL_OFFERS.filter((offer) => {
      // Check if offer targets this trigger event
      if (!offer.targetAudience.includes(triggerEvent)) return false;

      // Check if offer targets this user segment
      if (!offer.userSegments.includes("all") && !offer.userSegments.includes(userContext.userType)) return false;

      // Check if offer is still active and valid
      if (!offer.isActive || (offer.validUntil && new Date() > new Date(offer.validUntil))) return false;

      // Check if user hasn't exceeded max shows
      if (userContext.upsellsShown >= offer.maxShowsPerUser) return false;

      // Check cooldown period
      if (userContext.lastUpsellShown) {
        const hoursSinceLastShow = (new Date().getTime() - userContext.lastUpsellShown.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastShow < offer.cooldownHours) return false;
      }

      return true;
    });

    if (relevantOffers.length === 0) return null;

    // Sort by priority (higher priority first) and return the best offer
    return relevantOffers.sort((a, b) => b.priority - a.priority)[0];
  }, [triggerEvent, userContext]);

  /**
   * Track upsell analytics
   */
  const trackUpsellEvent = useCallback(
    (action: "shown" | "accepted" | "declined" | "dismissed", offer: UpsellOffer) => {
      // Send analytics data to your tracking service
      const analyticsData = {
        offerId: offer.id,
        action,
        triggerEvent,
        userType: userContext.userType,
        timestamp: new Date().toISOString(),
        userContext: {
          isAuthenticated: userContext.isAuthenticated,
          hasDefaultPayment: userContext.hasDefaultPayment,
          recentPurchase: userContext.recentPurchase,
          totalSpent: userContext.totalSpent,
        },
      };

      // You can integrate with your analytics service here
      console.log("Upsell Analytics:", analyticsData);

      // Send to API for tracking
      fetch("/api/upsell/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analyticsData),
      }).catch((error) => {
        console.error("Failed to track upsell event:", error);
      });
    },
    [triggerEvent, userContext]
  );

  // Fallback function to redirect to full payment flow
  const redirectToFullPaymentFlow = useCallback((offer: UpsellOffer) => {
    console.log("🔄 Redirecting to full payment flow for upsell:", offer.title);

    // Dispatch custom event to open MembershipModal with upsell data
    const event = new CustomEvent("showUpsellPayment", {
      detail: {
        offerId: offer.id,
        offerTitle: offer.title,
        entriesCount: offer.entriesCount,
        originalPrice: offer.originalPrice,
        discountPrice: offer.discountedPrice,
        discountPercentage: offer.discountPercentage,
      },
    });

    window.dispatchEvent(event);

    // Close upsell modal after a brief delay to allow MembershipModal to open
    setTimeout(() => {
      setIsModalOpen(false);
      setCurrentOffer(null);
    }, 100);
  }, []);

  /**
   * Finalize invoice and send to Klaviyo
   */
  const finalizeInvoice = useCallback(
    async (upsellData?: {
      paymentIntentId: string;
      offerId: string;
      offerName: string;
      price: number;
      entries: number;
    }) => {
      if (invoiceFinalized || !originalPurchaseContext || !userContext.userId) {
        console.log("📧 Invoice finalization skipped:", { invoiceFinalized, hasContext: !!originalPurchaseContext });
        return;
      }

      try {
        console.log("📧 Finalizing invoice...", { withUpsell: !!upsellData });

        const response = await fetch("/api/invoice/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userContext.userId,
            originalPurchase: originalPurchaseContext,
            upsellPurchase: upsellData,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log("✅ Invoice finalized:", result);
          setInvoiceFinalized(true);

          // Clear timeout if it exists
          if (finalizationTimeoutId) {
            clearTimeout(finalizationTimeoutId);
            setFinalizationTimeoutId(null);
          }
        } else {
          console.error("❌ Invoice finalization failed:", await response.text());
        }
      } catch (error) {
        console.error("❌ Invoice finalization error:", error);
      }
    },
    [invoiceFinalized, originalPurchaseContext, userContext.userId, finalizationTimeoutId]
  );

  /**
   * Show upsell modal with selected offer
   */
  const showUpsellOffer = useCallback(
    (offer: UpsellOffer) => {
      setCurrentOffer(offer);
      setIsModalOpen(true);
      setHasShownOffer(true);

      // Track that offer was shown
      onOfferShown(offer);

      // Track analytics
      trackUpsellEvent("shown", offer);

      // Start 1-minute timeout for invoice finalization
      if (originalPurchaseContext && !invoiceFinalized) {
        const timeoutId = setTimeout(() => {
          console.log("⏰ Invoice finalization timeout - sending original purchase only");
          finalizeInvoice();
        }, 60000); // 1 minute = 60000ms

        setFinalizationTimeoutId(timeoutId);
      }
    },
    [onOfferShown, trackUpsellEvent, originalPurchaseContext, invoiceFinalized, finalizeInvoice]
  );

  /**
   * Handle upsell purchase
   */
  const handleUpsellPurchase = useCallback(
    async (offer: UpsellOffer) => {
      console.log("🛒 Starting upsell purchase:", {
        isAuthenticated: userContext.isAuthenticated,
        hasDefaultPayment: userContext.hasDefaultPayment,
        offer: offer.title,
      });

      try {
        if (userContext.isAuthenticated) {
          console.log("💳 Attempting upsell purchase...");

          // Try upsell purchase API first (works for both one-click and new payment methods)
          const response = await fetch("/api/upsell/purchase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              offerId: offer.id,
              useDefaultPayment: userContext.hasDefaultPayment,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              // Show success message and close modal

              setIsModalOpen(false);
              setCurrentOffer(null);
              return;
            } else {
              console.log("❌ Upsell purchase failed:", result.error);
              // If upsell API fails, fall back to MembershipModal
              console.log("🔄 Falling back to MembershipModal for upsell purchase");
              redirectToFullPaymentFlow(offer);
              return;
            }
          } else {
            console.log("❌ Upsell API response not ok:", response.status);
            // If API call fails, fall back to MembershipModal
            console.log("🔄 Falling back to MembershipModal for upsell purchase");
            redirectToFullPaymentFlow(offer);
            return;
          }
        }

        console.log("🔄 User not authenticated, showing login prompt...");
        // For unauthenticated users, show a message to log in first
        alert("Please log in to your account to complete this purchase.");
        setIsModalOpen(false);
        setCurrentOffer(null);
      } catch (error) {
        console.error("Upsell purchase failed:", error);
        // Show error message instead of falling back to MembershipModal
        alert(`Purchase failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
    [userContext, redirectToFullPaymentFlow]
  );

  /**
   * Handle offer acceptance
   */
  const handleOfferAccept = useCallback(
    async (offer: UpsellOffer) => {
      try {
        // Track acceptance
        onOfferAccepted(offer);
        trackUpsellEvent("accepted", offer);

        // Hide floating gift icon when offer is accepted
        setShowFloatingGift(false);
        setDeclinedOffer(null);

        // Handle the purchase logic here
        await handleUpsellPurchase(offer);

        // Note: Modal closing is now handled within handleUpsellPurchase
        // based on the purchase flow (success, redirect, or error)
      } catch (error) {
        console.error("Failed to process upsell purchase:", error);
        // Keep modal open on error so user can try again
        // You might want to show an error message to the user
      }
    },
    [onOfferAccepted, handleUpsellPurchase, trackUpsellEvent]
  );

  /**
   * Handle offer decline
   */
  const handleOfferDecline = useCallback(
    (offer: UpsellOffer) => {
      onOfferDeclined(offer);
      trackUpsellEvent("declined", offer);

      setIsModalOpen(false);
      setCurrentOffer(null);

      // Show floating gift icon for declined offer
      setDeclinedOffer(offer);
      setShowFloatingGift(true);

      // Finalize invoice with original purchase only
      finalizeInvoice();
    },
    [onOfferDeclined, trackUpsellEvent, finalizeInvoice]
  );

  /**
   * Handle floating gift icon click - reopen the declined offer
   */
  const handleFloatingGiftClick = useCallback(() => {
    if (declinedOffer) {
      setCurrentOffer(declinedOffer);
      setIsModalOpen(true);
      setShowFloatingGift(false);
    }
  }, [declinedOffer]);

  /**
   * Handle floating gift icon dismiss
   */
  const handleFloatingGiftDismiss = useCallback(() => {
    setShowFloatingGift(false);
    setDeclinedOffer(null);
  }, []);

  /**
   * Initialize upsell flow when component mounts or context changes
   */
  useEffect(() => {
    if (hasShownOffer) return; // Don't show multiple offers

    // Small delay to let the success message show first
    const timer = setTimeout(() => {
      const offer = selectRelevantOffer();
      if (offer) {
        showUpsellOffer(offer);
      }
    }, 2000); // 2 second delay after purchase success

    return () => clearTimeout(timer);
  }, [triggerEvent, userContext, hasShownOffer, selectRelevantOffer, showUpsellOffer]);

  /**
   * Cleanup finalization timeout on unmount
   */
  useEffect(() => {
    return () => {
      if (finalizationTimeoutId) {
        clearTimeout(finalizationTimeoutId);
      }
    };
  }, [finalizationTimeoutId]);

  /**
   * Handle modal close
   */
  const handleModalClose = () => {
    if (currentOffer) {
      trackUpsellEvent("dismissed", currentOffer);
    }
    setIsModalOpen(false);
    setCurrentOffer(null);
  };

  return (
    <>
      {currentOffer && (
        <UpsellModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          offer={currentOffer}
          userContext={userContext}
          onAccept={handleOfferAccept}
          onDecline={handleOfferDecline}
        />
      )}

      {/* Floating Gift Icon for declined offers */}
      <FloatingGiftIcon
        isVisible={showFloatingGift}
        onClick={handleFloatingGiftClick}
        onDismiss={handleFloatingGiftDismiss}
        offerTitle={declinedOffer?.title}
        discountPercentage={declinedOffer?.discountPercentage}
      />
    </>
  );
};

export default UpsellManager;
