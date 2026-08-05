"use client";

/**
 * SpecialPackagesModal — decomposed from a 1218-LOC flat file into the canonical
 * orchestrator-folder pattern.
 *
 * Public API (props) is preserved byte-identically — all callers continue to
 * work without modification because the folder/index.tsx resolves as the same
 * import path.
 *
 * STRIPE PRESERVATION INVARIANTS:
 * 1. `getStripePromise()` is called lazily inside the component (via
 *    `useMemo(() => getStripePromise(), [])`), NOT at module scope — a
 *    module-scope call would boot Stripe.js for every visitor who downloads
 *    this chunk, even ones who never open the modal (2026-07 perf audit).
 *    `getStripePromise()` itself still returns a module-level cached
 *    singleton (`src/lib/stripe-client.ts`) — Stripe prohibits
 *    re-instantiation per render — so `stripePromise` identity is stable
 *    across renders even though the call site is now inside the component.
 *    The Elements provider lives inside PaymentSection.tsx; the promise is
 *    passed down as a prop.
 * 2. The Elements `key` (`${setupIntentSecret}-sp-${isDarkMode ? "d" : "l"}`) is
 *    preserved — changing the key forces a fresh mount when the SetupIntent
 *    secret or theme changes.
 * 3. All payment intent / setup intent state, purchase mutation timing, and
 *    payment-method resolution flows are byte-identical to the original.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getStripePromise } from "@/lib/stripe-client";
import { formatDisplayName } from "@/utils/display-name";
import { useToast } from "@/components/ui/Toast";
import { useUserContext } from "@/contexts/UserContext";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useLoading } from "@/contexts/LoadingContext";
// Upsell store removed - using unified modal priority system
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { getPackageBaseEntries } from "@/utils/payment/package-base-entries";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { resolveUpsellPromoMultiplierForDisplay } from "@/utils/payment/upsell-promo-multiplier";
import { markPurchaseCompleted } from "@/utils/tracking/purchase-tracking";
import { clearDashboardEntryHold } from "@/utils/dashboard-entry-hold";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
import { usePurchaseMembership } from "@/hooks/queries/useMembershipQueries";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import { ModalContainer, ModalHeader, ModalContent } from "../ui";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { rewardsEnabled } from "@/config/featureFlags";
import { getPartnerDiscountBenefitTextForPackageId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { usePromoLink } from "@/hooks/usePromoLink";
import { useReferralCode } from "@/hooks/useReferralCode";
import { normalizeMembershipPlanId } from "@/utils/membership/additional-package-mapping";
import { getReceiptLabel } from "@/utils/membership/getReceiptLabel";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { useThemeStore } from "@/stores/useThemeStore";
import { buildMembershipStripeAppearance } from "@/utils/payment/stripe/membership-stripe-appearance";

import PromoBanner from "./PromoBanner";
import PackagesGrid from "./PackagesGrid";
import PaymentSection from "./PaymentSection";
import PurchaseFooter, { TrustIndicators } from "./PurchaseFooter";
import BenefitsPanel from "./BenefitsPanel";
import { isPackageHiddenByVariant, variantDisplayOrderRank } from "./utils";

/**
 * SpecialPackagesModalProps Interface
 * Props for the SpecialPackagesModal component
 */
export interface SpecialPackagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  packages: StaticMembershipPackage[];
  initialCouponCode?: string;
  onPackageSelect: (pkg: StaticMembershipPackage) => void;
}

/**
 * SpecialPackagesModal Component
 * Displays additional one-time packages for users with active subscriptions OR current draw entries
 * Features package selection with one-click purchase using saved payment methods
 */
