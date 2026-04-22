"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { CheckCircle, ChevronDown, CreditCard, Loader2 } from "lucide-react";
import { Elements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripe-client";
import { StripeInlineCardSetupForm } from "@/components/payment/StripeInlineCardSetupForm";
import { formatDisplayName } from "@/utils/display-name";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import type { UpsellOffer, UpsellModalProps } from "@/types/upsell";
import { useUserContext } from "@/contexts/UserContext";
import { usePaymentMethods } from "@/hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useLoading } from "@/contexts/LoadingContext";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse, type SavedPaymentMethod } from "@/hooks/queries";
import { usePurchaseUpsell } from "@/hooks/queries/useUpsellQueries";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useToast } from "@/components/ui/Toast";
import { rewardsEnabled } from "@/config/featureFlags";
import { getPartnerDiscountBenefitTextForPackageId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { resolveUpsellImage } from "@/utils/upsell/upsell-image-selector";
import { getUpsellPackageById } from "@/data/upsellPackages";
import {
  calculateUpsellEntries,
  calculateUpsellEntriesFromContext,
  getPackageBaseEntries,
} from "@/utils/payment/upsell-entries-calculator";
import {
  pickTriggeringPackageIdForUpsell,
  resolveUpsellPromoMultiplierForDisplay,
} from "@/utils/payment/upsell-promo-multiplier";
import ModalContainer from "@/components/modals/ui/ModalContainer";
import { useThemeStore } from "@/stores/useThemeStore";
import { buildMembershipStripeAppearance } from "@/utils/payment/stripe/membership-stripe-appearance";

const stripePromise = getStripePromise();

/** Swap static catalog entry counts in inclusion lines for promo-adjusted upsell entries (2 × base × multiplier). */
function applyDynamicUpsellEntryCountToLines(lines: string[], calculatedEntries: number): string[] {
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!/(?:entry|entries)/i.test(trimmed)) return line;
    const m = trimmed.match(/^(\d+)(\s+.+(?:entry|entries))/i);
    if (!m) return line;
    return `${calculatedEntries}${m[2]}`;
  });
}

/** Omit price/payment rows and prize copy from “what’s included” (benefits only). */
function filterPackageInclusionLines(lines: string[]): string[] {
  return lines.filter((line) => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith("$")) return false;
    if (/\bprizes?\b/i.test(t)) return false;
    return true;
  });
}

function deriveUpsellPackageType(
  offer: UpsellOffer,
  originalPurchaseContext: UpsellModalProps["originalPurchaseContext"]
): "membership" | "one-time" | "mini-draw" {
  const upsellPackage = getUpsellPackageById(offer.id);
  const category = upsellPackage?.category;

  if (originalPurchaseContext?.packageType) {
    return originalPurchaseContext.packageType;
  }
  if (category === "subscription-plus") {
    return "membership";
  }
  if (category === "one-time-plus" || category === "additional-upgrade") {
    const triggerId = pickTriggeringPackageIdForUpsell(
      upsellPackage?.triggersOnPackageIds,
      originalPurchaseContext?.packageId
    );
    if (triggerId?.startsWith("mini-pack-")) {
      return "mini-draw";
    }
    return "one-time";
  }
  if (offer.category === "membership") {
    return "membership";
  }
  if (offer.category === "mini-draw") {
    return "mini-draw";
  }
  return "one-time";
}

