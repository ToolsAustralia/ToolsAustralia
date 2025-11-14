"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle, Gift, Zap, Star, Sparkles, CreditCard } from "lucide-react";
import { UpsellModalProps } from "@/types/upsell";
import { useUserContext } from "@/contexts/UserContext";
import { usePaymentMethods } from "@/hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useLoading } from "@/contexts/LoadingContext";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse } from "@/utils/payment/payment-status";
import { usePurchaseUpsell } from "@/hooks/queries/useUpsellQueries";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";

/**
 * UpsellModal Component
 * Displays compelling post-purchase offers to encourage additional purchases
 * Features modern design with urgency, value proposition, and clear CTAs
 */
const UpsellModal: React.FC<UpsellModalProps> = ({
  isOpen,
  onClose,
  offer,
  userContext,
  originalPurchaseContext,
  onAccept,
  onDecline,
}) => {
  // Note: onAccept is not used in this implementation as we handle purchases directly
  // This maintains backward compatibility with the interface
  void onAccept; // Suppress unused parameter warning
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [invoiceFinalized, setInvoiceFinalized] = useState(false);
  const finalizationTimeoutIdRef = React.useRef<NodeJS.Timeout | null>(null);
  // const [timeLeft, setTimeLeft] = useState({ // TODO: Implement countdown timer
  //   hours: 0,
  //   minutes: 0,
  //   seconds: 0,
  // });

  // Payment processing state
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  // Get user context and payment methods
  const { userData } = useUserContext();
  // const { isAuthenticated } = useUserContext(); // TODO: Use for authentication checks
  const { data: paymentMethods } = usePaymentMethods(userData?._id);

  // Add query client for UI updates
  const queryClient = useQueryClient();

  // Helper function to invalidate user-related caches
  const invalidateUserCaches = useCallback(
    (userId: string) => {
      console.log("🔄 Invalidating user caches for:", userId);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(userId) });
    },
    [queryClient]
  );

  const { showLoading, hideLoading, showSuccess } = useLoading();
  const { mutate: purchaseUpsell } = usePurchaseUpsell();

  // Get default payment method
  const defaultPaymentMethod = paymentMethods?.find((pm) => pm.isDefault);

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
      if (invoiceFinalized || !originalPurchaseContext || !userContext?.userId) {
        console.log("📧 Invoice finalization skipped:", {
          invoiceFinalized,
          hasContext: !!originalPurchaseContext,
          hasUserId: !!userContext?.userId,
          contextDetails: originalPurchaseContext
            ? {
                paymentIntentId: originalPurchaseContext.paymentIntentId,
                packageName: originalPurchaseContext.packageName,
              }
            : null,
        });
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
          if (finalizationTimeoutIdRef.current) {
            clearTimeout(finalizationTimeoutIdRef.current);
            finalizationTimeoutIdRef.current = null;
          }
        } else {
          console.error("❌ Invoice finalization failed:", await response.text());
        }
      } catch (error) {
        console.error("❌ Invoice finalization error:", error);
      }
    },
    [invoiceFinalized, originalPurchaseContext, userContext?.userId]
  );

  // Custom close handler that resets payment processing state
  const handleClose = useCallback(() => {
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);

    // Clear pending upsell (this also clears sessionStorage via the updated function)
    const { setPendingUpsellAfterSetup } = useModalPriorityStore.getState();
    setPendingUpsellAfterSetup(false);

    // Extra cleanup to ensure sessionStorage is cleared
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("pendingUpsell");
      sessionStorage.removeItem("pendingUpsellFlag");
      console.log("🗑️ Cleared pending upsell from sessionStorage");
    }

    // Check if user needs to complete setup
    // Don't trigger if setup was just completed
    const setupJustCompleted = sessionStorage.getItem("setupJustCompleted");
    if (userData && !userData.profileSetupCompleted && !setupJustCompleted) {
      console.log("🎯 Upsell closed, user needs setup - triggering user-setup modal");
      setTimeout(() => {
        const { requestModal } = useModalPriorityStore.getState();
        requestModal("user-setup", true);
      }, 500); // Short delay after upsell closes
    }

    onClose();
  }, [onClose, userData]);

  // Animation effect and reset payment processing state
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure smooth animation
      const timer = setTimeout(() => setIsVisible(true), 10);
      // Reset payment processing state to prevent infinite polling
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);

      // Debug logging to check context
      console.log("🔍 UpsellModal opened:", {
        hasContext: !!originalPurchaseContext,
        contextDetails: originalPurchaseContext
          ? {
              paymentIntentId: originalPurchaseContext.paymentIntentId,
              packageName: originalPurchaseContext.packageName,
              packageType: originalPurchaseContext.packageType,
            }
          : null,
        invoiceFinalized,
      });

      // Start 1-minute timeout for invoice finalization if we have purchase context
      if (originalPurchaseContext && !invoiceFinalized) {
        const timeoutId = setTimeout(() => {
          console.log("⏰ Invoice finalization timeout - sending original purchase only");
          finalizeInvoice();
        }, 60000); // 1 minute = 60000ms

        finalizationTimeoutIdRef.current = timeoutId;
        console.log("⏰ Started 60-second timeout for invoice finalization");
      } else {
        console.log("⚠️ Invoice timeout NOT started - missing context or already finalized");
      }

      return () => {
        clearTimeout(timer);
        if (finalizationTimeoutIdRef.current) {
          clearTimeout(finalizationTimeoutIdRef.current);
          finalizationTimeoutIdRef.current = null;
        }
      };
    } else {
      setIsVisible(false);
    }
  }, [isOpen, originalPurchaseContext, invoiceFinalized, finalizeInvoice]);

  // Countdown timer for urgency - TODO: Implement countdown timer
  // useEffect(() => {
  //   if (!isOpen || !offer.urgencyText) return;

  //   const updateCountdown = () => {
  //     const now = new Date().getTime();
  //     const endTime = offer.validUntil ? new Date(offer.validUntil).getTime() : now;
  //     const difference = endTime - now;

  //     if (difference > 0) {
  //       const hours = Math.floor(difference / (1000 * 60 * 60));
  //       const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  //       const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  //       setTimeLeft({ hours, minutes, seconds });
  //     } else {
  //       setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
  //     }
  //   };

  //   updateCountdown();
  //   const interval = setInterval(updateCountdown, 1000);

  //   return () => clearInterval(interval);
  // }, [isOpen, offer.validUntil, offer.urgencyText]);

  // Handle escape key to close modal
  useEffect(() => {
    // Escape key disabled to prevent accidental closing
    // Only handle body scroll
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleAccept = async () => {
    if (isProcessing) return;

    setIsProcessing(true);

    // Show immediate loading feedback
    showLoading("Processing Purchase", "", [
      "Verifying payment method",
      "Processing transaction",
      "Adding entries to your account",
    ]);

    try {
      // Process payment immediately using default payment method
      if (!defaultPaymentMethod) {
        throw new Error("No default payment method found. Please select a payment method.");
      }

      console.log(
        "🛒 Processing upsell purchase:",
        offer.title,
        "with default payment method:",
        defaultPaymentMethod.paymentMethodId
      );

      // Use optimistic upsell purchase hook
      purchaseUpsell(
        {
          offerId: offer.id,
          useDefaultPayment: true,
          paymentMethodId: defaultPaymentMethod.paymentMethodId,
          userId: userData?._id || "",
          originalPurchaseContext: originalPurchaseContext
            ? {
                miniDrawId: originalPurchaseContext.miniDrawId,
                miniDrawName: originalPurchaseContext.miniDrawName,
              }
            : undefined,
        },
        {
          onSuccess: (result) => {
            // Handle both old and new response formats
            const paymentIntentId =
              (result as { data?: { paymentIntentId?: string } }).data?.paymentIntentId ||
              (result as { paymentIntentId?: string }).paymentIntentId;

            if (result.success && paymentIntentId) {
              // Hide initial loading screen and show PaymentProcessingScreen
              hideLoading();
              setPaymentIntentId(paymentIntentId);
              setShowPaymentProcessing(true);
            } else {
              throw new Error(result.message || "Upsell purchase failed");
            }
          },
          onError: (error) => {
            throw new Error(error instanceof Error ? error.message : "Upsell purchase failed");
          },
        }
      );
    } catch (error) {
      console.error("Upsell purchase failed:", error);
      console.error(`Purchase failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      hideLoading(); // Hide loading screen on error
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle payment processing success
  const handlePaymentSuccess = (status: PaymentStatusResponse) => {
    console.log("Upsell payment processed successfully:", status);
    setShowPaymentProcessing(false);

    // Invalidate user caches to update UI immediately
    if (userData?._id) {
      invalidateUserCaches(userData._id);
    }

    // Build benefits array with entry information
    const benefits = [];

    // Always show the package activation
    benefits.push({
      text: `${offer.title} activated successfully`,
      icon: "gift" as const,
    });

    // Add entry count if available
    if (status.data?.entries && status.data.entries > 0) {
      benefits.push({
        text: `${status.data.entries} entries added to your account`,
        icon: "star" as const,
      });
    }

    // Add reward points if available
    if (status.data?.points && status.data.points > 0) {
      benefits.push({
        text: `${status.data.points} reward points earned`,
        icon: "zap" as const,
      });
    }

    // Show success modal with entry information
    showSuccess("Upsell Successful!", `${offer.title} activated`, benefits, 3000);

    // ✅ Finalize invoice with both original purchase and upsell
    if (paymentIntentId && originalPurchaseContext) {
      finalizeInvoice({
        paymentIntentId,
        offerId: offer.id,
        offerName: offer.title,
        price: offer.discountedPrice,
        entries: offer.entriesCount,
      });
    }

    // Auto-close modal after showing success
    setTimeout(() => {
      handleClose();
    }, 3000);
  };

  // Handle payment processing error
  const handlePaymentError = (error: string) => {
    console.error("Upsell payment processing error:", error);
    setShowPaymentProcessing(false);
  };

  const handleCardSelection = () => {
    // Close the upsell modal first to prevent multiple modals
    handleClose();

    // Small delay to ensure upsell modal is closed before opening membership modal
    setTimeout(() => {
      // Create a custom event to trigger the membership modal with upsell offer
      const event = new CustomEvent("showUpsellPayment", {
        detail: { offer },
      });
      window.dispatchEvent(event);
      console.log("🔄 Redirecting to MembershipModal for card selection");
    }, 100);
  };

  const handleDecline = () => {
    // Call decline handler but don't close immediately
    onDecline(offer);

    // Finalize invoice with original purchase only
    finalizeInvoice();

    // Close after a brief delay to show the action was registered
    setTimeout(() => {
      handleClose();
    }, 100);
  };

  // Get icon based on offer category
  const getCategoryIcon = () => {
    switch (offer.category) {
      case "major-draw":
        return <Gift className="w-6 h-6" />;
      case "mini-draw":
        return <Star className="w-6 h-6" />;
      case "membership":
        return <Zap className="w-6 h-6" />;
      default:
        return <Gift className="w-6 h-6" />;
    }
  };

  if (!isOpen) return null;

  // Global loading and success screens are now handled by LoadingContext

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4">
      {/* Animated Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        // Disabled backdrop click to prevent auto-close
      />

      {/* Animated Modal */}
      <div
        className={`
          relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg mx-auto overflow-hidden
          transform transition-all duration-300 ease-out
          ${isVisible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"}
        `}
      >
        {/* Main Content - Ultra Compact */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-5">
          {/* Hero Section - Compact */}
          <div
            className="relative rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)`,
            }}
          >
            {/* Content */}
            <div className="relative z-10 text-white">
              {/* Category Icon - Compact */}
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg">{getCategoryIcon()}</div>
                <span className="text-md sm:text-xl font-bold font-['Poppins'] opacity-90">Special Offer</span>
              </div>

              {/* Title - Responsive */}
              <h2 className="text-lg sm:text-2xl font-bold mb-2 sm:mb-3 font-['Poppins'] leading-tight">
                {offer.title}
              </h2>

              {/* Description - Compact */}
              <p className="text-sm sm:text-base opacity-90 mb-3 sm:mb-4 leading-relaxed">{offer.description}</p>

              {/* Price and Entries Display - Side by Side */}
              <div className="flex items-center justify-between gap-3 sm:gap-4">
                <div className="text-2xl sm:text-3xl font-bold">${offer.discountedPrice}</div>
                {offer.entriesCount > 0 && (
                  <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2 backdrop-blur-sm">
                    <span className="text-sm sm:text-base font-semibold">
                      {offer.entriesCount}{" "}
                      {offer.category === "mini-draw" || originalPurchaseContext?.miniDrawId
                        ? "Mini Draw"
                        : "Major Draw"}{" "}
                      Entries
                      {originalPurchaseContext?.miniDrawName && (
                        <span className="block text-xs opacity-90 mt-1">{originalPurchaseContext.miniDrawName}</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons - Compact */}
          <div className="space-y-2 sm:space-y-3">
            {/* Primary CTA - Purchase with Default Card */}
            <button
              onClick={handleAccept}
              disabled={isProcessing || !defaultPaymentMethod}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-xl font-bold text-base sm:text-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isProcessing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                  {defaultPaymentMethod ? (
                    <>
                      <span>Purchase - ${offer.discountedPrice}</span>

                      <div className="flex items-center gap-1 ml-2 bg-white/20 rounded-lg px-2 py-1">
                        <CreditCard className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="text-xs sm:text-sm">•••• {defaultPaymentMethod.card?.last4}</span>
                      </div>
                    </>
                  ) : (
                    "No Payment Method"
                  )}
                </div>
              )}
            </button>

            {/* Secondary Action */}
            <button
              onClick={handleDecline}
              className="w-full text-gray-500 py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl hover:bg-gray-100 transition-colors font-medium text-sm sm:text-base"
            >
              No thanks, maybe later
            </button>

            {/* Card Selection Button */}
            <button
              onClick={handleCardSelection}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl transition-colors font-medium text-sm sm:text-base flex items-center justify-center gap-2 underline"
            >
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
              Select different payment method
            </button>
          </div>

          {/* Trust Indicators - Compact */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-500">
              <div className="flex items-center gap-1 sm:gap-2">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>Instant</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>Secure</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>No Sub</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Processing Screen */}
      {showPaymentProcessing && paymentIntentId && (
        <PaymentProcessingScreen
          paymentIntentId={paymentIntentId}
          packageName={offer.title}
          packageType="upsell"
          isVisible={showPaymentProcessing}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
          onTimeout={handleClose}
        />
      )}
    </div>
  );
};

export default UpsellModal;
