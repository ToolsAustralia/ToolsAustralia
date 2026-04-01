"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Gift, Zap, CheckCircle, CreditCard, Sparkles, Check } from "lucide-react";
import { useUserContext } from "@/contexts/UserContext";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useLoading } from "@/contexts/LoadingContext";
// Upsell store removed - using unified modal priority system
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { getPackageBaseEntries } from "@/utils/payment/upsell-entries-calculator";
import { markPurchaseCompleted } from "@/utils/tracking/purchase-tracking";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse } from "@/hooks/queries";
import { usePurchaseMembership } from "@/hooks/queries/useMembershipQueries";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { rewardsEnabled } from "@/config/featureFlags";
import { usePromoLink } from "@/hooks/usePromoLink";
import { useReferralCode } from "@/hooks/useReferralCode";
import { getPackageIcon } from "@/utils/images/package-icons";
import { getPackageColorSchemeForPromo, getCardBorderStyle } from "@/utils/package-colors/packageColorScheme";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { usePromoTheme } from "@/stores/usePromoThemeStore";

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const darkenHex = (hex: string, amount: number) => {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp(parseInt(hex.slice(1, 3), 16) - amount);
  const g = clamp(parseInt(hex.slice(3, 5), 16) - amount);
  const b = clamp(parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

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
/** Solid promo primary (e.g. Milwaukee red) — no gradient / glow, matches landing “pure brand” treatment */
const SpecialPackages50OffText: React.FC = () => {
  const theme = usePromoTheme();
  return (
    <span className="font-bold" style={{ color: theme.primary }}>
      50% off{" "}
    </span>
  );
};

const SpecialPackagesModal: React.FC<SpecialPackagesModalProps> = ({
  isOpen,
  onClose,
  packages,
  initialCouponCode,
  onPackageSelect,
}) => {
  const { variantConfig } = useVariantContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<StaticMembershipPackage | null>(null);
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

  // Get user context and payment methods
  const { isAuthenticated, userData, hasActiveSubscription } = useUserContext();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const { paymentMethods } = useSavedPaymentMethods();

  // Get promo link code from URL/sessionStorage (for bonus entries)
  const { promoCode: promoLinkCode, setPromoCode, clearPromoCode } = usePromoLink();
  const { setReferralCode, clearReferralCode } = useReferralCode();

  // Membership multiplier only for active members; one-time multiplier for non-members with access
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");

  // Get packages with promo applied - use membership multiplier only when user has active subscription
  const packagesWithPromo = React.useMemo(() => {
    return packages.map((pkg) => {
      if (pkg.type === "one-time") {
        const effectiveType = getEffectivePromoType(pkg._id, "one-time", hasActiveSubscription);
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
  }, [packages, resolvedMembershipMultiplier, resolvedOneTimeMultiplier, hasActiveSubscription]);

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

  // Get default payment method
  const defaultPaymentMethod = paymentMethods.find((pm) => pm.isDefault);

  // Custom close handler that resets payment processing state
  const handleClose = useCallback(() => {
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
    setProcessingPackageName("");
    setOriginalPurchaseContext(null);
    onClose();
  }, [onClose]);

  // Reset payment processing state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      setProcessingPackageName("");
      setOriginalPurchaseContext(null);
      setUpsellTriggered(false);
      lastAutoAppliedCodeRef.current = null;
      specialPackagePurchaseLockRef.current = false;

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
  };

  const handlePurchase = async (pkg: StaticMembershipPackage) => {
    if (isProcessing || specialPackagePurchaseLockRef.current) return;

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
      if (!defaultPaymentMethod) {
        throw new Error("No default payment method found. Please select a payment method.");
      }

      const result = await purchaseMembership.mutateAsync({
        packageId: pkg._id,
        userId: userData?._id || "",
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

      const resolvedPaymentIntentId =
        (result as { paymentIntent?: { id: string } }).paymentIntent?.id || result.data?.paymentIntent?.id;
      if (resolvedPaymentIntentId) {
        setPaymentIntentId(resolvedPaymentIntentId);
        setProcessingPackageName(pkg.name);
        setShowPaymentProcessing(true);
      } else {
        const fallbackBenefits: { text: string; icon: "gift" | "star" | "zap" | "ticket" | "tag"; highlight?: boolean }[] = [
          { text: `${pkg.totalEntries || 0} entries added to your wallet`, icon: "gift" },
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
          `${pkg.totalEntries || 0} entries added to your account`,
          fallbackBenefits,
          3000
        );
        handleClose();
      }
    } catch (error) {
      console.error("Special package purchase failed:", error);
      hideLoading();
      console.error(`Purchase failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      specialPackagePurchaseLockRef.current = false;
      setIsProcessing(false);
    }
  };

  // Payment processing handlers
  const handlePaymentSuccess = async (status: PaymentStatusResponse) => {
    // console.log("🎉 Special package payment processing completed:", status);
    // console.log("🔍 handlePaymentSuccess called - about to trigger upsell");
    setShowPaymentProcessing(false);

    // ✅ REMOVED: Client-side Facebook Pixel tracking
    // Server-side tracking via grantBenefits → trackPixelPurchase is sufficient and more reliable
    // This prevents duplicate tracking that causes inflated revenue in Facebook Ads

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
      const appliedMultiplier =
        packageWithPromo?.promoMultiplier ??
        (getEffectivePromoType(selectedPackage._id, "one-time", hasActiveSubscription) === "membership-packages"
          ? resolvedMembershipMultiplier
          : resolvedOneTimeMultiplier) ??
        1;

      // Create context object in local variable to pass directly (avoids closure issue)
      contextToPass = {
        paymentIntentId,
        packageId: selectedPackage._id || "",
        packageName: processingPackageName,
        packageType: "one-time",
        price: selectedPackage.price,
        entries: status.data?.entries || 0,
        baseEntries,
        promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined, // Only store if multiplier > 1
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

  const handlePaymentError = (error: string) => {
    console.error("❌ Special package payment processing failed:", error);
    setShowPaymentProcessing(false);
    // Could show error message to user here
  };

  const handlePaymentTimeout = () => {
    // console.warn("⏰ Special package payment processing timed out");
    setShowPaymentProcessing(false);
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

  const _handleCardSelection = () => {
    // Close the special packages modal first
    handleClose();

    // Small delay to ensure modal is closed before opening membership modal
    setTimeout(() => {
      // Create a custom event to trigger the membership modal with special package
      const event = new CustomEvent("showSpecialPackagePayment", {
        detail: { package: selectedPackage },
      });
      window.dispatchEvent(event);
      // console.log("🔄 Redirecting to MembershipModal for card selection");
    }, 100);
  };

  return (
    <>
      {/* Payment Processing Screen */}
      {showPaymentProcessing && paymentIntentId && (
        <PaymentProcessingScreen
          paymentIntentId={paymentIntentId}
          packageName={processingPackageName}
          packageType="one-time"
          isVisible={showPaymentProcessing}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
          onTimeout={handlePaymentTimeout}
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
        {!selectedPackage && (
          <div className="bg-white text-gray-800 dark:bg-neutral-900 dark:text-neutral-100 p-2 sm:p-3 text-center border-b border-gray-200 dark:border-neutral-800">
            <h2 className="text-green-600 dark:text-emerald-400 text-xs sm:text-sm font-bold mb-1">
              CONGRATULATIONS{userData?.firstName ? ` ${userData.firstName.toUpperCase()}` : ""}!
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 mb-3">
              you are entitled to{" "}
              <SpecialPackages50OffText />
              today
            </p>

            {/* Divider-style: ----- icon special packages activated ----- */}
            <div className="flex w-full items-center justify-center gap-2 sm:gap-3 text-gray-400 dark:text-neutral-500">
              <span
                className="h-px min-w-[40px] flex-1 origin-right animate-[lineExpand_0.7s_ease-out_forwards] bg-gradient-to-r from-transparent via-gray-300 to-gray-400 dark:from-transparent dark:via-neutral-600 dark:to-neutral-500"
                style={{ animationDelay: "0.1s" }}
              />
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 animate-[fadeSlideUp_0.5s_ease-out_forwards] opacity-0" style={{ animationDelay: "0.35s" }}>
                <Zap className="w-3.5 h-3.5 shrink-0 text-amber-500 sm:w-4 sm:h-4 animate-[pulse_2s_ease-in-out_infinite]" style={{ animationDelay: "1s" }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400 sm:text-xs">
                  Special Packages Activated
                </span>
              </div>
              <span
                className="h-px min-w-[40px] flex-1 origin-left animate-[lineExpand_0.7s_ease-out_forwards] bg-gradient-to-r from-gray-400 via-gray-300 to-transparent dark:from-neutral-500 dark:via-neutral-600 dark:to-transparent"
                style={{ animationDelay: "0.1s" }}
              />
            </div>
          </div>
        )}

        <ModalContent scrollbar="metallic" padding="none" className="flex flex-col p-3 sm:p-6">
          {/* Package List - Styled to match PackageSelectionModal (uses package color scheme) */}
          <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
            {packagesWithPromo.map((pkg) => {
              const colorScheme = getPackageColorSchemeForPromo(pkg._id || "", false, variantConfig);
              const isSelected = selectedPackage?._id === pkg._id;
              const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
              // Use solid accent color for card text - textGradientStyle with backgroundClip can make nested text invisible on dark cards
              const cardTextStyle = { color: accentHex };
              const selectTextClass = colorScheme.enterNowButtonTextClass ?? (colorScheme.textGradientStyle ? "" : "text-white");
              const cardInnerBg = "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)";
              return (
                <div
                  key={pkg._id}
                  className="relative rounded-2xl p-2.5 sm:p-4 transition-all duration-300 cursor-pointer"
                  style={{
                    ...getCardBorderStyle(colorScheme, cardInnerBg),
                    ...(!colorScheme.cardBorderGradient && { background: cardInnerBg }),
                    boxShadow: isSelected
                      ? `0 0 0 2px rgba(255,255,255,0.5), 0 0 24px ${hexToRgba(accentHex, 0.5)}, 0 8px 32px ${hexToRgba(accentHex, 0.2)}`
                      : `0 0 15px ${hexToRgba(accentHex, 0.25)}, 0 4px 20px rgba(0,0,0,0.2)`,
                  }}
                  onClick={() => handlePackageSelect(pkg)}
                >
                  {/* Promo Badge - Upper right, like PackageSelectionModal/MembershipSection */}
                  {pkg.isPromoActive && pkg.promoMultiplier && (
                    <div className="absolute -top-4 -right-4 sm:-top-5 sm:-right-5 z-30">
                      <Image
                        src={`/images/badge/X${pkg.promoMultiplier}.png`}
                        alt={`${pkg.promoMultiplier}x entries`}
                        width={64}
                        height={64}
                        className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                      />
                    </div>
                  )}

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div
                      className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 text-white rounded-full flex items-center justify-center shadow-lg"
                      style={colorScheme.badgeStyle}
                    >
                      <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    </div>
                  )}

                  {/* Package Icon - Centered at top */}
                  {getPackageIcon(pkg._id) && (
                    <div className="absolute -top-4 sm:-top-5 left-1/2 transform -translate-x-1/2 z-20">
                      <div className="w-8 h-8 sm:w-12 sm:h-12 relative">
                        <Image
                          src={getPackageIcon(pkg._id)!}
                          alt={`${pkg.name} icon`}
                          fill
                          sizes="(max-width: 640px) 32px, 48px"
                          className={`w-full h-full object-contain opacity-90 ${colorScheme.glow}`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-[1fr_auto_1fr] grid-rows-1 items-center gap-2 sm:gap-3 pt-2 sm:pt-3">
                    {/* Package Name - Left, two rows (same row as entries & price) */}
                    <div className="min-w-0 text-xs sm:text-sm font-semibold leading-tight" style={cardTextStyle}>
                      {(() => {
                        const parts = pkg.name.split(" ");
                        if (parts[0]?.toLowerCase() === "additional" && parts.length > 1) {
                          return (
                            <>
                              <span className="block">Additional</span>
                              <span className="block">{parts.slice(1).join(" ")}</span>
                            </>
                          );
                        }
                        return <span>{pkg.name}</span>;
                      })()}
                    </div>

                    {/* Main Entries Display - Pinned to card center, aligns with icon (grid center column) */}
                    <div className="flex flex-col items-center justify-center min-w-[60px] sm:min-w-[72px]" style={cardTextStyle}>
                      <div className="text-base sm:text-lg font-bold">
                        {pkg.totalEntries || 0}
                      </div>
                      <div className="text-xs font-bold opacity-90">ENTRIES</div>
                    </div>

                    {/* Right Side - Price and SELECT button (same style as Enter Now) */}
                    <div className="flex items-center justify-end gap-2 sm:gap-2">
                      <div className="text-base sm:text-lg font-bold" style={cardTextStyle}>${pkg.price}</div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePackageSelect(pkg);
                        }}
                        className={`min-w-[52px] sm:min-w-[58px] px-2 py-1 sm:px-2.5 sm:py-1.5 text-[10px] sm:text-xs font-bold rounded-lg transition-colors flex-shrink-0 flex items-center justify-center hover:opacity-90 ${selectTextClass} ${colorScheme.borderGlow} ${isSelected ? "shadow-md" : ""}`}
                        style={colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle}
                      >
                        <span style={colorScheme.textGradientStyle ?? undefined}>{isSelected ? "✓" : "SELECT"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coupon Code Input - Matches MembershipModal exactly for full width */}
          <div className="mb-3 sm:mb-4 w-full">
            <div className="flex gap-2 w-full">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value);
                  setCouponApplied(false);
                  setCouponType(null);
                  setCouponError(null);
                }}
                placeholder="Enter coupon code"
                className="flex-1 min-w-0 h-11 px-2 sm:px-3 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-[#ee0000] focus:border-transparent transition-all duration-300 text-sm sm:text-base bg-white text-gray-900 placeholder:text-gray-500 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-100 dark:placeholder:text-gray-400"
              />
              {couponApplied ? (
                <div className="h-11 bg-green-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  <Check size={12} />
                  <span className="text-xs font-bold">APPLIED</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCouponApply()}
                  className="h-11 bg-gray-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl hover:bg-gray-600 transition-colors text-xs sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                >
                  Apply
                </button>
              )}
            </div>
            {couponError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{couponError}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 sm:space-y-3">
            {/* Buy Button - uses package badgeStyle when package selected (same as Enter Now) */}
            {selectedPackage ? (() => {
              const colorScheme = getPackageColorSchemeForPromo(selectedPackage._id || "", false, variantConfig);
              const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
              const accentDark = darkenHex(accentHex, 34);
              const textClass = colorScheme.enterNowButtonTextClass ?? "text-white";
              const buttonStyle = {
                ...(colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle),
                background: `linear-gradient(135deg, ${accentHex} 0%, ${accentDark} 100%)`,
                border: `1px solid ${hexToRgba(accentHex, 0.55)}`,
                boxShadow: `0 10px 24px ${hexToRgba(accentHex, 0.35)}, inset 0 1px 0 ${hexToRgba("#ffffff", 0.22)}`,
              };
              return (
                <button
                  type="button"
                  onClick={() => defaultPaymentMethod && handlePurchase(selectedPackage)}
                  disabled={isProcessing || !defaultPaymentMethod}
                  className={`font-agency font-black uppercase w-full rounded-2xl py-2 sm:py-3 flex items-center justify-center gap-3 sm:gap-4 text-sm sm:text-base transition-all duration-300 transform ${textClass} ${colorScheme.borderGlow} membership-enter-cta-animation disabled:cursor-not-allowed relative overflow-hidden`}
                  style={buttonStyle}
                >
                  {isProcessing ? (
                    <span className="relative z-10">Processing...</span>
                  ) : defaultPaymentMethod ? (
                    <>
                      <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 relative z-10" />
                      <span className="relative z-10">
                        Buy Now - ${selectedPackage.price}
                      </span>
                      <div className="flex items-center gap-1.5 bg-white/20 rounded px-2 sm:px-3 py-1 sm:py-1.5 relative z-10">
                        <CreditCard className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        <span className="text-xs">
                          •••• {defaultPaymentMethod.card?.last4}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="relative z-10">No Payment Method</span>
                  )}
                </button>
              );
            })() : (
              <Button
                disabled
                variant="secondary"
                fullWidth
                size="md"
                className="font-bold text-sm sm:text-base py-2 sm:py-3 opacity-75 cursor-not-allowed"
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>Select Pack</span>
                </div>
              </Button>
            )}

          </div>

          {/* Additional Benefits - Only shown when package is selected (uses package color scheme) */}
          {selectedPackage && (() => {
            const colorScheme = getPackageColorSchemeForPromo(selectedPackage._id || "", false, variantConfig);
            const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
            // Use solid accent color - gradient styles (packageInclusionTextStyle/textGradientStyle) can make text invisible on dark card backgrounds
            const benefitsTextStyle = { color: accentHex };
            return (
              <div
                className="rounded-2xl p-3 sm:p-4 my-3 sm:my-4"
                style={{
                  ...getCardBorderStyle(colorScheme, "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)"),
                  ...(!colorScheme.cardBorderGradient && { background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }),
                  boxShadow: `0 0 15px ${hexToRgba(accentHex, 0.25)}, 0 4px 20px rgba(0,0,0,0.2)`,
                }}
              >
                <h4 className="text-xs sm:text-sm font-bold mb-2 sm:mb-3" style={benefitsTextStyle}>
                  {selectedPackage.name} Benefits
                </h4>
                <div className="space-y-2 sm:space-y-2.5">
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm" style={benefitsTextStyle}>
                    <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={benefitsTextStyle} />
                    <span>{selectedPackage.totalEntries || 0} Free Entries</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm" style={benefitsTextStyle}>
                    <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={benefitsTextStyle} />
                    <span>{selectedPackage.partnerDiscountDays || 0} Days Partner Discounts</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm" style={benefitsTextStyle}>
                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={benefitsTextStyle} />
                    <span>100% Partner Discounts Available</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Trust Indicators */}
          <div className="mt-4 border-t border-gray-200 pt-3 dark:border-neutral-800 sm:mt-6 sm:pt-4">
            <div className="flex items-center justify-center gap-3 text-xs text-gray-500 dark:text-neutral-400 sm:gap-6 sm:text-sm">
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>Instant</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>Secure</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>One-Time</span>
              </div>
            </div>
          </div>
        </ModalContent>
      </ModalContainer>
    </>
  );
};

export default SpecialPackagesModal;
