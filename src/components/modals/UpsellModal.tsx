"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { CheckCircle, CreditCard } from "lucide-react";
import { UpsellModalProps } from "@/types/upsell";
import { useUserContext } from "@/contexts/UserContext";
import { usePaymentMethods } from "@/hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useLoading } from "@/contexts/LoadingContext";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse } from "@/hooks/queries";
import { usePurchaseUpsell } from "@/hooks/queries/useUpsellQueries";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useToast } from "@/components/ui/Toast";
import { rewardsEnabled } from "@/config/featureFlags";

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
  const { showToast } = useToast();

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

    // Clear the timeout since we're closing
    if (finalizationTimeoutIdRef.current) {
      clearTimeout(finalizationTimeoutIdRef.current);
      finalizationTimeoutIdRef.current = null;
    }

    // ✅ CRITICAL: Finalize invoice if not already finalized
    // This ensures Klaviyo email is sent even if user closes modal without clicking decline
    if (!invoiceFinalized && originalPurchaseContext) {
      console.log("📧 Modal closing - finalizing invoice with original purchase only");
      finalizeInvoice();
    }

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
  }, [onClose, userData, invoiceFinalized, originalPurchaseContext, finalizeInvoice]);

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
            // Handle API errors (e.g., validation errors from entry limit checks)
            hideLoading();
            const errorMessage = error instanceof Error ? error.message : "Upsell purchase failed";
            showToast({
              type: "error",
              title: "Purchase Failed",
              message: errorMessage,
              duration: 5000,
            });
            setIsProcessing(false);
          },
        }
      );
    } catch (error) {
      console.error("Upsell purchase failed:", error);
      console.error(`Purchase failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      hideLoading(); // Hide loading screen on error

      // Show error toast to user with the error message
      const errorMessage = error instanceof Error ? error.message : "Upsell purchase failed";
      showToast({
        type: "error",
        title: "Purchase Failed",
        message: errorMessage,
        duration: 5000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle payment processing success
  const handlePaymentSuccess = async (status: PaymentStatusResponse) => {
    console.log("Upsell payment processed successfully:", status);
    setShowPaymentProcessing(false);

    // Track Purchase event client-side for Meta Pixel Helper visibility
    // IMPORTANT: Always track when payment is completed, even if status.data is incomplete
    if (status.status === "completed") {
      try {
        // Get paymentIntentId from status.data or fallback to state
        const finalPaymentIntentId = status.data?.paymentIntentId || paymentIntentId || `order-${Date.now()}`;

        // Get package details - use offer data as source of truth
        const packageName = status.data?.packageName || offer.title;
        const value = offer.discountedPrice || offer.originalPrice || 0;
        const currency = "AUD";

        // Generate EventID matching server-side format for deduplication
        const eventID = `purchase_${finalPaymentIntentId}_${Date.now()}`;

        // Import trackFacebookEvent dynamically to avoid SSR issues
        const { trackFacebookEvent } = await import("@/components/FacebookPixel");

        // Track Purchase event with EventID - always use "upsell" as package_type
        trackFacebookEvent("Purchase", {
          eventID,
          value,
          currency,
          order_id: finalPaymentIntentId,
          content_type: "upsell_package",
          content_ids: offer.id ? [offer.id] : [],
          num_items: 1,
          content_name: packageName,
          package_type: "upsell",
          package_id: offer.id,
          package_name: packageName,
          payment_intent_id: finalPaymentIntentId,
          platform: "tools-australia",
        });

        console.log(`📘 Facebook Pixel: Upsell Purchase tracked - $${value} ${currency} (EventID: ${eventID})`);
      } catch (pixelError) {
        console.error("❌ Error tracking Upsell Purchase client-side:", pixelError);
        // Non-blocking - continue with success flow
      }
    }

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

    // Add reward points if available and rewards are enabled
    if (rewardsEnabled() && status.data?.points && status.data.points > 0) {
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

  /**
   * Maps offer ID to the corresponding image filename
   * Returns the image path for the upsell promotional image
   *
   * Note: Some packages share the same image (e.g., subscription "tradie-plus-package"
   * and one-time "tradie-plus-pack" both use "Tradie Plus.png")
   */
  const getUpsellImagePath = (): string => {
    const imageMap: Record<string, string> = {
      // === SUBSCRIPTION PLUS PACKAGES ===
      "tradie-plus-package": "Tradie Package.png", // Subscription: Tradie Plus Package (shows Tradie Package image)
      "foreman-plus-package": "Foreman Package.png", // Subscription: Foreman Plus Package (shows Foreman Package image)
      "boss-plus-package": "Boss Package.png", // Subscription: Boss Plus Package (shows Boss Package image)

      // === ONE-TIME PLUS PACKAGES ===
      "apprentice-plus-pack": "Apprentice Plus.png", // One-time: Apprentice Plus Pack
      "tradie-plus-pack": "Tradie Plus.png", // One-time: Tradie Plus Pack (shares image with subscription)
      "foreman-plus-pack": "Foreman Plus.png", // One-time: Foreman Plus Pack (shares image with subscription)
      "boss-plus-pack": "Boss Plus.png", // One-time: Boss Plus Pack (shares image with subscription)
      "power-plus-pack": "Power Plus.png", // One-time: Power Plus Pack

      // === ADDITIONAL UPGRADE PACKAGES ===
      "additional-apprentice-pack-upgrade": "Apprentice Upgrade.png", // Additional: Apprentice Pack Upgrade
      "additional-tradie-pack-upgrade": "Tradie Upgrade.png", // Additional: Tradie Pack Upgrade
      "additional-foreman-pack-upgrade": "Foreman Upgrade.png", // Additional: Foreman Pack Upgrade
      "additional-boss-pack-upgrade": "Boss Upgrade.png", // Additional: Boss Pack Upgrade
      "additional-power-pack-upgrade": "Power Upgrade.png", // Additional: Power Pack Upgrade

      // === MINI PACK UPGRADES ===
      "mini-pack-1-upgrade": "Mini Pack 1.png",
      "mini-pack-2-upgrade": "Mini Pack 2.png",
      "mini-pack-3-upgrade": "Mini Pack 3.png",
      "mini-pack-4-upgrade": "Mini Pack 4.png",
      "mini-pack-5-upgrade": "Mini Pack 5.png",
      "mini-pack-6-upgrade": "Mini Pack 6.png",
      "mini-pack-7-upgrade": "Mini Pack 7.png",
      "mini-pack-8-upgrade": "Mini Pack 8.png",
    };

    const imageName = imageMap[offer.id];
    if (imageName) {
      return `/images/upsells/${imageName}`;
    }

    // Fallback: return a default image or the offer's imageUrl if available
    console.warn(`⚠️ No image mapping found for upsell ID: ${offer.id}`);
    return offer.imageUrl || "/images/upsells/Tradie Plus.png";
  };

  if (!isOpen) return null;

  // Global loading and success screens are now handled by LoadingContext

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 max-h-screen overflow-y-auto">
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
          relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-xs sm:max-w-lg mx-auto overflow-hidden
          transform transition-all duration-300 ease-out
          ${isVisible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"}
        `}
      >
        {/* Hero Section - Image Display - No Padding */}
        <div className="relative w-full overflow-hidden">
          <div className="relative w-full">
            <Image
              src={getUpsellImagePath()}
              alt={offer.title || "Special Offer"}
              width={600}
              height={800}
              className="w-full h-auto"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 600px"
              priority
            />
          </div>
        </div>

        {/* Main Content - Ultra Compact */}
        <div className="px-3 sm:px-6 pb-2 sm:pb-4 pt-2 sm:pt-4">
          {/* Action Buttons - Stacked Vertically */}
          <div className="flex flex-col gap-2 mb-2">
            {/* Primary CTA - Purchase with Default Card */}
            <button
              onClick={() => {
                console.log("🟢 Upsell primary CTA clicked", {
                  offerId: offer.id,
                  isProcessing,
                  hasDefaultPaymentMethod: !!defaultPaymentMethod,
                  paymentMethodId: defaultPaymentMethod?.paymentMethodId,
                  hasOriginalPurchaseContext: !!originalPurchaseContext,
                });
                handleAccept();
              }}
              disabled={isProcessing || !defaultPaymentMethod}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl font-bold text-base sm:text-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isProcessing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
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
              onClick={() => {
                console.log("🟡 Upsell decline button clicked", {
                  offerId: offer.id,
                  invoiceFinalized,
                  hasOriginalPurchaseContext: !!originalPurchaseContext,
                });
                handleDecline();
              }}
              className="w-full text-red-600 py-2 sm:py-2.5 px-4 sm:px-6 rounded-xl border border-red-300 hover:bg-red-50 transition-colors font-medium text-sm sm:text-base"
            >
              No thanks, maybe later
            </button>
          </div>

          {/* Trust Indicators - Compact */}
          <div className="mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-gray-200">
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
                <span>One-Time Payment</span>
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
