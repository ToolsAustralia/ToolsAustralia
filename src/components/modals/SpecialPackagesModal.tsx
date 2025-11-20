"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Gift, Zap, CheckCircle, CreditCard, Sparkles } from "lucide-react";
import { useUserContext } from "@/contexts/UserContext";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useLoading } from "@/contexts/LoadingContext";
// Upsell store removed - using unified modal priority system
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { markPurchaseCompleted } from "@/utils/tracking/purchase-tracking";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse } from "@/hooks/queries";
import { usePurchaseMembership } from "@/hooks/queries/useMembershipQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import { ModalContainer, ModalHeader, ModalContent, Button, Input } from "./ui";

/**
 * SpecialPackagesModalProps Interface
 * Props for the SpecialPackagesModal component
 */
export interface SpecialPackagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  packages: StaticMembershipPackage[];
  onPackageSelect: (pkg: StaticMembershipPackage) => void;
}

/**
 * SpecialPackagesModal Component
 * Displays exclusive member-only one-time packages for users with active subscriptions
 * Features package selection with one-click purchase using saved payment methods
 */
const SpecialPackagesModal: React.FC<SpecialPackagesModalProps> = ({ isOpen, onClose, packages, onPackageSelect }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<StaticMembershipPackage | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [upsellTriggered, setUpsellTriggered] = useState(false); // Guard against duplicate upsell calls

  // Payment processing state
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [processingPackageName, setProcessingPackageName] = useState<string>("");
  const [originalPurchaseContext, setOriginalPurchaseContext] = useState<OriginalPurchaseContext | null>(null);

  // Get user context and payment methods
  const { isAuthenticated, userData, hasActiveSubscription } = useUserContext();
  const { paymentMethods } = useSavedPaymentMethods();

  // Get packages with promo applied (if needed)
  // Note: Promo handling for member-only packages can be added later if needed
  const packagesWithPromo = React.useMemo(() => {
    // For now, return packages as-is since promo handling for member-only packages
    // may need special handling. Can be enhanced later if needed.
    return packages;
  }, [packages]);

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
  // Upsell functionality now handled through modal priority system
  const { mutate: purchaseMembership } = usePurchaseMembership();

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
    }
  }, [isOpen]);

  // CRITICAL: Verify user has active subscription before showing modal
  if (!isOpen) return null;

  // Verify user is authenticated and has active subscription
  if (!isAuthenticated || !hasActiveSubscription) {
    console.log("🚫 SpecialPackagesModal: User not authenticated or no active subscription");
    return null;
  }

  const handlePackageSelect = (pkg: StaticMembershipPackage) => {
    // Single selection - unselect current and select new
    setSelectedPackage(pkg);
    onPackageSelect(pkg);
  };

  const handleCouponApply = () => {
    if (couponCode === "5x") {
      setCouponApplied(true);
    }
  };

  const handlePurchase = async (pkg: StaticMembershipPackage) => {
    if (isProcessing) return;

    setIsProcessing(true);

    // Show global loading screen
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
        "🛒 Processing special package purchase:",
        pkg.name,
        "with default payment method:",
        defaultPaymentMethod.paymentMethodId
      );

      // Use membership purchase hook (one-time package purchase)
      purchaseMembership(
        {
          packageId: pkg._id,
          userId: userData?._id || "",
        },
        {
          onSuccess: (result) => {
            console.log("🔍 SpecialPackagesModal onSuccess called with result:", result);
            if (result.success) {
              console.log("🔍 Purchase successful, setting up payment processing");
              // Mark purchase as completed to prevent modal conflicts
              markPurchaseCompleted();

              // Hide loading and show PaymentProcessingScreen
              hideLoading();

              // Set up payment processing screen
              // API response has paymentIntent at root level, but type expects it in data
              const paymentIntentId =
                (result as { paymentIntent?: { id: string } }).paymentIntent?.id || result.data?.paymentIntent?.id;
              if (paymentIntentId) {
                setPaymentIntentId(paymentIntentId);
                setProcessingPackageName(pkg.name);
                setShowPaymentProcessing(true);
                // Don't close modal yet - let PaymentProcessingScreen handle it
              } else {
                // Fallback to old success screen if no paymentIntentId
                showSuccess(
                  "Purchase Successful!",
                  `${pkg.totalEntries || 0} entries added to your account`,
                  [{ text: `${pkg.totalEntries || 0} entries added to your wallet`, icon: "gift" }],
                  3000
                );
                // Close modal for fallback case
                handleClose();
              }

              // Note: Upsell will be triggered after payment processing completes
              // This prevents duplicate upsell triggers
            } else {
              throw new Error("Package purchase failed");
            }
          },
          onError: (error) => {
            hideLoading();
            throw new Error(error.message || "Package purchase failed");
          },
        }
      );
    } catch (error) {
      console.error("Special package purchase failed:", error);
      hideLoading();
      console.error(`Purchase failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Payment processing handlers
  const handlePaymentSuccess = (status: PaymentStatusResponse) => {
    console.log("🎉 Special package payment processing completed:", status);
    console.log("🔍 handlePaymentSuccess called - about to trigger upsell");
    setShowPaymentProcessing(false);

    // Store original purchase context for invoice finalization
    if (paymentIntentId && selectedPackage) {
      setOriginalPurchaseContext({
        paymentIntentId,
        packageId: selectedPackage._id || "",
        packageName: processingPackageName,
        packageType: "one-time",
        price: selectedPackage.price,
        entries: status.data?.entries || 0,
      });
      console.log("📧 Stored original purchase context for invoice finalization (special package)");
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

    // Add reward points if available
    if (status.data?.points && status.data.points > 0) {
      benefits.push({
        text: `${status.data.points} reward points earned`,
        icon: "zap" as const,
      });
    }

    // Show success modal with entry information
    showSuccess("Purchase Successful!", `${processingPackageName} activated`, benefits, 3000);

    // Trigger upsell modal for one-time purchase after success modal
    console.log("🔍 About to check upsellTriggered:", upsellTriggered);
    if (!upsellTriggered) {
      console.log("🔍 Setting upsellTriggered to true");
      setUpsellTriggered(true); // Mark that we've triggered this once

      setTimeout(() => {
        console.log("🎯 TRIGGERING UPSELL for special package purchase:", {
          packageName: processingPackageName,
          packagePrice: selectedPackage?.price,
          packageId: selectedPackage?._id,
        });

        // Use the EXACT same pattern as MembershipModal - call triggerUpsellModal function
        triggerUpsellModal(
          "one-time-purchase",
          processingPackageName,
          selectedPackage?.price || 0,
          selectedPackage?._id, // packageId
          "one-time", // packageType
          originalPurchaseContext
        );
      }, 2000); // 2 second delay
    } else {
      console.log("🔍 Upsell already triggered, skipping");
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
    console.warn("⏰ Special package payment processing timed out");
    setShowPaymentProcessing(false);
    // Could show timeout message to user here
  };

  /**
   * Trigger upsell modal after successful purchase
   * EXACT COPY from MembershipModal
   */
  const triggerUpsellModal = async (
    triggerEvent: "membership-purchase" | "ticket-purchase" | "one-time-purchase",
    recentPurchase: string,
    purchaseAmount: number,
    packageId?: string,
    packageType?: "subscription" | "one-time",
    originalPurchaseContextParam?: OriginalPurchaseContext | null
  ) => {
    try {
      // If we have package information, use the new trigger API
      if (packageId && packageType) {
        console.log(`🎯 Triggering targeted upsell for package: ${packageId} (${packageType})`);

        const response = await fetch("/api/upsell/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId,
            packageType,
            userType: "special-package-buyer", // User type for special package purchases
            isMember: hasActiveSubscription, // Pass membership status
            triggerEvent,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log("🔍 Upsell trigger API result:", result);

          if (result.success && result.data?.offer) {
            const offer = result.data.offer;
            console.log(`✅ Found targeted upsell offer: ${offer.name}`);

            // Show the targeted upsell with a delay
            setTimeout(() => {
              // Convert offer to UpsellOffer format and show upsell modal
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

              // Prepare user context
              const userContext: UpsellUserContext = {
                isAuthenticated: isAuthenticated,
                hasDefaultPayment: isAuthenticated && !!defaultPaymentMethod,
                recentPurchase: recentPurchase,
                userType: "special-package-buyer", // User type for special package purchases
                totalSpent: purchaseAmount,
                upsellsShown: 0,
              };

              // Use passed parameter or fallback to state
              const finalOriginalPurchaseContext = originalPurchaseContextParam ?? originalPurchaseContext;

              // Use modal priority system to show upsell
              const { requestModal } = useModalPriorityStore.getState();
              console.log("🎯 Requesting upsell modal via priority system:", {
                upsellOffer: upsellOffer.title,
                userContext,
              });
              requestModal("upsell", false, {
                offer: upsellOffer,
                userContext,
                originalPurchaseContext: finalOriginalPurchaseContext || undefined,
              });
            }, offer.showAfterDelay * 1000 || 2000);

            return;
          } else {
            console.log("❌ No upsell offer found in API response:", result);
          }
        } else {
          console.log("❌ Upsell trigger API failed:", response.status, response.statusText);
        }
      }

      // Fallback to modal priority system with default upsell
      console.log(`🎯 Using fallback upsell system for: ${recentPurchase}`);

      // Create a default upsell offer for fallback
      const defaultUpsellOffer: UpsellOffer = {
        id: "fallback-upsell",
        title: "Complete Your Experience",
        description: "Get the most out of your membership with our premium features!",
        category: "membership",
        discountPercentage: 20,
        originalPrice: 99,
        discountedPrice: 79,
        entriesCount: 200,
        buttonText: "Complete Experience - $79",
        conditions: ["200 Monthly Entries", "Premium member benefits", "Priority support", "Special member-only draws"],
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        priority: 5,
        isActive: true,
        targetAudience: ["all-users"],
        userSegments: ["new-user", "returning-user"],
        maxShowsPerUser: 1,
        cooldownHours: 24,
      };

      const fallbackUserContext: UpsellUserContext = {
        isAuthenticated,
        hasDefaultPayment: isAuthenticated && !!defaultPaymentMethod,
        recentPurchase: recentPurchase || "special-package",
        userType: isAuthenticated ? "returning-user" : "new-user",
        totalSpent: purchaseAmount,
        upsellsShown: 0,
      };

      // Use modal priority system for fallback
      const { requestModal } = useModalPriorityStore.getState();
      console.log("🎯 Requesting fallback upsell modal via priority system");
      requestModal("upsell", false, { offer: defaultUpsellOffer, userContext: fallbackUserContext });
    } catch (error) {
      console.error("Error triggering upsell:", error);
      // Skip upsell on error to avoid blocking the user experience
      console.log("🎯 Skipping upsell due to error");
    }
  };

  const handleCardSelection = () => {
    // Close the special packages modal first
    handleClose();

    // Small delay to ensure modal is closed before opening membership modal
    setTimeout(() => {
      // Create a custom event to trigger the membership modal with special package
      const event = new CustomEvent("showSpecialPackagePayment", {
        detail: { package: selectedPackage },
      });
      window.dispatchEvent(event);
      console.log("🔄 Redirecting to MembershipModal for card selection");
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
        fixedHeight="h-[90dvh]"
        closeOnBackdrop={false}
        className="flex flex-col"
      >
        <ModalHeader title="" onClose={handleClose} showLogo={true} logoSize="sm" />

        {/* Congratulations Section - Below Header (hidden when package is selected) */}
        {!selectedPackage && (
          <div className="bg-white text-gray-800 p-2 sm:p-3 text-center border-b border-gray-200">
            <h2 className="text-green-600 text-xs sm:text-sm font-bold mb-1">
              CONGRATULATIONS{userData?.firstName ? ` ${userData.firstName.toUpperCase()}` : ""}!
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mb-2">
              You are currently in the draw and entitled to <span className="text-green-600 font-bold">50% OFF</span>{" "}
              today!
            </p>

            {/* Banner */}
            <div className="bg-black rounded-lg p-1.5 sm:p-2 flex items-center justify-center gap-1 sm:gap-1.5 mx-auto w-fit">
              <Zap className="w-3 h-3 sm:w-3 sm:h-3 text-yellow-400" />
              <span className="text-white font-bold text-xs">SPECIAL PACKAGES ACTIVATED</span>
            </div>
          </div>
        )}

        <ModalContent scrollbar="metallic" padding="none" className="flex flex-col p-3 sm:p-6">
          {/* Package List */}
          <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
            {packagesWithPromo.map((pkg) => (
              <div
                key={pkg._id}
                className={`relative bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg p-2 sm:p-3 cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg ${
                  selectedPackage?._id === pkg._id ? "ring-2 ring-red-500 shadow-xl scale-[1.02]" : "hover:scale-[1.01]"
                }`}
                onClick={() => handlePackageSelect(pkg)}
              >
                {/* Selection Indicator */}
                {selectedPackage?._id === pkg._id && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                    <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                  </div>
                )}

                <div className="flex items-center">
                  {/* Left Side - Entries Info */}
                  <div className="flex-[2] flex items-center justify-between px-1 sm:px-2">
                    {/* Package Name */}
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className="text-xs sm:text-sm text-black font-semibold">{pkg.name}</div>
                      {/* Promo Badge for packages */}
                      {pkg.isPromoActive && pkg.promoMultiplier && (
                        <PromoBadge multiplier={pkg.promoMultiplier as 2 | 3 | 5 | 10} size="small" />
                      )}
                    </div>

                    {/* Main Entries Display */}
                    <div className="text-center">
                      <div
                        className={`text-base sm:text-lg font-bold ${
                          selectedPackage?._id === pkg._id ? "text-green-600" : "text-black"
                        }`}
                      >
                        {pkg.totalEntries || 0}
                      </div>
                      <div className="text-xs font-bold text-black">ENTRIES</div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-8 sm:h-10 bg-black/20 mx-1 sm:mx-2"></div>

                  {/* Right Side - Price and Button */}
                  <div className="flex-1 flex items-center justify-between gap-1 sm:gap-2">
                    {/* Main Price Display */}
                    <div className="text-base sm:text-lg font-bold text-black">${pkg.price}</div>

                    {/* Select Button */}
                    <Button
                      onClick={() => handlePackageSelect(pkg)}
                      variant={selectedPackage?._id === pkg._id ? "primary" : "secondary"}
                      size="sm"
                      className="flex-shrink-0 text-xs px-2 sm:px-3"
                    >
                      {selectedPackage?._id === pkg._id ? "✓" : "SELECT"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Coupon Code Input */}
          <div className="mb-3 sm:mb-4">
            <div className="flex gap-1.5 sm:gap-2">
              <Input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Enter coupon code"
                className="flex-1 text-xs sm:text-sm"
              />
              {couponApplied ? (
                <div className="bg-green-500 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-lg flex items-center gap-1 sm:gap-2">
                  <CheckCircle size={14} className="sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm font-bold">APPLIED</span>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={handleCouponApply}
                  variant="secondary"
                  size="sm"
                  className="text-xs px-3 sm:px-4"
                >
                  Apply
                </Button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 sm:space-y-3">
            {/* Buy Button */}
            <Button
              onClick={() => selectedPackage && handlePurchase(selectedPackage)}
              disabled={isProcessing || !selectedPackage || !defaultPaymentMethod}
              variant="metallic"
              fullWidth
              size="md"
              loading={isProcessing}
              className="font-bold text-sm sm:text-base py-2 sm:py-3"
            >
              {!selectedPackage ? (
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>Select Pack</span>
                </div>
              ) : defaultPaymentMethod ? (
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Buy Now - ${selectedPackage.price}</span>
                  <div className="flex items-center gap-1 ml-1 sm:ml-2 bg-white/20 rounded px-1.5 sm:px-2 py-0.5 sm:py-1">
                    <CreditCard className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="text-xs">•••• {defaultPaymentMethod.card?.last4}</span>
                  </div>
                </div>
              ) : (
                "No Payment Method"
              )}
            </Button>

            {/* Select Different Payment Method Button (DISABLED) */}
            {/* <Button
              onClick={handleCardSelection}
              disabled={!selectedPackage}
              variant="secondary"
              fullWidth
              size="sm"
              className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2"
            >
              <CreditCard className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Select different payment method</span>
              <span className="sm:hidden">Select Payment</span>
            </Button> */}

            {/* Maybe Later Button */}
            <div className="text-center">
              <Button
                onClick={handleClose}
                variant="ghost"
                size="sm"
                className="text-gray-500 hover:text-gray-700 text-xs sm:text-sm"
              >
                Maybe Later
              </Button>
            </div>
          </div>

          {/* Additional Benefits - Only shown when package is selected */}
          {selectedPackage && (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm mb-3 sm:mb-4">
              <h4 className="text-xs sm:text-sm font-bold text-gray-900 mb-2 sm:mb-3">
                {selectedPackage.name} Benefits:
              </h4>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                  <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-red-500" />
                  <span>{selectedPackage.totalEntries || 0} Free Entries</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-orange-500" />
                  <span>{selectedPackage.partnerDiscountDays || 0} Days Partner Discounts</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                  <span>100% Partner Discounts Available</span>
                </div>
              </div>
            </div>
          )}

          {/* Trust Indicators */}
          <div className="pt-3 sm:pt-4 border-t border-gray-200 mt-4 sm:mt-6">
            <div className="flex items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-500">
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