function syntheticSavedPaymentMethod(
  paymentMethodId: string,
  card?: { brand: string; last4: string }
): SavedPaymentMethod {
  return {
    paymentMethodId,
    isDefault: true,
    createdAt: new Date(),
    card: card
      ? {
          brand: card.brand,
          last4: card.last4,
          expMonth: 0,
          expYear: 0,
        }
      : undefined,
  };
}

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
  const [invoiceFinalized, setInvoiceFinalized] = useState(false);
  const finalizationTimeoutIdRef = React.useRef<NodeJS.Timeout | null>(null);
  // ✅ FIX: Track if finalization is in progress to prevent race conditions
  const isFinalizingRef = React.useRef<boolean>(false);
  /** Ref updates synchronously so a second tap cannot start another charge before isProcessing re-renders. */
  const upsellPurchaseLockRef = React.useRef(false);
  /** PM from original purchase context or one-shot PI lookup (webhook may not have written to DB yet). */
  const [purchaseResolvedPm, setPurchaseResolvedPm] = useState<SavedPaymentMethod | null>(null);
  const [isResolvingPurchasePm, setIsResolvingPurchasePm] = useState(false);
  // const [timeLeft, setTimeLeft] = useState({ // TODO: Implement countdown timer
  //   hours: 0,
  //   minutes: 0,
  //   seconds: 0,
  // });

  // Payment processing state
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [showFullInclusions, setShowFullInclusions] = useState(false);

  // Get user context and payment methods
  const { userData, isMember } = useUserContext();
  const { savePaymentMethod } = useSavedPaymentMethods();
  const isDarkMode = useThemeStore((s) => s.theme === "dark");
  const membershipStripeAppearance = useMemo(() => buildMembershipStripeAppearance(isDarkMode), [isDarkMode]);
  // const { isAuthenticated } = useUserContext(); // TODO: Use for authentication checks
  // ✅ Get refetch function and loading state to poll for payment methods when modal opens
  const { data: paymentMethodsData, refetch: refetchPaymentMethods, isLoading: isLoadingPaymentMethods } =
    usePaymentMethods(userData?._id);
  const paymentMethods = !paymentMethodsData
    ? undefined
    : Array.isArray(paymentMethodsData)
      ? paymentMethodsData
      : paymentMethodsData.paymentMethods;

  const [setupIntentSecret, setSetupIntentSecret] = useState<string | null>(null);
  const [loadingSetupIntent, setLoadingSetupIntent] = useState(false);

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
  const purchaseUpsell = usePurchaseUpsell();
  const { showToast } = useToast();

  /** Prefer saved cards from React Query; else PM from this purchase (context or PI API). */
  const resolvedChargePm = useMemo(() => {
    const fromQuery =
      paymentMethods?.find((pm) => pm.isDefault) ??
      (paymentMethods && paymentMethods.length > 0 ? paymentMethods[0] : undefined);
    return fromQuery ?? purchaseResolvedPm ?? undefined;
  }, [paymentMethods, purchaseResolvedPm]);

  const isResolvingPaymentMethod =
    Boolean(isOpen) &&
    Boolean(userData?._id) &&
    (isResolvingPurchasePm || (isLoadingPaymentMethods && paymentMethods === undefined));

  /** Empty list after resolution — show SetupIntent only when we truly have no PM to charge. */
  const showInlineCardSetup =
    Boolean(isOpen) &&
    !isResolvingPaymentMethod &&
    paymentMethods !== undefined &&
    paymentMethods.length === 0 &&
    !resolvedChargePm;

  const isCheckingPaymentMethod = isResolvingPaymentMethod && !resolvedChargePm;

  useEffect(() => {
    if (isOpen) {
      setShowFullInclusions(false);
    }
  }, [isOpen, offer.id]);

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
    setSetupIntentSecret(null);
    setLoadingSetupIntent(false);
    setPurchaseResolvedPm(null);
    setIsResolvingPurchasePm(false);

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

  useEffect(() => {
    if (!isOpen || !userData?._id) {
      setPurchaseResolvedPm(null);
      setIsResolvingPurchasePm(false);
      return;
    }

    let cancelled = false;
    setIsResolvingPurchasePm(true);
    setPurchaseResolvedPm(null);

    void (async () => {
      try {
        await queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userData._id) });
        const refetchResult = await refetchPaymentMethods();
        if (cancelled) return;

        const raw = refetchResult.data;
        const methods = !raw
          ? undefined
          : Array.isArray(raw)
            ? raw
            : raw.paymentMethods;

        if (methods && methods.length > 0) {
          setPurchaseResolvedPm(null);
          setIsResolvingPurchasePm(false);
          return;
        }

        if (originalPurchaseContext?.paymentMethodId) {
          const last4 = originalPurchaseContext.cardLast4;
          setPurchaseResolvedPm(
            syntheticSavedPaymentMethod(
              originalPurchaseContext.paymentMethodId,
              last4
                ? {
                    brand: originalPurchaseContext.cardBrand ?? "",
                    last4,
                  }
                : undefined
            )
          );
          setIsResolvingPurchasePm(false);
          return;
        }

        if (originalPurchaseContext?.paymentIntentId) {
          const res = await fetch(
            `/api/stripe/payment-intent/${encodeURIComponent(originalPurchaseContext.paymentIntentId)}/payment-method`
          );
          const data = (await res.json()) as {
            success?: boolean;
            paymentMethodId?: string | null;
            card?: { brand: string; last4: string } | null;
          };
          if (cancelled) return;
          if (res.ok && data.paymentMethodId) {
            setPurchaseResolvedPm(
              syntheticSavedPaymentMethod(data.paymentMethodId, data.card ?? undefined)
            );
          } else {
            setPurchaseResolvedPm(null);
          }
          setIsResolvingPurchasePm(false);
          return;
        }

        setPurchaseResolvedPm(null);
        setIsResolvingPurchasePm(false);
      } catch (e) {
        console.error("UpsellModal: payment method resolution failed:", e);
        if (!cancelled) {
          setPurchaseResolvedPm(null);
          setIsResolvingPurchasePm(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    userData?._id,
    originalPurchaseContext?.paymentIntentId,
    originalPurchaseContext?.paymentMethodId,
    originalPurchaseContext?.cardLast4,
    originalPurchaseContext?.cardBrand,
    queryClient,
    refetchPaymentMethods,
  ]);

  useEffect(() => {
    setSetupIntentSecret(null);
  }, [offer.id]);

  useEffect(() => {
    if (!isOpen || !showInlineCardSetup || setupIntentSecret) return;
    let cancelled = false;
    setLoadingSetupIntent(true);
    void (async () => {
      try {
        const res = await fetch("/api/stripe/create-setup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = (await res.json()) as { success?: boolean; client_secret?: string; error?: string };
        if (cancelled) return;
        if (res.ok && data.success && data.client_secret) {
          setSetupIntentSecret(data.client_secret);
        } else {
          showToast({
            type: "error",
            title: "Could not load card form",
            message: data.error || "Try again or add a card in account settings.",
          });
        }
      } catch {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "Could not load card form",
            message: "Please try again.",
          });
        }
      } finally {
        if (!cancelled) setLoadingSetupIntent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, showInlineCardSetup, setupIntentSecret, showToast]);

  // Reset payment processing state when modal opens / invoice timeout
  useEffect(() => {
    if (isOpen) {
      // Reset payment processing state to prevent infinite polling
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      upsellPurchaseLockRef.current = false;
      setSetupIntentSecret(null);
      setLoadingSetupIntent(false);

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
        hasPaymentMethod: !!resolvedChargePm,
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
        if (finalizationTimeoutIdRef.current) {
          clearTimeout(finalizationTimeoutIdRef.current);
          finalizationTimeoutIdRef.current = null;
        }
      };
    }
  }, [isOpen, originalPurchaseContext, invoiceFinalized, finalizeInvoice, resolvedChargePm]); // eslint-disable-line react-hooks/exhaustive-deps -- userContext/userData omitted to avoid visibility flicker

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

  const runUpsellPurchase = async (explicitPaymentMethodId?: string) => {
    if (isProcessing || upsellPurchaseLockRef.current) return;

    const paymentMethodIdToUse = explicitPaymentMethodId ?? resolvedChargePm?.paymentMethodId;
    if (!paymentMethodIdToUse) {
      showToast({
        type: "error",
        title: "Payment method required",
        message: "Add a card below to complete this purchase.",
        duration: 6000,
      });
      return;
    }

    upsellPurchaseLockRef.current = true;
    setIsProcessing(true);

    showLoading("Processing Purchase", "", [
      "Authorizing payment method",
      "Confirming transaction with Stripe",
      "Granting bonus entries",
      "Adding entries to major draw",
      "Updating your account",
    ]);

    try {
      const result = await purchaseUpsell.mutateAsync({
        offerId: offer.id,
        useDefaultPayment: true,
        paymentMethodId: paymentMethodIdToUse,
        userId: userData?._id || "",
        idempotencyKey: crypto.randomUUID(),
        originalPurchaseContext: originalPurchaseContext
          ? {
              paymentIntentId: originalPurchaseContext.paymentIntentId,
              packageId: originalPurchaseContext.packageId,
              packageName: originalPurchaseContext.packageName,
              packageType: originalPurchaseContext.packageType,
              price: originalPurchaseContext.price,
              entries: originalPurchaseContext.entries,
              baseEntries: originalPurchaseContext.baseEntries,
              promoMultiplier: originalPurchaseContext.promoMultiplier,
              miniDrawId: originalPurchaseContext.miniDrawId,
              miniDrawName: originalPurchaseContext.miniDrawName,
            }
          : undefined,
      });

      const resolvedPaymentIntentId =
        (result as { data?: { paymentIntentId?: string } }).data?.paymentIntentId ||
        (result as { paymentIntentId?: string }).paymentIntentId;

      if (result.success && resolvedPaymentIntentId) {
        hideLoading();
        setPaymentIntentId(resolvedPaymentIntentId);
        setShowPaymentProcessing(true);
      } else {
        throw new Error(result.message || "Upsell purchase failed");
      }
    } catch (error) {
      console.error("Upsell purchase failed:", error);
      console.error(`Purchase failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      hideLoading();

      const errorMessage = error instanceof Error ? error.message : "Upsell purchase failed";
      showToast({
        type: "error",
        title: "Purchase Failed",
        message: errorMessage,
        duration: 5000,
      });
    } finally {
      upsellPurchaseLockRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleAccept = () => {
    void runUpsellPurchase();
  };

  const handleUpsellInlineCardSaved = async (paymentMethodId: string) => {
    try {
      const saved = await savePaymentMethod(paymentMethodId, true);
      if (!saved) {
        showToast({
          type: "error",
          title: "Could not save card",
          message: "Please try again or add a card in account settings.",
        });
        return;
      }
      if (userData?._id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userData._id) });
        await refetchPaymentMethods();
      }
      setSetupIntentSecret(null);
      await runUpsellPurchase(paymentMethodId);
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not complete purchase",
        message: e instanceof Error ? e.message : "Please try again.",
      });
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
        text: `${status.data.entries} free entries added to your account`,
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

    const partnerLineUpsell = getPartnerDiscountBenefitTextForPackageId(offer.id);
    if (partnerLineUpsell) {
      benefits.push({ text: partnerLineUpsell, icon: "tag" as const });
    }

    // Show success modal with entry information
    showSuccess("Upsell Successful!", `${offer.title} activated`, benefits);

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

  const upsellPackageType = useMemo(
    () => deriveUpsellPackageType(offer, originalPurchaseContext),
    [offer.id, offer.category, originalPurchaseContext?.packageType, originalPurchaseContext?.packageId]
  );

  /** Same multiplier for hero art and entry lines (aligned with checkout: getEffectivePromoType). */
  const effectiveUpsellPromoMultiplier = useMemo(
    () =>
      resolveUpsellPromoMultiplierForDisplay({
        packageType: upsellPackageType,
        packageId: originalPurchaseContext?.packageId,
        storedPromoMultiplier: originalPurchaseContext?.promoMultiplier,
        resolvedMembership: resolvedMembershipMultiplier,
        resolvedOneTime: resolvedOneTimeMultiplier,
        resolvedMini: resolvedMiniMultiplier,
        isMember: Boolean(isMember),
      }),
    [
      upsellPackageType,
      originalPurchaseContext?.packageId,
      originalPurchaseContext?.promoMultiplier,
      resolvedMembershipMultiplier,
      resolvedOneTimeMultiplier,
      resolvedMiniMultiplier,
      isMember,
    ]
  );

  /** Resolved promo multiplier for hero art (drives which `{n}x-*.webp` exists). */
  const upsellImageSrc = useMemo(() => {
    const upsellPackage = getUpsellPackageById(offer.id);
    const category = upsellPackage?.category;

    const resolved = resolveUpsellImage({
      offerId: offer.id,
      promoMultiplier: effectiveUpsellPromoMultiplier,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("🖼️ Upsell Image Debug:", {
        offerId: offer.id,
        packageType: upsellPackageType,
        promoMultiplier: effectiveUpsellPromoMultiplier,
        category,
        resolvedMembershipMultiplier,
        resolvedOneTimeMultiplier,
        resolvedMiniMultiplier,
        originalPurchaseContextPackageType: originalPurchaseContext?.packageType,
        upsellPackageCategory: upsellPackage?.category,
        offerCategory: offer.category,
        determinedFrom: originalPurchaseContext?.packageType
          ? "originalPurchaseContext"
          : category === "subscription-plus"
            ? "upsellCategory"
            : "fallback",
        finalSrc: resolved.src,
        isPromoVariant: resolved.isPromoVariant,
      });
    }

    return resolved.src;
  }, [offer.id, offer.category, upsellPackageType, effectiveUpsellPromoMultiplier, originalPurchaseContext?.packageType]);

  /** Matches hero artwork and Stripe charge (two decimal places). */
  const upsellPriceLabel = offer.discountedPrice.toFixed(2);

  /**
   * Same rules as /api/upsell/purchase: prefer stored promo from the triggering purchase, else
   * resolveUpsellPromoMultiplierForDisplay (getEffectivePromoType + current promo hooks).
   */
  const computedUpsellEntries = useMemo(() => {
    const staticPkg = getUpsellPackageById(offer.id);
    const packageType = upsellPackageType;

    const triggeringPackageId = pickTriggeringPackageIdForUpsell(
      staticPkg?.triggersOnPackageIds,
      originalPurchaseContext?.packageId
    );

    const baseEntries =
      originalPurchaseContext?.baseEntries ??
      (triggeringPackageId && packageType
        ? getPackageBaseEntries({ packageId: triggeringPackageId, packageType })
        : 0);

    if (!packageType || baseEntries <= 0) {
      return null;
    }

    const promoMultiplier = effectiveUpsellPromoMultiplier;

    if (triggeringPackageId) {
      return calculateUpsellEntriesFromContext(
        {
          packageId: triggeringPackageId,
          packageType,
          baseEntries: originalPurchaseContext?.baseEntries,
        },
        promoMultiplier
      );
    }

    return calculateUpsellEntries({
      baseEntries,
      packageType,
      promoMultiplier,
    });
  }, [
    offer.id,
    upsellPackageType,
    originalPurchaseContext?.packageId,
    originalPurchaseContext?.baseEntries,
    effectiveUpsellPromoMultiplier,
  ]);

  const packageInclusionLines = useMemo(() => {
    const fromOffer = offer.conditions?.filter(Boolean) ?? [];
    const base = fromOffer.length > 0 ? fromOffer : getUpsellPackageById(offer.id)?.conditions?.filter(Boolean) ?? [];
    const withEntries =
      computedUpsellEntries != null && computedUpsellEntries > 0
        ? applyDynamicUpsellEntryCountToLines(base, computedUpsellEntries)
        : base;
    return filterPackageInclusionLines(withEntries);
  }, [offer.id, offer.conditions, computedUpsellEntries]);

  // Global loading and success screens are now handled by LoadingContext

  return (
    <>
      <ModalContainer
        isOpen={isOpen}
        onClose={handleClose}
        closeOnBackdrop={false}
        size="lg"
        height="auto"
        className="!max-w-xs sm:!max-w-lg overflow-hidden shadow-2xl sm:rounded-3xl"
      >
        {/* Hero Section - Image Display - No Padding */}
        <div className="relative w-full overflow-hidden">
          <div className="relative w-full">
            <Image
              src={upsellImageSrc}
              alt={offer.title || "Special Offer"}
              width={600}
              height={800}
              className="w-full h-auto"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 600px"
              priority
              placeholder="empty"
            />
          </div>
        </div>

        {/* Main Content - Ultra Compact */}
        <div className="px-3 sm:px-6 pb-2 sm:pb-4 pt-2 sm:pt-4">
          {isResolvingPaymentMethod && (
            <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-4 text-sm text-gray-600 dark:border-neutral-700 dark:bg-neutral-800/90 dark:text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading payment method…
            </div>
          )}
          {showInlineCardSetup && (
            <div className="mb-3 space-y-3 rounded-lg border-2 border-gray-200 dark:border-neutral-700 border-l-4 border-l-red-500 dark:border-l-red-400 p-3 sm:p-4 bg-gray-50 dark:bg-neutral-800/90 shadow-sm">
              <div className="flex items-start gap-2">
                <CreditCard className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Add a payment method</h4>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 mt-1">
                    No saved card on file. Enter your card below — we&apos;ll save it and charge this offer.
                  </p>
                </div>
              </div>
              {loadingSetupIntent && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-600 dark:text-neutral-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Preparing secure form…
                </div>
              )}
              {setupIntentSecret && !loadingSetupIntent && (
                <Elements
                  key={`${setupIntentSecret}-up-${isDarkMode ? "d" : "l"}`}
                  stripe={stripePromise}
                  options={{
                    clientSecret: setupIntentSecret,
                    locale: "en",
                    appearance: membershipStripeAppearance,
                  }}
                >
                  <StripeInlineCardSetupForm
                    clientSecret={setupIntentSecret}
                    userEmail={userData?.email}
                    userName={formatDisplayName(userData?.firstName, userData?.lastName) || undefined}
                    userPhone={userData?.mobile}
                    onSuccess={handleUpsellInlineCardSaved}
                    disabled={isProcessing}
                    submitLabel={`Save card & purchase — $${upsellPriceLabel}`}
                  />
                </Elements>
              )}
            </div>
          )}

          {/* Action Buttons - Stacked Vertically */}
          <div className="flex flex-col gap-2 mb-2">
            {/* Primary CTA - Purchase with Default Card */}
            <button
              onClick={() => {
                handleAccept();
              }}
              disabled={isProcessing || !resolvedChargePm || isCheckingPaymentMethod}
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
                  {resolvedChargePm ? (
                    <>
                      <span>Purchase - ${upsellPriceLabel}</span>

                      <div className="flex items-center gap-1 ml-2 bg-white/20 rounded-lg px-2 py-1">
                        <CreditCard className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="text-xs sm:text-sm">
                          {resolvedChargePm.card?.last4
                            ? `•••• ${resolvedChargePm.card.last4}`
                            : "Saved card"}
                        </span>
                      </div>
                    </>
                  ) : showInlineCardSetup ? (
                    <span className="text-sm font-medium">Use the secure form above</span>
                  ) : (
                    "No Payment Method Available"
                  )}
                </div>
              )}
            </button>

            {packageInclusionLines.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-300 shadow-sm dark:border-neutral-600">
                <button
                  type="button"
                  onClick={() => setShowFullInclusions((v) => !v)}
                  aria-expanded={showFullInclusions}
                  className="flex w-full items-center justify-center gap-2 bg-white py-2.5 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:bg-neutral-800/80 dark:text-neutral-100 dark:hover:bg-neutral-700/80 sm:py-3 sm:text-base"
                >
                  <span>{showFullInclusions ? "Hide package inclusions" : "See full package inclusions"}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 sm:h-5 sm:w-5 ${showFullInclusions ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                {showFullInclusions && (
                  <div
                    className="border-t border-gray-200 bg-gray-50/95 px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900/60 sm:px-4"
                    role="region"
                    aria-label="Package inclusions"
                  >
                    <ul className="space-y-2 text-left text-sm text-gray-700 dark:text-neutral-300 sm:text-base">
                      {packageInclusionLines.map((line, idx) => (
                        <li key={`${idx}-${line}`} className="flex gap-2">
                          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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
              className="w-full rounded-xl border border-red-300 py-2 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/45 dark:text-red-400 dark:hover:bg-red-950/40 sm:py-2.5 sm:px-6 sm:text-base"
            >
              No thanks, maybe later
            </button>
          </div>

          {/* Trust Indicators - Compact */}
          <div className="mt-2 border-t border-gray-200 pt-2 dark:border-neutral-700 sm:mt-4 sm:pt-4">
            <div className="flex items-center justify-center gap-3 text-xs text-gray-500 dark:text-neutral-400 sm:gap-6 sm:text-sm">
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
      </ModalContainer>

      {showPaymentProcessing && paymentIntentId && (
        <PaymentProcessingScreen
          paymentIntentId={paymentIntentId}
          packageName={offer.title}
          packageType="upsell"
          packageId={offer.id}
          isVisible={showPaymentProcessing}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
          onTimeout={handleClose}
          onStillProcessingDismiss={handleClose}
        />
      )}
    </>
  );
};

export default UpsellModal;
