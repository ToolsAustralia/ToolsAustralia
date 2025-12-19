"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { Package, Info } from "lucide-react";
import { miniDrawPackages } from "@/data/miniDrawPackages";
import { useToast } from "@/components/ui/Toast";
import { usePaymentMethods } from "@/hooks/queries/usePaymentQueries";
import { useUserContext } from "@/contexts/UserContext";
import PaymentProcessingScreen from "@/components/loading/PaymentProcessingScreen";
import type { PaymentStatusResponse } from "@/hooks/queries";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import type { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import MiniDrawPackageModal from "@/components/modals/MiniDrawPackageModal";
import LoginPromptModal from "@/components/modals/LoginPromptModal";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { MiniDrawType } from "@/types/mini-draw";

interface MiniDrawPackagesProps {
  miniDrawId: string;
  minimumEntries?: number;
  totalEntries?: number;
  userEntryCount?: number;
}

export default function MiniDrawPackages({
  miniDrawId,
  minimumEntries,
  totalEntries,
  userEntryCount = 0,
}: MiniDrawPackagesProps) {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const { userData, isAuthenticated } = useUserContext();
  const { data: paymentMethods } = usePaymentMethods(userData?._id);
  const queryClient = useQueryClient();

  /**
   * Calculate user's entry count for this specific minidraw
   * Uses miniDrawParticipation as the single source of truth (includes packages + upsells)
   * Falls back to old calculation for backward compatibility
   * Same calculation as ProductCard badge
   */
  const calculateUserEntryCount = (): number => {
    if (!isAuthenticated || !userData) return userEntryCount || 0;

    // Get lastMonthAccumulatedEntries from subscription (applies to all minidraws)
    const userSubscription = userData.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    const lastMonthAccumulatedEntries = userSubscription?.lastMonthAccumulatedEntries || 0;

    // Get current minidraw ID for comparison (normalize to string)
    const currentMiniDrawId = miniDrawId;

    // Type assertion to access miniDrawParticipation (may not be in UserData type)
    const userWithParticipation = userData as unknown as {
      miniDrawParticipation?: Array<{
        miniDrawId: string | { toString(): string } | { _id: string | { toString(): string } };
        totalEntries: number;
        isActive?: boolean;
      }>;
    };

    // Try to find participation entry for this specific minidraw (single source of truth)
    const participationEntry = userWithParticipation?.miniDrawParticipation?.find((p) => {
      // Handle different ID formats (string, ObjectId, etc.)
      const pkgMiniDrawId = p.miniDrawId;
      if (typeof pkgMiniDrawId === "string") {
        return pkgMiniDrawId === currentMiniDrawId;
      }
      if (pkgMiniDrawId && typeof pkgMiniDrawId === "object") {
        // Check if it has toString method (ObjectId-like)
        if ("toString" in pkgMiniDrawId && typeof pkgMiniDrawId.toString === "function") {
          return pkgMiniDrawId.toString() === currentMiniDrawId;
        }
        // Check if it has _id property
        if ("_id" in pkgMiniDrawId) {
          const idValue = (pkgMiniDrawId as { _id: unknown })._id;
          if (typeof idValue === "string") {
            return idValue === currentMiniDrawId;
          }
          if (idValue && typeof idValue === "object" && "toString" in idValue) {
            return (idValue as { toString: () => string }).toString() === currentMiniDrawId;
          }
        }
      }
      return false;
    });

    // If participation entry exists, use it (includes packages + upsells)
    if (participationEntry && participationEntry.totalEntries > 0) {
      // Total entries = lastMonthAccumulatedEntries (for all) + participationEntries (for this specific minidraw)
      return lastMonthAccumulatedEntries + participationEntry.totalEntries;
    }

    // Fallback to old calculation for backward compatibility (if participation entry doesn't exist)
    // Sum active minidraw package entries ONLY for this specific minidraw
    const userMiniDrawPackages = (
      userData as {
        miniDrawPackages?: Array<{
          isActive: boolean;
          miniDrawId?: string | { toString(): string };
          entriesGranted?: number;
        }>;
      }
    ).miniDrawPackages;
    const activeMiniDrawPackageEntries =
      userMiniDrawPackages?.reduce((sum, pkg) => {
        if (!pkg.isActive) return sum;

        // Check if this package belongs to the current minidraw
        const pkgMiniDrawId = pkg.miniDrawId
          ? typeof pkg.miniDrawId === "string"
            ? pkg.miniDrawId
            : pkg.miniDrawId.toString()
          : null;

        // Only count entries if miniDrawId matches (skip if null/undefined for backward compatibility)
        if (pkgMiniDrawId && pkgMiniDrawId === currentMiniDrawId) {
          return sum + (pkg.entriesGranted || 0);
        }

        return sum;
      }, 0) || 0;

    // Total entries = lastMonthAccumulatedEntries (for all) + activeMiniDrawPackageEntries (for this specific minidraw)
    return lastMonthAccumulatedEntries + activeMiniDrawPackageEntries;
  };

  const calculatedUserEntryCount = calculateUserEntryCount();

  // Extract default payment method from payment methods list
  const defaultPaymentMethod = paymentMethods?.find((pm) => pm.isDefault) || paymentMethods?.[0];

  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);
  const [hoveredPackageId, setHoveredPackageId] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Payment processing state
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [processingPackageName, setProcessingPackageName] = useState<string>("");
  const [upsellTriggered, setUpsellTriggered] = useState(false);
  const [originalPurchaseContext, setOriginalPurchaseContext] = useState<OriginalPurchaseContext | null>(null);
  const [successToastShown, setSuccessToastShown] = useState(false); // Guard to prevent duplicate toasts
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Get selected package for modal
  const selectedPackage = selectedPackageId ? miniDrawPackages.find((p) => p._id === selectedPackageId) : null;

  // Remaining capacity guard for client-side disablement
  const entriesRemaining =
    typeof minimumEntries === "number" && typeof totalEntries === "number"
      ? Math.max(minimumEntries - totalEntries, 0)
      : undefined;
  const isSoldOut = entriesRemaining !== undefined && entriesRemaining <= 0;

  const handlePurchase = async (packageId: string) => {
    // ✅ AUTHENTICATION-ONLY: Check if user is authenticated (not membership)
    if (!session?.user) {
      setShowLoginModal(true);
      return;
    }

    // Get the package details
    const pkg = miniDrawPackages.find((p) => p._id === packageId);
    if (!pkg) {
      showToast({
        type: "error",
        title: "Package Not Found",
        message: "The selected package could not be found. Please try again.",
      });
      return;
    }

    const entryCount = pkg.entries;

    // Cancel any outgoing refetches to prevent race conditions
    await queryClient.cancelQueries({ queryKey: queryKeys.miniDraws.detail(miniDrawId) });
    await queryClient.cancelQueries({ queryKey: queryKeys.miniDraws.entries(miniDrawId) });
    await queryClient.cancelQueries({ queryKey: queryKeys.miniDraws.userEntries("current-user") });
    await queryClient.cancelQueries({ queryKey: queryKeys.users.account("current-user") });

    // Snapshot previous values for rollback
    const previousMiniDraw = queryClient.getQueryData<MiniDrawType>(queryKeys.miniDraws.detail(miniDrawId));
    const previousUserAccount = queryClient.getQueryData(queryKeys.users.account("current-user"));

    // Optimistically update minidraw cache
    queryClient.setQueryData<MiniDrawType>(queryKeys.miniDraws.detail(miniDrawId), (old) => {
      if (!old) return old;
      return {
        ...old,
        totalEntries: (old.totalEntries || 0) + entryCount,
        entriesRemaining: Math.max(
          (old.entriesRemaining ?? (old.minimumEntries ?? 0) - (old.totalEntries || 0)) - entryCount,
          0
        ),
        userEntryCount: (old.userEntryCount || 0) + entryCount,
        isProcessing: true,
      };
    });

    // Optimistically update user account cache
    queryClient.setQueryData(queryKeys.users.account("current-user"), (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      const oldData = old as Record<string, unknown>;
      const oldUser = oldData.user as Record<string, unknown>;
      return {
        ...oldData,
        user: {
          ...oldUser,
          isProcessing: true,
        },
      };
    });

    try {
      setPurchasingPackageId(packageId);

      // Check if user has default payment method for automatic charging
      const hasDefaultPayment = !!defaultPaymentMethod?.paymentMethodId;
      const useDefaultPayment = hasDefaultPayment;
      const paymentMethodId = hasDefaultPayment ? defaultPaymentMethod.paymentMethodId : undefined;

      // console.log("🛒 Mini draw purchase:", {
      //   packageId,
      //   miniDrawId,
      //   useDefaultPayment,
      //   hasPaymentMethod: !!paymentMethodId,
      // });

      const response = await fetch("/api/mini-draw/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          packageId,
          miniDrawId,
          useDefaultPayment,
          paymentMethodId,
        }),
      });

      const data = await response.json();

      // ✅ CRITICAL: Only proceed if response is OK and payment actually succeeded
      if (!response.ok) {
        const errorMessage = data.error || data.details || "Purchase failed";
        throw new Error(errorMessage);
      }

      // ✅ CRITICAL: Only show success if payment actually succeeded
      if (!data.success) {
        throw new Error(data.error || data.details || "Payment failed");
      }

      // Extract paymentIntentId from response
      let extractedPaymentIntentId: string | null = null;
      if (data.data?.paymentIntentId) {
        extractedPaymentIntentId = data.data.paymentIntentId;
      } else if (data.paymentIntent?.id) {
        extractedPaymentIntentId = data.paymentIntent.id;
      } else if (data.paymentIntentId) {
        extractedPaymentIntentId = data.paymentIntentId;
      }

      // ✅ CRITICAL: Only show PaymentProcessingScreen if we have a valid payment intent
      // This means payment was created and we're waiting for webhook confirmation
      if (extractedPaymentIntentId) {
        // Reset success toast guard for new purchase
        setSuccessToastShown(false);

        setPaymentIntentId(extractedPaymentIntentId);
        setProcessingPackageName(pkg.name);
        setShowPaymentProcessing(true);

        // Store original purchase context for upsell (only after webhook confirms)
        setOriginalPurchaseContext({
          paymentIntentId: extractedPaymentIntentId,
          packageId: pkg._id,
          packageName: pkg.name,
          packageType: "mini-draw",
          price: pkg.price,
          entries: pkg.entries,
          miniDrawId,
        });
      } else {
        // No payment intent means payment failed at creation
        throw new Error("Payment intent creation failed");
      }
    } catch (error) {
      console.error("❌ Purchase error:", error);
      const errorMessage = error instanceof Error ? error.message : "Purchase failed";

      // Rollback optimistic updates on error
      if (previousMiniDraw) {
        queryClient.setQueryData(queryKeys.miniDraws.detail(miniDrawId), previousMiniDraw);
      }
      if (previousUserAccount) {
        queryClient.setQueryData(queryKeys.users.account("current-user"), previousUserAccount);
      }

      // Close payment processing screen if it was open
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);

      // Show error toast - user can retry by clicking purchase again
      showToast({
        type: "error",
        title: "Purchase Failed",
        message: `${errorMessage}. Please try again.`,
        duration: 5000, // Show longer so user can read
      });
    } finally {
      setPurchasingPackageId(null);
    }
  };

  // Handle payment processing success - ONLY called when webhook confirms payment
  const handlePaymentProcessingSuccess = async (status: PaymentStatusResponse) => {
    // console.log("🎉 Payment processing completed successfully:", status);

    // ✅ CRITICAL: Prevent duplicate toast notifications
    // This function can be called multiple times:
    // 1. From polling when payment is processed
    // 2. From fallback timer in PaymentProcessingScreen
    // We only want to show the toast once
    if (successToastShown) {
      // console.log("⏭️ Success toast already shown, skipping duplicate");
      return;
    }

    setShowPaymentProcessing(false);

    // ✅ ONLY show success when webhook confirms payment completed
    if (status.status === "completed") {
      // Mark toast as shown to prevent duplicates
      setSuccessToastShown(true);

      // Track Purchase event client-side for Meta Pixel Helper visibility
      // IMPORTANT: Always track when payment is completed, even if status.data is incomplete
      // Use IIFE to handle async import
      (async () => {
        try {
          // Get paymentIntentId from status.data or fallback
          const paymentIntentId = status.data?.paymentIntentId || `order-${Date.now()}`;

          // Get package details - use purchasingPackageId from state as fallback
          const pkg = miniDrawPackages.find((p) => p._id === purchasingPackageId);
          const packageName = status.data?.packageName || processingPackageName || pkg?.name || "Mini Draw Package";
          const value = pkg?.price || 0;
          const currency = "AUD";

          // Generate EventID matching server-side format for deduplication
          const eventID = `purchase_${paymentIntentId}_${Date.now()}`;

          // Import trackFacebookEvent dynamically to avoid SSR issues
          const { trackFacebookEvent } = await import("@/components/FacebookPixel");

          // Track Purchase event with EventID - always use "mini-draw" as package_type
          trackFacebookEvent("Purchase", {
            eventID,
            value,
            currency,
            order_id: paymentIntentId,
            content_type: "mini_draw_package",
            content_ids: purchasingPackageId ? [purchasingPackageId] : [],
            num_items: 1,
            content_name: packageName,
            package_type: "mini-draw",
            package_id: purchasingPackageId,
            package_name: packageName,
            payment_intent_id: paymentIntentId,
            platform: "tools-australia",
          });

          // console.log(`📘 Facebook Pixel: Mini-draw Purchase tracked - $${value} ${currency} (EventID: ${eventID})`);
        } catch (pixelError) {
          console.error("❌ Error tracking Mini-draw Purchase client-side:", pixelError);
          // Non-blocking - continue with success flow
        }
      })();

      // Clear processing flags
      queryClient.setQueryData<MiniDrawType>(queryKeys.miniDraws.detail(miniDrawId), (old) => {
        if (!old) return old;
        return {
          ...old,
          isProcessing: false,
        };
      });

      queryClient.setQueryData(queryKeys.users.account("current-user"), (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as Record<string, unknown>;
        return {
          ...oldData,
          user: {
            ...(oldData.user as Record<string, unknown>),
            isProcessing: false,
          },
        };
      });

      // Invalidate queries to refetch fresh data after webhook processing
      // Delay to allow webhook to complete processing
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.miniDraws.detail(miniDrawId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.miniDraws.entries(miniDrawId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.miniDraws.userEntries("current-user") });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current-user") });
        queryClient.refetchQueries({ queryKey: queryKeys.miniDraws.detail(miniDrawId) });
      }, 2000); // Wait 2 seconds for webhook to complete

      // Show success message (only once)
      showToast({
        type: "success",
        title: `Successfully purchased ${processingPackageName}!`,
        message: "Your entries have been added to the mini draw.",
      });

      // Trigger upsell after successful payment processing (only after webhook confirms)
      if (!upsellTriggered && originalPurchaseContext) {
        setUpsellTriggered(true);

        setTimeout(() => {
          triggerUpsellModal(
            "mini-draw-purchase",
            originalPurchaseContext.packageName,
            originalPurchaseContext.price,
            originalPurchaseContext.packageId,
            "mini-draw"
          );
        }, 2000);
      }
    } else {
      // Payment failed during processing
      showToast({
        type: "error",
        title: "Payment Processing Failed",
        message: "Your payment could not be processed. Please try again.",
        duration: 5000,
      });
    }
  };

  // Handle payment processing error - called when webhook fails or payment fails
  const handlePaymentProcessingError = (error: string) => {
    console.error("❌ Payment processing failed:", error);
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);

    // Show error with clear message for retry
    showToast({
      type: "error",
      title: "Payment Failed",
      message: error || "Your payment could not be processed. Please try again.",
      duration: 5000,
    });
  };

  // Handle payment processing timeout - payment may still be processing
  const handlePaymentProcessingTimeout = () => {
    // console.warn("⏰ Payment processing timed out - webhook may still be processing");
    setShowPaymentProcessing(false);

    // Inform user that payment is being processed but may take longer
    showToast({
      type: "info",
      title: "Payment Processing",
      message:
        "Your payment is being processed. Please check your account in a few moments. If the issue persists, contact support.",
      duration: 8000,
    });
  };

  // Trigger upsell modal (similar to MembershipModal)
  const triggerUpsellModal = async (
    triggerEvent: "membership-purchase" | "ticket-purchase" | "one-time-purchase" | "mini-draw-purchase",
    recentPurchase: string,
    purchaseAmount: number,
    packageId?: string,
    packageType?: "membership" | "one-time" | "mini-draw"
  ) => {
    try {
      if (packageId && packageType) {
        // console.log(`🎯 Triggering targeted upsell for package: ${packageId} (${packageType})`);

        const isMiniDrawPackage = packageId.startsWith("mini-pack-");
        const userType = isMiniDrawPackage ? "mini-draw-buyer" : isAuthenticated ? "returning-user" : "new-user";

        // Map mini-draw to one-time for upsell trigger API (it only accepts subscription or one-time)
        const upsellPackageType = packageType === "mini-draw" ? "one-time" : packageType;
        const upsellTriggerEvent = triggerEvent === "mini-draw-purchase" ? "one-time-purchase" : triggerEvent;

        const response = await fetch("/api/upsell/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId,
            packageType: upsellPackageType,
            userType,
            isMember: isAuthenticated,
            triggerEvent: upsellTriggerEvent,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.offer) {
            const offer = result.data.offer;

            const upsellOffer: UpsellOffer = {
              id: offer.id,
              title: offer.name,
              description: offer.description,
              category: offer.category as "major-draw" | "mini-draw" | "membership",
              originalPrice: offer.originalPrice,
              discountedPrice: offer.discountedPrice,
              discountPercentage: offer.discountPercentage,
              entriesCount: offer.entriesCount,
              buttonText: offer.buttonText,
              conditions: offer.conditions,
              urgencyText: offer.urgencyText,
              validUntil: offer.validUntil,
              priority: offer.priority,
              imageUrl: offer.imageUrl,
              isActive: offer.isActive,
              targetAudience: offer.targetAudience || ["all-users"],
              userSegments: offer.userSegments || ["new-user", "returning-user"],
              maxShowsPerUser: offer.maxShowsPerUser || 3,
              cooldownHours: offer.cooldownHours || 24,
            };

            const userContext: UpsellUserContext = {
              userId: userData?._id || undefined,
              isAuthenticated: isAuthenticated,
              hasDefaultPayment: isAuthenticated && !!defaultPaymentMethod?.paymentMethodId,
              recentPurchase: recentPurchase,
              userType: isAuthenticated ? "returning-user" : "new-user",
              totalSpent: purchaseAmount,
              upsellsShown: 0,
            };

            if (!isAuthenticated) {
              const { setPendingUpsellAfterSetup } = useModalPriorityStore.getState();
              setPendingUpsellAfterSetup(true, {
                offer: upsellOffer,
                userContext,
                originalPurchaseContext: originalPurchaseContext || undefined,
              });
            } else {
              setTimeout(() => {
                const { requestModal } = useModalPriorityStore.getState();
                requestModal("upsell", false, {
                  offer: upsellOffer,
                  userContext,
                  originalPurchaseContext: originalPurchaseContext || undefined,
                });
              }, 1000);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to trigger upsell:", error);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-2 sm:p-4">
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Package className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-red-600" />
          <h3 className="text-sm sm:text-lg font-bold text-gray-900">Purchase Entries</h3>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
          <span className="text-gray-600">Your Entries:</span>
          <span className="font-semibold text-[#ee0000]">
            {calculatedUserEntryCount.toLocaleString()} {calculatedUserEntryCount === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>
      {entriesRemaining !== undefined && (
        <div
          className={`mb-2 sm:mb-4 text-[10px] sm:text-sm font-semibold ${
            isSoldOut ? "text-red-600" : "text-gray-700"
          } text-center`}
        >
          {isSoldOut ? "Sold out — no more entries available." : `Only ${entriesRemaining} entries remaining.`}
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {miniDrawPackages.map((pkg) => (
          <div key={pkg._id} className="relative group" data-package-id={pkg._id}>
            {/* Compact Button with Info Icon */}
            <div className="relative z-0">
              <button
                onMouseEnter={() => {
                  // On desktop: hover shows quick tooltip
                  setHoveredPackageId(pkg._id);
                }}
                onMouseLeave={() => {
                  // On desktop: hide tooltip when mouse leaves (but not if modal is open)
                  if (selectedPackageId !== pkg._id) {
                    setHoveredPackageId(null);
                  }
                }}
                onClick={() => {
                  // On click (desktop & mobile): open modal
                  setSelectedPackageId(pkg._id);
                }}
                disabled={
                  purchasingPackageId === pkg._id ||
                  isSoldOut ||
                  (entriesRemaining !== undefined && pkg.entries > entriesRemaining)
                }
                className="w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 text-black py-2 sm:py-3 px-2 sm:px-3 rounded-md sm:rounded-lg font-bold text-xs sm:text-sm hover:from-yellow-500 hover:via-orange-500 hover:to-red-500 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {purchasingPackageId === pkg._id ? (
                  <div className="flex items-center justify-center gap-1">
                    <div className="animate-spin rounded-full h-2.5 w-2.5 sm:h-4 sm:w-4 border-2 border-black border-t-transparent"></div>
                    <span className="text-[9px] sm:text-xs">Processing...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                    <div className="text-xs sm:text-base font-semibold leading-tight">${pkg.price}</div>
                    <div className="text-[10px] sm:text-sm font-medium opacity-90 leading-tight">
                      {pkg.entries} Entries
                    </div>
                    {entriesRemaining !== undefined && pkg.entries > entriesRemaining && (
                      <span className="text-[9px] sm:text-xs font-semibold text-red-700 leading-tight">
                        Only {entriesRemaining} left
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* Info Icon Button */}
              <button
                onMouseEnter={() => {
                  // On desktop: hover shows quick tooltip
                  setHoveredPackageId(pkg._id);
                }}
                onMouseLeave={() => {
                  // On desktop: hide tooltip when mouse leaves (but not if modal is open)
                  if (selectedPackageId !== pkg._id) {
                    setHoveredPackageId(null);
                  }
                }}
                className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 z-20"
                onClick={(e) => {
                  e.stopPropagation();
                  // Open modal on click
                  setSelectedPackageId(pkg._id);
                }}
              >
                <Info className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[10px] sm:text-sm" />
              </button>

              {/* Small hover tooltip - appears on hover for quick info (desktop only) */}
              {hoveredPackageId === pkg._id && selectedPackageId !== pkg._id && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 w-[200px] sm:w-64 bg-gray-900 text-white text-xs sm:text-sm rounded-lg p-2 sm:p-3 shadow-xl pointer-events-none">
                  <div className="font-semibold text-yellow-400 mb-1">{pkg.name}</div>
                  <div className="text-gray-300">
                    ${pkg.price} • {pkg.entries} Entries
                  </div>
                  {pkg.partnerDiscountDays > 0 && (
                    <div className="text-green-400 text-[10px] sm:text-xs mt-1">
                      {pkg.partnerDiscountDays >= 1
                        ? `${pkg.partnerDiscountDays} ${pkg.partnerDiscountDays === 1 ? "day" : "days"} discounts`
                        : `${pkg.partnerDiscountHours} ${pkg.partnerDiscountHours === 1 ? "hour" : "hours"} discounts`}
                    </div>
                  )}
                  {/* Arrow pointing down */}
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Package Details Modal */}
      {selectedPackage && (
        <MiniDrawPackageModal
          isOpen={selectedPackageId === selectedPackage._id}
          onClose={() => {
            setSelectedPackageId(null);
            setHoveredPackageId(null);
          }}
          package={selectedPackage}
          onPurchase={() => {
            setSelectedPackageId(null);
            setHoveredPackageId(null);
            handlePurchase(selectedPackage._id);
          }}
          isPurchasing={purchasingPackageId === selectedPackage._id}
          disabled={false}
        />
      )}

      {/* Payment Processing Screen */}
      {showPaymentProcessing && paymentIntentId && (
        <PaymentProcessingScreen
          paymentIntentId={paymentIntentId}
          packageName={processingPackageName}
          packageType="mini-draw"
          isVisible={showPaymentProcessing}
          onSuccess={handlePaymentProcessingSuccess}
          onError={handlePaymentProcessingError}
          onTimeout={handlePaymentProcessingTimeout}
        />
      )}

      {/* Login Prompt Modal */}
      <LoginPromptModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
}