const SpecialPackagesModal: React.FC<SpecialPackagesModalProps> = ({
  isOpen,
  onClose,
  packages,
  initialCouponCode,
  onPackageSelect,
}) => {
  const { variantConfig } = useVariantContext();
  // Lazy Stripe boot — see "STRIPE PRESERVATION INVARIANTS" #1 above. getStripePromise()
  // itself returns a module-level cached singleton, so this identity is stable across renders.
  const stripePromise = useMemo(() => getStripePromise(), []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<StaticMembershipPackage | null>(null);
  /** Anchor at the end of the body, scrolled to after a pick so the Buy button is in view.
   *  Declared with the other hooks — this component early-returns further down, and a ref
   *  created after that point would break the rules-of-hooks call order. */
  const purchaseAnchorRef = useRef<HTMLDivElement | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponType, setCouponType] = useState<"referral" | "promo" | "campaign" | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [, setCampaignPurchaseRequirement] = useState<"none" | "membership" | "one-time" | "any" | null>(null);
  const [upsellTriggered, setUpsellTriggered] = useState(false);
  const lastAutoAppliedCodeRef = useRef<string | null>(null);
  /** Ref updates synchronously so a second tap cannot start a second charge before isProcessing re-renders. */
  const specialPackagePurchaseLockRef = useRef(false);

  // Payment processing state
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [processingPackageName, setProcessingPackageName] = useState<string>("");
  const [originalPurchaseContext, setOriginalPurchaseContext] = useState<OriginalPurchaseContext | null>(null);
  /** PM id used for the charge (for upsell before webhook saves to DB). */
  const [purchasePaymentMethodId, setPurchasePaymentMethodId] = useState<string | null>(null);

  // Get user context and payment methods
  const { isAuthenticated, userData, hasActiveSubscription, isMember } = useUserContext();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const { paymentMethods, savePaymentMethod, loading: paymentMethodsLoading } = useSavedPaymentMethods();
  const { showToast } = useToast();
  const isDarkMode = useThemeStore((s) => s.theme === "dark");
  const membershipStripeAppearance = useMemo(() => buildMembershipStripeAppearance(isDarkMode), [isDarkMode]);

  // Get promo link code from URL/sessionStorage (for bonus entries)
  const { promoCode: promoLinkCode, setPromoCode, clearPromoCode } = usePromoLink();
  const { setReferralCode, clearReferralCode } = useReferralCode();

  // Membership multiplier only for active members; one-time multiplier for non-members with access
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");

  const packagesAdjustedForVariant = useMemo(() => {
    const pkgCfg = variantConfig?.packages;
    let list = [...packages];
    if (pkgCfg?.hidePackages?.length) {
      list = list.filter((p) => !isPackageHiddenByVariant(p._id, pkgCfg.hidePackages));
    }
    if (pkgCfg?.displayOrder?.length) {
      list = [...list].sort(
        (a, b) =>
          variantDisplayOrderRank(a._id, pkgCfg.displayOrder) -
          variantDisplayOrderRank(b._id, pkgCfg.displayOrder)
      );
    }
    return list;
  }, [packages, variantConfig?.packages]);

  // Get packages with promo applied - member-only one-time packs use membership multiplier when user is subscribed
  const packagesWithPromo = React.useMemo(() => {
    return packagesAdjustedForVariant.map((pkg) => {
      if (pkg.type === "one-time") {
        const effectiveType = getEffectivePromoType(pkg._id, "one-time", Boolean(isMember));
        const resolvedMultiplier =
          effectiveType === "membership-packages" ? resolvedMembershipMultiplier : resolvedOneTimeMultiplier;
        if (resolvedMultiplier !== null && resolvedMultiplier > 1) {
          const originalEntries = pkg.totalEntries || 0;
          const promoEntries = originalEntries * resolvedMultiplier;
          return {
            ...pkg,
            totalEntries: promoEntries,
            originalEntries,
            promoMultiplier: resolvedMultiplier,
            isPromoActive: (resolvedMultiplier ?? 1) > 1,
          };
        }
      }
      return pkg;
    });
  }, [
    packagesAdjustedForVariant,
    resolvedMembershipMultiplier,
    resolvedOneTimeMultiplier,
    isMember,
  ]);

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
  const purchaseMembership = usePurchaseMembership();

  /** Prefer default flag; otherwise first saved card (matches one-time purchase API fallback). */
  const resolvedChargePm =
    paymentMethods.find((pm) => pm.isDefault) ?? (paymentMethods.length > 0 ? paymentMethods[0] : undefined);

  const needsInlineCardSetup = Boolean(
    selectedPackage && !paymentMethodsLoading && paymentMethods.length === 0
  );
  const [setupIntentSecret, setSetupIntentSecret] = useState<string | null>(null);
  const [loadingSetupIntent, setLoadingSetupIntent] = useState(false);

  // Custom close handler that resets payment processing state
  const handleClose = useCallback(() => {
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
    setPurchasePaymentMethodId(null);
    setProcessingPackageName("");
    setOriginalPurchaseContext(null);
    setSetupIntentSecret(null);
    setLoadingSetupIntent(false);
    onClose();
  }, [onClose]);

  // Reset payment processing state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      setPurchasePaymentMethodId(null);
      setProcessingPackageName("");
      setOriginalPurchaseContext(null);
      setUpsellTriggered(false);
      lastAutoAppliedCodeRef.current = null;
      specialPackagePurchaseLockRef.current = false;
      setSetupIntentSecret(null);
      setLoadingSetupIntent(false);

      const normalizedInitialCode = initialCouponCode?.trim().toUpperCase();
      if (normalizedInitialCode) {
        setCouponCode(normalizedInitialCode);
        setCouponApplied(false);
        setCouponType(null);
        setCouponError(null);
      }
    }
  }, [isOpen, initialCouponCode]);

  const handleCouponApply = useCallback(async (codeOverride?: string) => {
    const normalizedCode = (codeOverride ?? couponCode).trim().toUpperCase();
    if (!normalizedCode) {
      setCouponError("Enter a code before applying.");
      setCouponApplied(false);
      setCouponType(null);
      return;
    }

    if (codeOverride) {
      setCouponCode(normalizedCode);
    }

    setCouponError(null);
    try {
      const response = await fetch("/api/codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizedCode,
          inviteeUserId: userData?._id,
          inviteeEmail: userData?.email,
          preferType: "auto",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.valid) {
        throw new Error(data.message || data.error || "This code is not valid right now.");
      }

      if (data.type === "referral") {
        setCouponApplied(true);
        setCouponType("referral");
        setCouponError(null);
        setReferralCode(normalizedCode);
        clearPromoCode();
        return;
      }

      if (data.type === "promo") {
        setCouponApplied(true);
        setCouponType("promo");
        setCouponError(null);
        setPromoCode(normalizedCode);
        clearReferralCode();
        return;
      }

      if (data.type === "campaign") {
        const purchaseReq = data.data.purchaseRequirement;

        if (purchaseReq === "membership") {
          setCouponError("This code is for membership packs only.");
          setCouponApplied(false);
          setCouponType(null);
          setCampaignPurchaseRequirement(null);
          return;
        }

        setCouponApplied(true);
        setCouponType("campaign");
        setCampaignPurchaseRequirement(purchaseReq);
        setCouponError(null);
        clearReferralCode();
        clearPromoCode();
        return;
      }

      throw new Error("This code is not valid right now.");
    } catch (error) {
      setCouponApplied(false);
      setCouponType(null);
      setCouponError(error instanceof Error ? error.message : "Could not validate this code.");
    }
  }, [couponCode, userData?._id, userData?.email, setReferralCode, clearPromoCode, setPromoCode, clearReferralCode]);

  useEffect(() => {
    if (!isOpen) return;
    const normalizedInitialCode = initialCouponCode?.trim().toUpperCase();
    if (!normalizedInitialCode) return;
    if (lastAutoAppliedCodeRef.current === normalizedInitialCode) return;

    lastAutoAppliedCodeRef.current = normalizedInitialCode;
    handleCouponApply(normalizedInitialCode);
  }, [isOpen, initialCouponCode, handleCouponApply]);

  // Auto-apply promo from ?promo= / sessionStorage (MembershipModal pre-fills the same way)
  useEffect(() => {
    if (!isOpen) return;
    if (initialCouponCode?.trim()) return;
    if (!promoLinkCode?.trim()) return;
    const normalized = promoLinkCode.trim().toUpperCase();
    if (lastAutoAppliedCodeRef.current === normalized) return;
    lastAutoAppliedCodeRef.current = normalized;
    void handleCouponApply(normalized);
  }, [isOpen, initialCouponCode, promoLinkCode, handleCouponApply]);

  useEffect(() => {
    setSetupIntentSecret(null);
  }, [selectedPackage?._id]);

  useEffect(() => {
    if (!isOpen || !needsInlineCardSetup || setupIntentSecret) return;
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
  }, [isOpen, needsInlineCardSetup, setupIntentSecret, showToast]);

  // Verify user is authenticated and has access to additional packages
  if (
    isOpen &&
    (!isAuthenticated || !hasAdditionalPackageAccess(userData, userMajorDrawStats))
  ) {
    // console.log("🚫 SpecialPackagesModal: User not authenticated or doesn't have access to additional packages");
    return null;
  }

  const handlePackageSelect = (pkg: StaticMembershipPackage) => {
    // Single selection - unselect current and select new
    setSelectedPackage(pkg);
    onPackageSelect(pkg);

    // Bring the Buy button into view. Picking a pack is the point at which the next action
    // moves to the footer, and with six packs stacked that footer is usually below the fold.
    // rAF so the scroll runs after the selection has committed and the footer (which only
    // renders once something is selected) is actually in the DOM.
    requestAnimationFrame(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      purchaseAnchorRef.current?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "end",
      });
    });
  };

  const handlePurchase = async (pkg: StaticMembershipPackage, freshPaymentMethodId?: string) => {
    if (isProcessing || specialPackagePurchaseLockRef.current) return;

    const paymentMethodIdToCharge = freshPaymentMethodId ?? resolvedChargePm?.paymentMethodId;
    if (!paymentMethodIdToCharge) {
      showToast({
        type: "error",
        title: "Payment method required",
        message: "Add a card below to complete your purchase.",
      });
      return;
    }

    specialPackagePurchaseLockRef.current = true;
    setIsProcessing(true);

    showLoading("Processing Purchase", "", [
      "Authorizing payment method",
      "Confirming transaction with Stripe",
      "Granting package benefits",
      "Adding entries to major draw",
      "Updating your account",
    ]);

    try {
      const result = await purchaseMembership.mutateAsync({
        packageId: normalizeMembershipPlanId(pkg._id),
        userId: userData?._id || "",
        paymentMethodId: paymentMethodIdToCharge,
        idempotencyKey: crypto.randomUUID(),
        referralCode: couponApplied && couponType === "referral" ? couponCode.trim().toUpperCase() : undefined,
        promoLinkCode:
          couponApplied && couponType === "promo"
            ? couponCode.trim().toUpperCase()
            : promoLinkCode || undefined,
        campaignCode: couponApplied && couponType === "campaign" ? couponCode.trim().toUpperCase() : undefined,
      });

      if (!result.success) {
        throw new Error("Package purchase failed");
      }

      markPurchaseCompleted();
      hideLoading();

      // The purchase route returns `paymentIntent` at the TOP level. A `result.data.paymentIntent`
      // fallback used to sit here; it could never match at runtime — the response type wrongly
      // declared it, which is part of how the 3-D Secure hole stayed invisible.
      const resolvedPaymentIntentId = result.paymentIntent?.id;
      if (resolvedPaymentIntentId) {
        setPaymentIntentId(resolvedPaymentIntentId);
        setPurchasePaymentMethodId(paymentMethodIdToCharge);
        setProcessingPackageName(getReceiptLabel(pkg));
        setShowPaymentProcessing(true);
      } else {
        const fallbackBenefits: { text: string; icon: "gift" | "star" | "zap" | "ticket" | "tag"; highlight?: boolean }[] = [
          { text: `${pkg.totalEntries || 0} free entries added to your wallet`, icon: "gift" },
        ];
        if (couponApplied && couponCode) {
          const label = couponType === "campaign" ? "Campaign" : couponType === "referral" ? "Referral" : "Promo";
          fallbackBenefits.push({
            text: `${label} code ${couponCode.trim().toUpperCase()} applied`,
            icon: "tag",
            highlight: true,
          });
        }
        showSuccess(
          "Purchase Successful!",
          `${pkg.totalEntries || 0} free entries added to your account`,
          fallbackBenefits,
          3000
        );
        handleClose();
      }
    } catch (error) {
      console.error("Special package purchase failed:", error);
      hideLoading();
      // Central payment-error copy: shows concise decline guidance when the
      // API 400 carries code/decline_code (ApiError.data), generic otherwise.
      const formatted = formatPaymentError(error);
      console.error(`Purchase failed: ${formatted.message}`);
      showToast({
        type: "error",
        title: formatted.title,
        message: formatted.message,
        duration: 8000,
      });
    } finally {
      specialPackagePurchaseLockRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleInlineCardSaved = async (paymentMethodId: string) => {
    if (!selectedPackage) return;
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
      }
      setSetupIntentSecret(null);
      await handlePurchase(selectedPackage, paymentMethodId);
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not complete purchase",
        message: e instanceof Error ? e.message : "Please try again.",
      });
    }
  };

  // Payment processing handlers
  const handlePaymentSuccess = async (status: PaymentStatusResponse) => {
    // console.log("🎉 Special package payment processing completed:", status);
    // console.log("🔍 handlePaymentSuccess called - about to trigger upsell");
    setShowPaymentProcessing(false);

    // Fire browser-side Purchase pixel via the provider registry, deduped against
    // the server-side CAPI event (which the webhook fires with the same paymentIntentId
    // as event_id). Meta's eventID dedup mechanism is DESIGNED for both sides to fire —
    // skipping the browser side loses _fbc/_fbp cookies and tanks Event Match Quality.
    const specialPaymentIntentId = status.data?.paymentIntentId;
    const specialPrice = status.data?.price;
    if (specialPaymentIntentId && typeof specialPrice === "number" && specialPrice > 0) {
      trackConversion(
        buildPurchaseEvent({
          value: specialPrice,
          currency: status.data?.currency ?? "AUD",
          eventId: specialPaymentIntentId,
          customData: {
            orderId: specialPaymentIntentId,
            contentType: "product",
            contentIds: selectedPackage?._id ? [selectedPackage._id] : undefined,
            numItems: 1,
            packageType: status.data?.packageType ?? "one-time",
          },
          eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      );
    }

    // ✅ CRITICAL FIX: Create local variable to avoid React state closure issue (same as MembershipModal)
    // Store original purchase context for invoice finalization
    let contextToPass: OriginalPurchaseContext | null = null;

    if (paymentIntentId && selectedPackage) {
      // Get base entries for upsell calculation
      const baseEntries = getPackageBaseEntries({
        packageId: selectedPackage._id || "",
        packageType: "one-time",
      });

      // ✅ FIX: Get the multiplier that was actually applied during the original purchase
      // Find the package in packagesWithPromo to get the promoMultiplier that was applied
      const packageWithPromo = packagesWithPromo.find((p) => p._id === selectedPackage._id);
      const appliedMultiplier = resolveUpsellPromoMultiplierForDisplay({
        packageType: "one-time",
        packageId: selectedPackage._id,
        storedPromoMultiplier: packageWithPromo?.promoMultiplier,
        resolvedMembership: resolvedMembershipMultiplier,
        resolvedOneTime: resolvedOneTimeMultiplier,
        resolvedMini: null,
        isMember: Boolean(isMember),
      });

      // Create context object in local variable to pass directly (avoids closure issue)
      const pm = purchasePaymentMethodId
        ? paymentMethods.find((p) => p.paymentMethodId === purchasePaymentMethodId)
        : undefined;
      contextToPass = {
        paymentIntentId,
        packageId: selectedPackage._id || "",
        packageName: processingPackageName,
        packageType: "one-time",
        price: selectedPackage.price,
        entries: status.data?.entries || 0,
        baseEntries,
        promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined, // Only store if multiplier > 1
        ...(purchasePaymentMethodId ? { paymentMethodId: purchasePaymentMethodId } : {}),
        ...(pm?.card?.last4 ? { cardLast4: pm.card.last4 } : {}),
        ...(pm?.card?.brand ? { cardBrand: pm.card.brand } : {}),
      };

      // Also update state for other component uses
      setOriginalPurchaseContext(contextToPass);
      // console.log("📧 Stored original purchase context for invoice finalization (special package)", {
      //   baseEntries,
      //   appliedMultiplier,
      //   entries: status.data?.entries || 0,
      // });
    }

    // Invalidate user caches to update UI immediately
    if (userData?._id) {
      invalidateUserCaches(userData._id);
    }

    // Build benefits array with entry information
    const benefits = [];

    // Always show the package activation
    benefits.push({
      text: `${processingPackageName} activated successfully`,
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

    const partnerLineSpecial = getPartnerDiscountBenefitTextForPackageId(selectedPackage?._id);
    if (partnerLineSpecial) {
      benefits.push({
        text: partnerLineSpecial,
        icon: "tag" as const,
      });
    }

    // Add code redemption info
    if (couponApplied && couponCode) {
      const label = couponType === "campaign" ? "Campaign" : couponType === "referral" ? "Referral" : "Promo";
      benefits.push({
        text: `${label} code ${couponCode.trim().toUpperCase()} applied`,
        icon: "tag" as const,
        highlight: true,
      });
    }

    // Show success modal with entry information
    showSuccess("Purchase Successful!", `${processingPackageName} activated`, benefits);

    // ✅ CRITICAL FIX: Capture contextToPass in closure to ensure it's available when setTimeout executes
    // This matches the pattern used in MembershipModal to avoid React state closure issues
    const finalContextToPass = contextToPass;

    // Trigger upsell modal for one-time purchase after success modal
    // console.log("🔍 About to check upsellTriggered:", upsellTriggered);
    if (!upsellTriggered) {
      // console.log("🔍 Setting upsellTriggered to true");
      setUpsellTriggered(true); // Mark that we've triggered this once

      setTimeout(() => {
        // console.log("🎯 TRIGGERING UPSELL for special package purchase:", {
        //   packageName: processingPackageName,
        //   packagePrice: selectedPackage?.price,
        //   packageId: selectedPackage?._id,
        // });

        // Use the EXACT same pattern as MembershipModal - call triggerUpsellModal function
        // ✅ CRITICAL: Pass finalContextToPass (local variable) instead of originalPurchaseContext (state)
        triggerUpsellModal(
          "one-time-purchase",
          processingPackageName,
          selectedPackage?.price || 0,
          selectedPackage?._id, // packageId
          "one-time", // packageType
          finalContextToPass // ✅ FIX: Use local variable instead of state to avoid closure issue
        );
      }, 2000); // 2 second delay
    } else {
      // console.log("🔍 Upsell already triggered, skipping");
    }

    // Close modal after triggering upsell (consistent with MembershipModal)
    handleClose();
  };

  // Both paths end the purchase flow WITHOUT the global success screen, so the dashboard's
  // own release (success overlay closing) never runs — release the entry hold here or the
  // wallet keeps rendering pre-purchase numbers after a charge that may well have succeeded.
  const handlePaymentError = (error: string) => {
    console.error("❌ Special package payment processing failed:", error);
    setShowPaymentProcessing(false);
    clearDashboardEntryHold();
    showToast({
      type: "error",
      title: "We couldn't confirm your purchase",
      message:
        "Your payment may still be going through. If it does, your free entries will appear in your account shortly — check your email for the receipt, or contact support if nothing arrives.",
      duration: 8000,
    });
  };

  const handlePaymentTimeout = () => {
    // console.warn("⏰ Special package payment processing timed out");
    setShowPaymentProcessing(false);
    clearDashboardEntryHold();
    showToast({
      type: "info",
      title: "Still processing",
      message: "Your payment is taking longer than usual. Your free entries will appear in your account once it completes.",
      duration: 8000,
    });
  };

  /**
   * Trigger upsell modal after successful purchase
   * EXACT COPY from MembershipModal - ensures single source of truth
   */
  const triggerUpsellModal = async (
    triggerEvent: "membership-purchase" | "ticket-purchase" | "one-time-purchase",
    recentPurchase: string,
    purchaseAmount: number,
    packageId?: string,
    packageType?: "membership" | "one-time",
    originalPurchaseContextParam?: OriginalPurchaseContext | null
  ) => {
    try {
      // ✅ CRITICAL: Invalidate payment methods cache before triggering upsell modal
      // This ensures the upsell modal has the latest payment method available
      // Payment method was just saved during purchase, so we need to refresh the cache
      if (userData?._id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userData._id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userData._id) });
        console.log("🔄 Invalidated payment methods cache before showing upsell modal");
      }

      // If we have package information, use the new trigger API
      if (packageId && packageType) {
        // console.log(`🎯 Triggering targeted upsell for package: ${packageId} (${packageType})`);

        // ✅ FIX: Determine correct userType based on package ID and type (same as MembershipModal)
        // Mini draw packages (mini-pack-1, mini-pack-2, etc.) should use "mini-draw-buyer"
        // Regular one-time packages should use "returning-user" or "new-user"
        const isMiniDrawPackage = packageId.startsWith("mini-pack-");

        // Check if this is an additional package (additional- packages)
        const isAdditionalPackage = packageId.startsWith("additional-");

        // If user doesn't have access, skip upsell trigger for additional packages
        if (isAdditionalPackage && !hasAdditionalPackageAccess(userData, userMajorDrawStats)) {
          // console.log("⚠️ Skipping upsell trigger: User doesn't have access to additional packages");
          return;
        }

        const userType = isMiniDrawPackage ? "mini-draw-buyer" : isAuthenticated ? "returning-user" : "new-user";

        // ✅ FIX: Calculate if user has access to additional packages (subscription OR major draw entries)
        const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(userData, userMajorDrawStats);

        const response = await fetch("/api/upsell/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId,
            packageType,
            userType, // ✅ FIX: Correctly determined based on package type (not hardcoded)
            isMember: hasActiveSubscription, // Pass membership status
            hasAccessToAdditionalPackages: hasAccessToAdditionalPackages, // ✅ NEW: Pass access status
            triggerEvent,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          // console.log("🔍 Upsell trigger API result:", result);

          if (result.success && result.data?.offer) {
            const offer = result.data.offer;
            // console.log(`✅ Found targeted upsell offer: ${offer.name}`);

            // Convert offer to UpsellOffer format
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

            // Prepare user context (same as MembershipModal)
            const userContext: UpsellUserContext = {
              userId: userData?._id || undefined,
              isAuthenticated: isAuthenticated,
              hasDefaultPayment: isAuthenticated && (userData?.savedPaymentMethods?.length ?? 0) > 0,
              recentPurchase: recentPurchase,
              userType: isAuthenticated ? "returning-user" : "new-user", // ✅ FIX: Match MembershipModal logic
              totalSpent: purchaseAmount,
              upsellsShown: 0,
            };

            // CRITICAL FIX: Set pending upsell IMMEDIATELY (not delayed) - same as MembershipModal
            // This ensures sessionStorage is set BEFORE page navigation
            // Use passed parameter or fallback to state
            const finalOriginalPurchaseContext = originalPurchaseContextParam ?? originalPurchaseContext;

            if (!isAuthenticated) {
              const { setPendingUpsellAfterSetup } = useModalPriorityStore.getState();
              setPendingUpsellAfterSetup(true, {
                offer: upsellOffer,
                userContext,
                originalPurchaseContext: finalOriginalPurchaseContext || undefined,
              });
              // console.log("🎯 Set pending upsell IMMEDIATELY for first-time user (before navigation)");
            } else {
              // For existing users, show upsell with a delay
              setTimeout(() => {
                const { requestModal } = useModalPriorityStore.getState();
                requestModal("upsell", false, {
                  offer: upsellOffer,
                  userContext,
                  originalPurchaseContext: finalOriginalPurchaseContext || undefined,
                });
                // console.log("🎯 Showing upsell for existing user (after delay)");
              }, offer.showAfterDelay * 1000 || 2000);
            }

            return;
          } else {
            // console.log("❌ No upsell offer found in API response:", result);
          }
        } else {
          // console.log("❌ Upsell trigger API failed:", response.status, response.statusText);
        }
      }

      // Fallback: No upsell available (same as MembershipModal)
      // console.log(`🎯 No upsell available for: ${recentPurchase}`);
    } catch (error) {
      console.error("Error triggering upsell:", error);
      // No fallback available - upsell system removed (same as MembershipModal)
    }
  };

  return (
    <>
      {/* Payment Processing Screen */}
      {showPaymentProcessing && paymentIntentId && (
        <PaymentProcessingScreen
          paymentIntentId={paymentIntentId}
          packageName={processingPackageName}
          packageType="one-time"
          packageId={selectedPackage?._id}
          isVisible={showPaymentProcessing}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
          onTimeout={handlePaymentTimeout}
          onStillProcessingDismiss={handlePaymentTimeout}
        />
      )}

      {/* Main Modal */}
      <ModalContainer
        isOpen={isOpen}
        onClose={handleClose}
        size="md"
        height="fixed"
        fixedHeight="max-h-[90dvh]"
        closeOnBackdrop={false}
        className="flex flex-col sm:max-w-xl"
      >
        <ModalHeader title="" onClose={handleClose} showLogo={true} logoSize="sm" accent="none" />

        {/* Congratulations Section - Below Header (hidden when package is selected) */}
        {!selectedPackage && <PromoBanner firstName={userData?.firstName} />}

        <ModalContent scrollbar="metallic" padding="none" className="flex flex-col overflow-x-hidden p-2 sm:p-5">
          <PackagesGrid
            packagesWithPromo={packagesWithPromo}
            selectedPackage={selectedPackage}
            variantConfig={variantConfig}
            onSelectPackage={handlePackageSelect}
            couponCode={couponCode}
            couponApplied={couponApplied}
            couponError={couponError}
            onCouponCodeChange={(value) => {
              setCouponCode(value);
              setCouponApplied(false);
              setCouponType(null);
              setCouponError(null);
            }}
            onCouponApply={() => handleCouponApply()}
          />

          <PaymentSection
            needsInlineCardSetup={needsInlineCardSetup}
            hasSelectedPackage={Boolean(selectedPackage)}
            loadingSetupIntent={loadingSetupIntent}
            setupIntentSecret={setupIntentSecret}
            stripePromise={stripePromise}
            membershipStripeAppearance={membershipStripeAppearance}
            isDarkMode={isDarkMode}
            userEmail={userData?.email}
            userName={formatDisplayName(userData?.firstName, userData?.lastName) || undefined}
            userPhone={userData?.mobile}
            isProcessing={isProcessing}
            selectedPackagePrice={selectedPackage?.price}
            onCardSaved={handleInlineCardSaved}
          />

          <PurchaseFooter
            selectedPackage={selectedPackage}
            variantConfig={variantConfig}
            isProcessing={isProcessing}
            needsInlineCardSetup={needsInlineCardSetup}
            paymentMethodsLoading={paymentMethodsLoading}
            resolvedChargePm={resolvedChargePm}
            onPurchase={() => selectedPackage && handlePurchase(selectedPackage)}
          />

          <BenefitsPanel selectedPackage={selectedPackage} variantConfig={variantConfig} />

          <TrustIndicators />

          {/* Scroll target for handlePackageSelect. Sits AFTER the trust strip so
              `block: "end"` lands the whole purchase block — Buy button, benefits and trust
              marks — in view, rather than stopping with the button at the very bottom edge. */}
          <div ref={purchaseAnchorRef} aria-hidden />
        </ModalContent>
      </ModalContainer>
    </>
  );
};

export default SpecialPackagesModal;
