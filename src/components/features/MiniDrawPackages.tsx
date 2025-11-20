"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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

interface MiniDrawPackagesProps {
  miniDrawId: string;
  minimumEntries?: number;
  totalEntries?: number;
}

export default function MiniDrawPackages({ miniDrawId, minimumEntries, totalEntries }: MiniDrawPackagesProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { showToast } = useToast();
  const { userData, isAuthenticated } = useUserContext();
  const { data: paymentMethods } = usePaymentMethods(userData?._id);

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

  // Get selected package for modal
  const selectedPackage = selectedPackageId ? miniDrawPackages.find((p) => p._id === selectedPackageId) : null;

  // Remaining capacity guard for client-side disablement
  const entriesRemaining =
    typeof minimumEntries === "number" && typeof totalEntries === "number"
      ? Math.max(minimumEntries - totalEntries, 0)
      : undefined;
  const isSoldOut = entriesRemaining !== undefined && entriesRemaining <= 0;

  const handlePurchase = async (packageId: string) => {
    if (!session?.user) {
      showToast({
        type: "error",
        title: "Please sign in to purchase packages",
      });
      router.push("/auth/signin");
      return;
    }

    try {
      setPurchasingPackageId(packageId);

      // Get the package details
      const pkg = miniDrawPackages.find((p) => p._id === packageId);
      if (!pkg) {
        throw new Error("Package not found");
      }

      // Check if user has default payment method for automatic charging
      const hasDefaultPayment = !!defaultPaymentMethod?.paymentMethodId;
      const useDefaultPayment = hasDefaultPayment;
      const paymentMethodId = hasDefaultPayment ? defaultPaymentMethod.paymentMethodId : undefined;

      console.log("🛒 Mini draw purchase:", {
        packageId,
        miniDrawId,
        useDefaultPayment,
        hasPaymentMethod: !!paymentMethodId,
      });

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
    console.log("🎉 Payment processing completed successfully:", status);

    // ✅ CRITICAL: Prevent duplicate toast notifications
    // This function can be called multiple times:
    // 1. From polling when payment is processed
    // 2. From fallback timer in PaymentProcessingScreen
    // We only want to show the toast once
    if (successToastShown) {
      console.log("⏭️ Success toast already shown, skipping duplicate");
      return;
    }

    setShowPaymentProcessing(false);

    // ✅ ONLY show success when webhook confirms payment completed
    if (status.status === "completed") {
      // Mark toast as shown to prevent duplicates
      setSuccessToastShown(true);

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
    console.warn("⏰ Payment processing timed out - webhook may still be processing");
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
    packageType?: "subscription" | "one-time" | "mini-draw"
  ) => {
    try {
      if (packageId && packageType) {
        console.log(`🎯 Triggering targeted upsell for package: ${packageId} (${packageType})`);

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
    <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <Package className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
        <h3 className="text-base sm:text-lg font-bold text-gray-900">Purchase Entries</h3>
      </div>
      {entriesRemaining !== undefined && (
        <div
          className={`mb-3 sm:mb-4 text-xs sm:text-sm font-semibold ${
            isSoldOut ? "text-red-600" : "text-gray-700"
          } text-center`}
        >
          {isSoldOut ? "Sold out — no more entries available." : `Only ${entriesRemaining} entries remaining.`}
        </div>
      )}
      <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-4 gap-2 sm:gap-3">
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
                  !session?.user ||
                  isSoldOut ||
                  (entriesRemaining !== undefined && pkg.entries > entriesRemaining)
                }
                className="w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 text-black py-2 sm:py-3 px-2 sm:px-3 rounded-lg font-bold text-xs sm:text-sm hover:from-yellow-500 hover:via-orange-500 hover:to-red-500 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {purchasingPackageId === pkg._id ? (
                  <div className="flex items-center justify-center gap-1">
                    <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-black border-t-transparent"></div>
                    <span className="text-[10px] sm:text-xs">Processing...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                    <div className="text-xs sm:text-base font-semibold">${pkg.price}</div>
                    <div className="text-[10px] sm:text-sm font-medium opacity-90">{pkg.entries} Entries</div>
                    {entriesRemaining !== undefined && pkg.entries > entriesRemaining && (
                      <span className="text-[9px] sm:text-xs font-semibold text-red-700">
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
                className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 z-20"
                onClick={(e) => {
                  e.stopPropagation();
                  // Open modal on click
                  setSelectedPackageId(pkg._id);
                }}
              >
                <Info className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
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
          disabled={!session?.user}
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
    </div>
  );
}
