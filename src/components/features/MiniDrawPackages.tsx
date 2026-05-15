"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Package, Info } from "lucide-react";
import { getMiniDrawPackages } from "@/data/miniDrawPackages";
import { useToast } from "@/components/ui/Toast";
import { usePaymentMethods } from "@/hooks/queries/usePaymentQueries";
import { useUserContext } from "@/contexts/UserContext";
import PaymentProcessingScreen from "@/components/loading/PaymentProcessingScreen";
import type { PaymentStatusResponse } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import type { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { getPackageBaseEntries } from "@/utils/payment/package-base-entries";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getReceiptLabel } from "@/utils/membership/getReceiptLabel";
import MiniDrawPackageModal from "@/components/modals/MiniDrawPackageModal";
import LoginPromptModal from "@/components/modals/LoginPromptModal";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { MiniDrawType } from "@/types/mini-draw";
import { useAttribution } from "@/hooks/useAttribution";

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
  const attribution = useAttribution();
  const { data: paymentMethodsData } = usePaymentMethods(userData?._id);
  const paymentMethods = !paymentMethodsData
    ? undefined
    : Array.isArray(paymentMethodsData)
      ? paymentMethodsData
      : paymentMethodsData.paymentMethods;
  const queryClient = useQueryClient();

  // Mini-draw catalog is intentionally NOT tier-gated: every visitor (signed-in or not,
  // member or not, entrant or not) sees all 8 active packs (Mini Pack 1–3 + the five
  // mini-scoped Additional packs). Login is enforced at purchase time via LoginPromptModal.
  const viewerPackages = getMiniDrawPackages();

  /**
   * Calculate user's entry count for this specific minidraw
   * Uses miniDrawParticipation as the single source of truth (includes packages + upsells)
   * Falls back to old calculation for backward compatibility
   * Same calculation as ProductCard badge
   */
  const calculateUserEntryCount = (): number => {
    if (!isAuthenticated || !userData) return userEntryCount || 0;

    // Mini draw eligibility is package-only: only purchased mini pack entries count (no member entries).
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

    // If participation entry exists, use it (packages + upsells only; no member entries)
    if (participationEntry && participationEntry.totalEntries > 0) {
      return participationEntry.totalEntries;
    }

    // Fallback: sum active minidraw package entries for this specific minidraw only
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

        const pkgMiniDrawId = pkg.miniDrawId
          ? typeof pkg.miniDrawId === "string"
            ? pkg.miniDrawId
            : pkg.miniDrawId.toString()
          : null;

        if (pkgMiniDrawId && pkgMiniDrawId === currentMiniDrawId) {
          return sum + (pkg.entriesGranted || 0);
        }

        return sum;
      }, 0) || 0;

    return activeMiniDrawPackageEntries;
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
  const selectedPackage = selectedPackageId ? viewerPackages.find((p) => p._id === selectedPackageId) : null;

  // Remaining capacity guard for client-side disablement
  const entriesRemaining =
    typeof minimumEntries === "number" && typeof totalEntries === "number"
      ? Math.max(minimumEntries - totalEntries, 0)
      : undefined;
  const isSoldOut = entriesRemaining !== undefined && entriesRemaining <= 0;

  // When navigating between mini draws, reset purchase/upsell state so nothing leaks across routes.
  useEffect(() => {
    setPurchasingPackageId(null);
    setHoveredPackageId(null);
    setSelectedPackageId(null);
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
    setProcessingPackageName("");
    setUpsellTriggered(false);
    setOriginalPurchaseContext(null);
    setSuccessToastShown(false);
  }, [miniDrawId]);

  const handlePurchase = async (packageId: string) => {
    // ✅ AUTHENTICATION-ONLY: Check if user is authenticated (not membership)
    if (!session?.user) {
      setShowLoginModal(true);
      return;
    }

    // Get the package details
    const pkg = viewerPackages.find((p) => p._id === packageId);
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
      // Each new checkout can show the post-purchase upsell (same or different pack on this draw)
      setUpsellTriggered(false);

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
          ...(attribution && { attribution }),
        }),
      });

      const data = await response.json();

      // ✅ CRITICAL: Only proceed if response is OK and payment actually succeeded
      if (!response.ok) {
        const errorMessage = data.error || data.details || "Purchase failed";
        throw new Error(errorMessage);
      }

      // 3D Secure or bank auth — do not start webhook polling; payment is not complete yet
      if (!data.success && data.requiresAction) {
        if (previousMiniDraw) {
          queryClient.setQueryData(queryKeys.miniDraws.detail(miniDrawId), previousMiniDraw);
        }
        if (previousUserAccount) {
          queryClient.setQueryData(queryKeys.users.account("current-user"), previousUserAccount);
        }
        showToast({
          type: "info",
          title: "Complete authentication",
          message:
            "Your bank may require 3D Secure to authorise this payment. Please try again and complete any verification. If the issue continues, add or update your card in your account settings.",
          duration: 8000,
        });
        return;
      }

      // ✅ CRITICAL: Only show success if payment actually succeeded
      if (!data.success) {
        throw new Error(data.error || data.details || "Payment failed");
      }

      // Unconfirmed intent (no saved card): API returns a client_secret for future Elements flow; do not poll for BenefitsGranted
      if (data.requiresPayment) {
        if (previousMiniDraw) {
          queryClient.setQueryData(queryKeys.miniDraws.detail(miniDrawId), previousMiniDraw);
        }
        if (previousUserAccount) {
          queryClient.setQueryData(queryKeys.users.account("current-user"), previousUserAccount);
        }
        showToast({
          type: "info",
          title: "Payment method required",
          message: "Add a default payment method in your account, then return here to complete your purchase.",
          duration: 8000,
        });
        return;
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
        setProcessingPackageName(getReceiptLabel(pkg));
        setShowPaymentProcessing(true);

        // Store original purchase context for upsell (only after webhook confirms)
        // Get base entries for upsell calculation
        const baseEntries = getPackageBaseEntries({
          packageId: pkg._id,
          packageType: "mini-draw",
        });

        setOriginalPurchaseContext({
          paymentIntentId: extractedPaymentIntentId,
          packageId: pkg._id,
          packageName: pkg.name,
          packageType: "mini-draw",
          price: pkg.price,
          entries: pkg.entries,
          baseEntries,
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

      // Fire browser-side Purchase pixel via the provider registry, deduped against
      // the server-side CAPI event (which the webhook fires with the same paymentIntentId
      // as event_id). Meta's eventID dedup mechanism is DESIGNED for both sides to fire —
      // skipping the browser side loses _fbc/_fbp cookies and tanks Event Match Quality.
      const miniDrawPaymentIntentId = status.data?.paymentIntentId;
      const miniDrawPrice = status.data?.price;
      if (miniDrawPaymentIntentId && typeof miniDrawPrice === "number" && miniDrawPrice > 0) {
        trackConversion(
          buildPurchaseEvent({
            value: miniDrawPrice,
            currency: status.data?.currency ?? "AUD",
            eventId: miniDrawPaymentIntentId,
            customData: {
              orderId: miniDrawPaymentIntentId,
              contentType: "product",
              contentIds: selectedPackageId ? [selectedPackageId] : undefined,
              numItems: 1,
              packageType: status.data?.packageType ?? "mini-draw",
            },
            eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
          }),
        );
      }

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
        message: "Your free entries have been added to the mini draw.",
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

  const isExceedsCapacity = (entries: number) =>
    entriesRemaining !== undefined && entries > entriesRemaining;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-red-600 to-red-675 flex items-center justify-center">
            <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Choose Your Pack</h3>
        </div>
        {calculatedUserEntryCount > 0 && (
          <div className="flex items-center gap-1 bg-green-50 border border-green-100 rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1">
            <span className="text-2xs sm:text-xs font-bold text-green-700">
              {calculatedUserEntryCount.toLocaleString()}{" "}
              {calculatedUserEntryCount === 1 ? "free entry" : "free entries"}
            </span>
          </div>
        )}
      </div>

      {/* Remaining / Sold Out */}
      {entriesRemaining !== undefined && (
        <div
          className={`mb-3 sm:mb-4 text-center text-2xs sm:text-xs font-medium px-3 py-1.5 rounded-lg ${
            isSoldOut
              ? "bg-red-50 dark:bg-red-950/35 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/40"
              : "bg-gray-50 dark:bg-neutral-800/80 text-gray-600 dark:text-neutral-300 border border-gray-100 dark:border-neutral-700"
          }`}
        >
          {isSoldOut
            ? "Sold out — no more free entries available."
            : `Only ${entriesRemaining.toLocaleString()} free entries remaining`}
        </div>
      )}

      {/* Package Grid */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
        {viewerPackages.map((pkg) => {
          const disabled =
            purchasingPackageId === pkg._id || isSoldOut || isExceedsCapacity(pkg.entries);
          const isProcessing = purchasingPackageId === pkg._id;
          const isHighValue = pkg.price >= 100;
          const partnerCatalogPct = getPartnerCatalogAccessPercentForPlanId(pkg._id);

          return (
            <div key={pkg._id} className="relative" data-package-id={pkg._id}>
              <div className="relative">
                <button
                  onMouseEnter={() => setHoveredPackageId(pkg._id)}
                  onMouseLeave={() => {
                    if (selectedPackageId !== pkg._id) setHoveredPackageId(null);
                  }}
                  onClick={() => setSelectedPackageId(pkg._id)}
                  disabled={disabled}
                  title={`${partnerCatalogPct}% partner catalog · ${pkg.entries} free entries · $${pkg.price}`}
                  className={`
                    w-full relative overflow-hidden rounded-lg sm:rounded-xl transition-all duration-300
                    ${disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:scale-105 hover:shadow-lg active:scale-[0.97]"
                    }
                    ${isHighValue
                      ? "bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-600 shadow-md shadow-amber-500/20"
                      : "bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 shadow-sm shadow-yellow-400/15"
                    }
                  `}
                  suppressHydrationWarning
                >
                  <div className="py-2 sm:py-3 px-1 sm:px-2">
                    {isProcessing ? (
                      <div className="flex flex-col items-center justify-center gap-1 py-1">
                        <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-black/20 border-t-black" />
                        <span className="text-3xs sm:text-2xs text-black/60 font-medium">
                          Processing
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                        {/* Price */}
                        <span className="text-sm sm:text-lg font-extrabold leading-none tracking-tight text-black">
                          ${pkg.price}
                        </span>

                        {/* Free entries */}
                        <span className="text-3xs sm:text-xs font-bold leading-tight text-black/70">
                          {pkg.entries} {pkg.entries === 1 ? "free entry" : "free entries"}
                        </span>

                        {/* Capacity warning */}
                        {isExceedsCapacity(pkg.entries) && (
                          <span className="text-3xs sm:text-2xs font-bold text-red-800 leading-tight mt-0.5">
                            {entriesRemaining} left
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Shine overlay for high-value */}
                  {isHighValue && !disabled && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 pointer-events-none" />
                  )}
                </button>

                {/* Info dot */}
                <button
                  onMouseEnter={() => setHoveredPackageId(pkg._id)}
                  onMouseLeave={() => {
                    if (selectedPackageId !== pkg._id) setHoveredPackageId(null);
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full flex items-center justify-center shadow-md transition-all duration-200 hover:scale-110 z-20 bg-red-600 text-white hover:bg-red-675"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPackageId(pkg._id);
                  }}
                  suppressHydrationWarning
                >
                  <Info className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                </button>

                {/* Hover tooltip (desktop) */}
                {hoveredPackageId === pkg._id && selectedPackageId !== pkg._id && (
                  <div className="hidden sm:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 w-56 bg-gray-900 text-white text-sm rounded-xl p-3 shadow-2xl pointer-events-none">
                    <div className="font-bold text-yellow-400 mb-1">{pkg.displayName ?? pkg.name}</div>
                    <div className="text-gray-300 text-xs">
                      ${pkg.price} &middot; {pkg.entries}{" "}
                      {pkg.entries === 1 ? "free entry" : "free entries"}
                    </div>
                    <div className="text-cyan-300 text-xs mt-1.5 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-cyan-300 inline-block shrink-0" />
                      {partnerCatalogPct}% of partner catalog
                    </div>
                    {(pkg.partnerDiscountDays > 0 || pkg.partnerDiscountHours > 0) && (
                      <div className="text-green-400 text-xs mt-1.5 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-green-400 inline-block shrink-0" />
                        {pkg.partnerDiscountDays >= 1
                          ? `${pkg.partnerDiscountDays} ${pkg.partnerDiscountDays === 1 ? "day" : "days"} partner access`
                          : `${pkg.partnerDiscountHours} ${pkg.partnerDiscountHours === 1 ? "hour" : "hours"} partner access`}
                      </div>
                    )}
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
          onStillProcessingDismiss={handlePaymentProcessingTimeout}
        />
      )}

      {/* Login Prompt Modal */}
      <LoginPromptModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
}
