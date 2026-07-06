"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { usePaymentMethods } from "@/hooks/queries/usePaymentQueries";
import { useUserContext } from "@/contexts/UserContext";
import type { PaymentStatusResponse } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import type { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { getPackageBaseEntries } from "@/utils/payment/package-base-entries";
import { getReceiptLabel } from "@/utils/membership/getReceiptLabel";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { MiniDrawType } from "@/types/mini-draw";
import { useAttribution } from "@/hooks/useAttribution";

interface UseMiniDrawPurchaseArgs {
  miniDrawId: string;
  /** Draw target — used for the client-side capacity guard. */
  minimumEntries?: number;
  /** Current filled entries — used for the client-side capacity guard. */
  totalEntries?: number;
}

/**
 * The mini-draw entry-pack purchase money path, extracted from `MiniDrawPackages`
 * so multiple surfaces (the `/mini-draws/[id]` detail page and the dashboard Draws
 * tab entry sheet) share ONE orchestration — never a fork. Owns the full flow:
 * optimistic cache bump → `POST /api/mini-draw/purchase` (webhook-only granting) →
 * 3DS / no-saved-card branches → `PaymentProcessingScreen` polling → success toast +
 * cache invalidation + post-purchase upsell.
 *
 * The consuming component renders `PaymentProcessingScreen` and `LoginPromptModal`
 * from the returned state; this hook holds none of the pack-grid presentation.
 */
export function useMiniDrawPurchase({ miniDrawId, minimumEntries, totalEntries }: UseMiniDrawPurchaseArgs) {
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

  // Extract default payment method for automatic charging.
  const defaultPaymentMethod = paymentMethods?.find((pm) => pm.isDefault) || paymentMethods?.[0];

  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);

  // Payment processing state.
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [processingPackageName, setProcessingPackageName] = useState<string>("");
  const [upsellTriggered, setUpsellTriggered] = useState(false);
  const [originalPurchaseContext, setOriginalPurchaseContext] = useState<OriginalPurchaseContext | null>(null);
  const [successToastShown, setSuccessToastShown] = useState(false); // Guard to prevent duplicate toasts
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Remaining capacity guard for client-side disablement.
  const entriesRemaining =
    typeof minimumEntries === "number" && typeof totalEntries === "number"
      ? Math.max(minimumEntries - totalEntries, 0)
      : undefined;
  const isSoldOut = entriesRemaining !== undefined && entriesRemaining <= 0;
  const isExceedsCapacity = (entries: number) => entriesRemaining !== undefined && entries > entriesRemaining;

  // When navigating between mini draws, reset purchase/upsell state so nothing leaks across draws.
  useEffect(() => {
    setPurchasingPackageId(null);
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
    const pkg = getMiniDrawPackageById(packageId);
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
    // ✅ CRITICAL: Prevent duplicate toast notifications (polling + fallback timer can both fire)
    if (successToastShown) {
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
      const purchasedPackageId = originalPurchaseContext?.packageId;
      if (miniDrawPaymentIntentId && typeof miniDrawPrice === "number" && miniDrawPrice > 0) {
        trackConversion(
          buildPurchaseEvent({
            value: miniDrawPrice,
            currency: status.data?.currency ?? "AUD",
            eventId: miniDrawPaymentIntentId,
            customData: {
              orderId: miniDrawPaymentIntentId,
              contentType: "product",
              contentIds: purchasedPackageId ? [purchasedPackageId] : undefined,
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

      // Invalidate queries to refetch fresh data after webhook processing.
      // Delay to allow webhook to complete processing.
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

  // Trigger upsell modal (mirrors MembershipModal post-purchase upsell)
  const triggerUpsellModal = async (
    triggerEvent: "membership-purchase" | "ticket-purchase" | "one-time-purchase" | "mini-draw-purchase",
    recentPurchase: string,
    purchaseAmount: number,
    packageId?: string,
    packageType?: "membership" | "one-time" | "mini-draw"
  ) => {
    try {
      if (packageId && packageType) {
        // This hook exclusively sells mini-draw packs, so every buyer here is a
        // "mini-draw-buyer" — the segment every mini upsell record requires.
        const userType = packageType === "mini-draw" ? "mini-draw-buyer" : isAuthenticated ? "returning-user" : "new-user";

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

  return {
    /** Kick off a purchase for a pack id (opens login modal if unauthenticated). */
    purchase: handlePurchase,
    /** The pack id currently being charged (for per-pack spinner state), or null. */
    purchasingPackageId,
    /** Remaining capacity (undefined if unknown). */
    entriesRemaining,
    isSoldOut,
    isExceedsCapacity,
    /** PaymentProcessingScreen wiring — spread the handlers onto the component. */
    paymentProcessing: {
      show: showPaymentProcessing,
      paymentIntentId,
      packageName: processingPackageName,
      onSuccess: handlePaymentProcessingSuccess,
      onError: handlePaymentProcessingError,
      onTimeout: handlePaymentProcessingTimeout,
    },
    /** LoginPromptModal wiring. */
    loginModal: {
      open: showLoginModal,
      setOpen: setShowLoginModal,
    },
  };
}
