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
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getUpsellImagePath } from "@/utils/upsell/upsell-image-selector";
import { getUpsellPackageById } from "@/data/upsellPackages";

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
  // ✅ FIX: Track if finalization is in progress to prevent race conditions
  const isFinalizingRef = React.useRef<boolean>(false);
  // ✅ Track polling state to show loading instead of "No Payment Method"
  const [isPollingPaymentMethods, setIsPollingPaymentMethods] = useState(false);
  const pollingStoppedRef = React.useRef<boolean>(false);
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
  // ✅ Get refetch function and loading state to poll for payment methods when modal opens
  const { data: paymentMethods, refetch: refetchPaymentMethods, isLoading: isLoadingPaymentMethods } = usePaymentMethods(userData?._id);

  // Add query client for UI updates
  const queryClient = useQueryClient();

  // Helper function to invalidate user-related caches
  const invalidateUserCaches = useCallback(
    (userId: string) => {
      // console.log("🔄 Invalidating user caches for:", userId);
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
  
  // ✅ Determine if we should show loading state
  // Show loading if: actively polling OR initial load AND no payment method found yet
  const isCheckingPaymentMethod = isPollingPaymentMethods || (isLoadingPaymentMethods && !defaultPaymentMethod);

  /**
   * Finalize invoice and send to Klaviyo
   *
   * CRITICAL: This function MUST finalize the invoice when the upsell modal is shown.
   * Uses userContext.userId if available, otherwise falls back to userData._id from useUserContext().
   * This ensures invoices are ALWAYS sent, even if userContext is incomplete.
   */
  const finalizeInvoice = useCallback(
    async (upsellData?: {
      paymentIntentId: string;
      offerId: string;
      offerName: string;
      price: number;
      entries: number;
    }) => {
      // ✅ FIX: Prevent duplicate finalization - check both state and ref
      if (invoiceFinalized || isFinalizingRef.current) {
        console.log("📧 Invoice finalization skipped: already finalized or in progress");
        return;
      }

      // CRITICAL: originalPurchaseContext is REQUIRED - without it we can't finalize
      if (!originalPurchaseContext) {
        console.error("❌ Invoice finalization skipped: missing originalPurchaseContext", {
          hasContext: !!originalPurchaseContext,
          hasUserContextUserId: !!userContext?.userId,
          hasUserDataId: !!userData?._id,
        });
        return;
      }

      // CRITICAL FIX: Use userContext.userId if available, otherwise fall back to userData._id
      // This ensures we ALWAYS have a userId when finalizing invoices
      const finalUserId = userContext?.userId || userData?._id;
      if (!finalUserId) {
        console.error("❌ Invoice finalization skipped: missing userId", {
          hasUserContextUserId: !!userContext?.userId,
          hasUserDataId: !!userData?._id,
        });
        return;
      }

      // ✅ FIX: Set finalizing flag and clear timeout IMMEDIATELY (not waiting for API response)
      isFinalizingRef.current = true;
      
      // Clear timeout immediately to prevent race condition
      if (finalizationTimeoutIdRef.current) {
        clearTimeout(finalizationTimeoutIdRef.current);
        finalizationTimeoutIdRef.current = null;
        console.log("⏰ Cleared invoice finalization timeout (finalization started)");
      }

      try {
        console.log("📧 Finalizing invoice...", {
          withUpsell: !!upsellData,
          userId: finalUserId,
          paymentIntentId: originalPurchaseContext.paymentIntentId,
          packageName: originalPurchaseContext.packageName,
        });

        const response = await fetch("/api/invoice/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: finalUserId,
            originalPurchase: originalPurchaseContext,
            upsellPurchase: upsellData,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log("✅ Invoice finalized:", result);
          setInvoiceFinalized(true);
          // Keep isFinalizingRef.current = true to prevent any further attempts
        } else {
          const errorText = await response.text();
          console.error("❌ Invoice finalization failed:", response.status, errorText);
          // Reset flag on error so user can retry if needed
          isFinalizingRef.current = false;
        }
      } catch (error) {
        console.error("❌ Invoice finalization error:", error);
        // Reset flag on error so user can retry if needed
        isFinalizingRef.current = false;
      }
    },
    [invoiceFinalized, originalPurchaseContext, userContext?.userId, userData?._id]
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

    // ✅ CRITICAL: Finalize invoice if not already finalized or in progress
    // This ensures Klaviyo email is sent even if user closes modal without clicking decline
    if (!invoiceFinalized && !isFinalizingRef.current && originalPurchaseContext) {
      console.log("📧 Modal closing - finalizing invoice with original purchase only");
      finalizeInvoice();
    } else if (!invoiceFinalized && !isFinalizingRef.current) {
      console.warn("⚠️ Modal closing but invoice not finalized - missing context:", {
        invoiceFinalized,
        hasContext: !!originalPurchaseContext,
      });
    }

    // Clear pending upsell (this also clears sessionStorage via the updated function)
    const { setPendingUpsellAfterSetup } = useModalPriorityStore.getState();
    setPendingUpsellAfterSetup(false);

    // Extra cleanup to ensure sessionStorage is cleared
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("pendingUpsell");
      sessionStorage.removeItem("pendingUpsellFlag");
      // console.log("🗑️ Cleared pending upsell from sessionStorage");
    }

    // Check if user needs to complete setup
    // Don't trigger if setup was just completed
    const setupJustCompleted = sessionStorage.getItem("setupJustCompleted");
    if (userData && !userData.profileSetupCompleted && !setupJustCompleted) {
      // console.log("🎯 Upsell closed, user needs setup - triggering user-setup modal");
      setTimeout(() => {
        const { requestModal } = useModalPriorityStore.getState();
        requestModal("user-setup", true);
      }, 500); // Short delay after upsell closes
    }

    onClose();
  }, [onClose, userData, invoiceFinalized, originalPurchaseContext, finalizeInvoice]);

  // ✅ OPTIMIZED: Smart payment method polling with loading state and efficient intervals
  // Polls only when needed and stops immediately when payment method is found
  // Uses reasonable intervals to prevent database/API overload
  useEffect(() => {
    if (isOpen && userData?._id && !pollingStoppedRef.current) {
      const userId = userData._id;
      
      // Reset polling state when modal opens
      setIsPollingPaymentMethods(true);
      pollingStoppedRef.current = false;
      
      // ✅ Step 1: Invalidate cache and do initial fetch immediately
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userId) });
      refetchPaymentMethods().then((result) => {
        // Check if payment method already exists after initial fetch
        const methods = result.data;
        const hasDefault = methods?.find((pm) => pm.isDefault);
        if (hasDefault) {
          console.log("✅ Payment method found on initial fetch, skipping poll");
          setIsPollingPaymentMethods(false);
          pollingStoppedRef.current = true;
          return; // Exit early if payment method already exists
        }
      }).catch((error) => {
        console.error("Error during initial payment method fetch:", error);
        // Continue with polling even if initial fetch fails
      });

      // ✅ Step 2: Set up efficient polling with reasonable intervals
      // Poll every 2 seconds (not 500ms) to reduce database load
      // Total duration: ~30 seconds max (15 polls × 2 seconds)
      let pollCount = 0;
      const maxPolls = 15; // 15 polls × 2 seconds = 30 seconds max
      const pollIntervalMs = 2000; // 2 seconds - reasonable interval to prevent overload
      
      const pollInterval = setInterval(async () => {
        // ✅ Early exit if already found (prevents unnecessary refetches)
        if (pollingStoppedRef.current) {
          clearInterval(pollInterval);
          return;
        }
        
        pollCount++;
        
        try {
          // ✅ Refetch to get latest payment methods
          const refetchResult = await refetchPaymentMethods();
          
          // Check payment methods from refetched data
          const freshPaymentMethods = refetchResult.data;
          const freshDefaultMethod = freshPaymentMethods?.find((pm) => pm.isDefault);
          
          // ✅ CRITICAL: Stop polling immediately if payment method is found
          if (freshDefaultMethod) {
            console.log(`✅ Payment method found after ${pollCount} poll(s), stopping`);
            pollingStoppedRef.current = true;
            setIsPollingPaymentMethods(false);
            
            // Final cache invalidation to ensure UI updates
            queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
            
            clearInterval(pollInterval);
            return;
          }
          
          // Continue polling if not found and haven't exceeded max polls
          if (pollCount < maxPolls) {
            console.log(`🔄 Polling for payment methods (attempt ${pollCount}/${maxPolls})...`);
          } else {
            // Max polls reached - stop polling
            console.log("⏰ Stopped polling for payment methods (max attempts reached)");
            pollingStoppedRef.current = true;
            setIsPollingPaymentMethods(false);
            clearInterval(pollInterval);
          }
        } catch (error) {
          console.error("Error polling for payment methods:", error);
          // On error, stop polling to prevent infinite retries
          pollingStoppedRef.current = true;
          setIsPollingPaymentMethods(false);
          clearInterval(pollInterval);
        }
      }, pollIntervalMs); // 2 second interval - optimized for performance

      // Cleanup interval when modal closes or component unmounts
      return () => {
        clearInterval(pollInterval);
        setIsPollingPaymentMethods(false);
      };
    } else if (!isOpen) {
      // Reset polling state when modal closes
      pollingStoppedRef.current = false;
      setIsPollingPaymentMethods(false);
    }
  }, [isOpen, userData?._id, refetchPaymentMethods, queryClient]);

  // Animation effect and reset payment processing state
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure smooth animation
      const timer = setTimeout(() => setIsVisible(true), 10);
      // Reset payment processing state to prevent infinite polling
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);

      // CRITICAL: Log context to help debug invoice finalization issues
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
        hasUserContextUserId: !!userContext?.userId,
        hasUserDataId: !!userData?._id,
        hasPaymentMethod: !!defaultPaymentMethod,
      });

      // CRITICAL: Start 30-second timeout for invoice finalization if we have purchase context
      // This ensures invoices are ALWAYS sent, even if user doesn't interact with the modal
      if (originalPurchaseContext && !invoiceFinalized && !isFinalizingRef.current) {
        const timeoutId = setTimeout(() => {
          // ✅ FIX: Check if finalization is in progress before calling
          if (!isFinalizingRef.current && !invoiceFinalized) {
            console.log("⏰ Invoice finalization timeout (30s) - sending original purchase only");
            finalizeInvoice();
          } else {
            console.log("⏰ Invoice finalization timeout skipped: already finalized or in progress");
          }
        }, 30000); // 30 seconds = 30000ms

        finalizationTimeoutIdRef.current = timeoutId;
        console.log("⏰ Started 30-second timeout for invoice finalization");
      } else {
        console.warn("⚠️ Invoice timeout NOT started:", {
          hasContext: !!originalPurchaseContext,
          invoiceFinalized,
          isFinalizing: isFinalizingRef.current,
        });
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
  }, [isOpen, originalPurchaseContext, invoiceFinalized, finalizeInvoice, defaultPaymentMethod]);

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

      // console.log(
      //   "🛒 Processing upsell purchase:",
      //   offer.title,
      //   "with default payment method:",
      //   defaultPaymentMethod.paymentMethodId
      // );

      // Use optimistic upsell purchase hook
      purchaseUpsell(
        {
          offerId: offer.id,
          useDefaultPayment: true,
          paymentMethodId: defaultPaymentMethod.paymentMethodId,
          userId: userData?._id || "",
          originalPurchaseContext: originalPurchaseContext
            ? {
                paymentIntentId: originalPurchaseContext.paymentIntentId,
                packageId: originalPurchaseContext.packageId,
                packageName: originalPurchaseContext.packageName,
                packageType: originalPurchaseContext.packageType,
                price: originalPurchaseContext.price,
                entries: originalPurchaseContext.entries,
                baseEntries: originalPurchaseContext.baseEntries,
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
    // console.log("Upsell payment processed successfully:", status);
    setShowPaymentProcessing(false);

    // ✅ REMOVED: Client-side Facebook Pixel tracking
    // Server-side tracking via grantBenefits → trackPixelPurchase is sufficient and more reliable
    // This prevents duplicate tracking that causes inflated revenue in Facebook Ads

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

    // ✅ CRITICAL: Always finalize invoice with both original purchase and upsell
    // Use paymentIntentId from status.data if available, otherwise fall back to state
    const finalUpsellPaymentIntentId = status.data?.paymentIntentId || paymentIntentId;
    if (originalPurchaseContext && finalUpsellPaymentIntentId) {
      console.log("📧 Finalizing invoice with upsell purchase:", {
        upsellPaymentIntentId: finalUpsellPaymentIntentId,
        offerId: offer.id,
        offerName: offer.title,
      });
      finalizeInvoice({
        paymentIntentId: finalUpsellPaymentIntentId,
        offerId: offer.id,
        offerName: offer.title,
        price: offer.discountedPrice,
        entries: offer.entriesCount,
      });
    } else {
      console.warn("⚠️ Cannot finalize invoice with upsell - missing data:", {
        hasOriginalContext: !!originalPurchaseContext,
        hasPaymentIntentId: !!finalUpsellPaymentIntentId,
      });
      // Still finalize with original purchase only if we have context
      if (originalPurchaseContext) {
        console.log("📧 Finalizing invoice with original purchase only (upsell data missing)");
        finalizeInvoice();
      }
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

  // Get resolved multiplier (includes alternating if no active promo)
  // This ensures seamless integration with alternating multiplier feature
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  const resolvedMiniMultiplier = useResolvedMultiplier("mini-packages", "display");

  /**
   * Dynamically selects upsell image based on resolved promo multiplier (includes alternating)
   * Returns the image path for the upsell promotional image
   *
   * Logic:
   * - If no promo active (null): Use base images from /images/upsells/
   * - If 2x/3x/5x promo active (one-time packages): Use /images/upsells/active-promo/{multiplier}X {Package} Plus.png or {multiplier}x {Package} Upgrade.png
   * - If 10x promo active (membership packages): Use /images/upsells/active-promo/10X {Package} Package.png
   * - Falls back to base images if promo-specific image is unavailable
   */
  const getUpsellImagePathValue = (): string => {
    // Get full upsell package data to access category
    const upsellPackage = getUpsellPackageById(offer.id);

    // Determine package type from originalPurchaseContext or offer category
    let packageType: "membership" | "one-time" | "mini-draw" | undefined;
    if (originalPurchaseContext?.packageType) {
      packageType = originalPurchaseContext.packageType;
    } else if (offer.category === "membership") {
      packageType = "membership";
    } else if (offer.category === "mini-draw") {
      packageType = "mini-draw";
    } else {
      // Default to one-time for one-time-plus and additional-upgrade
      packageType = "one-time";
    }

    // Get resolved multiplier for the package type (includes alternating if no active promo)
    let promoMultiplier: number | null = null;
    if (packageType === "membership") {
      promoMultiplier = resolvedMembershipMultiplier;
    } else if (packageType === "one-time") {
      promoMultiplier = resolvedOneTimeMultiplier;
    } else if (packageType === "mini-draw") {
      promoMultiplier = resolvedMiniMultiplier;
    }

    // Get upsell category from package data (more reliable than inferring from offer)
    const category = upsellPackage?.category;

    // Use the utility function to get the correct image path
    return getUpsellImagePath({
      offerId: offer.id,
      packageType,
      promoMultiplier: promoMultiplier ?? undefined, // Pass undefined if null (no promo)
      category,
    });
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
              src={getUpsellImagePathValue()}
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
                // console.log("🟢 Upsell primary CTA clicked", {
                //   offerId: offer.id,
                //   isProcessing,
                //   hasDefaultPaymentMethod: !!defaultPaymentMethod,
                //   paymentMethodId: defaultPaymentMethod?.paymentMethodId,
                //   hasOriginalPurchaseContext: !!originalPurchaseContext,
                // });
                handleAccept();
              }}
              disabled={isProcessing || !defaultPaymentMethod || isCheckingPaymentMethod}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl font-bold text-base sm:text-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isProcessing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </div>
              ) : isCheckingPaymentMethod ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading payment method...</span>
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
                    "No Payment Method Available"
                  )}
                </div>
              )}
            </button>

            {/* Secondary Action */}
            <button
              onClick={() => {
                // console.log("🟡 Upsell decline button clicked", {
                //   offerId: offer.id,
                //   invoiceFinalized,
                //   hasOriginalPurchaseContext: !!originalPurchaseContext,
                // });
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
