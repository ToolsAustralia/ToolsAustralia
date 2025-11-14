"use client";

import React, { useState, useEffect } from "react";
import { Gift, CheckCircle, Sparkles } from "lucide-react";
import { useLoading } from "@/contexts/LoadingContext";

interface CancellationUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRedeem: () => void;
  onDecline: () => void;
}

/**
 * CancellationUpsellModal Component
 * Appears when user tries to cancel their subscription
 * Offers 100 free entries as a retention incentive
 * Matches the existing UpsellModal design patterns
 */
const CancellationUpsellModal: React.FC<CancellationUpsellModalProps> = ({ isOpen, onClose, onRedeem, onDecline }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { showLoading, hideLoading, showSuccess } = useLoading();

  // Animation effect
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Handle body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleRedeem = async () => {
    if (isProcessing) return;

    setIsProcessing(true);

    // Show loading feedback
    showLoading("Processing Purchase", "", [
      "Processing your reward",
      "Adding entries to your account",
      "Updating your dashboard",
    ]);

    try {
      const response = await fetch("/api/cancellation-upsell/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to redeem free entries");
      }

      // Hide loading and show success
      hideLoading();
      showSuccess(
        "Free Entries Redeemed!",
        "100 free entries added to your account",
        [
          {
            text: "100 entries added to your account",
            icon: "star" as const,
          },
          {
            text: "Entries added to major draw",
            icon: "gift" as const,
          },
          {
            text: "Redirecting to dashboard",
            icon: "star" as const,
          },
        ],
        2000
      );

      // Call the redeem handler
      onRedeem();

      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error("Failed to redeem free entries:", error);
      hideLoading();

      // Show error but don't close modal - let user try again
      showSuccess(
        "Error",
        "Failed to redeem free entries. Please try again.",
        [
          {
            text: "Please try again",
            icon: "star" as const,
          },
        ],
        3000
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = () => {
    onDecline();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4">
      {/* Animated Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Animated Modal */}
      <div
        className={`
          relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg mx-auto overflow-hidden
          transform transition-all duration-300 ease-out
          ${isVisible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"}
        `}
      >
        {/* Main Content */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-5">
          {/* Hero Section */}
          <div
            className="relative rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)`,
            }}
          >
            {/* Content */}
            <div className="relative z-10 text-white">
              {/* Category Icon */}
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg">
                  <Gift className="w-6 h-6" />
                </div>
                <span className="text-md sm:text-xl font-bold font-['Poppins'] opacity-90">
                  Wait! Don&apos;t Go Yet!
                </span>
              </div>

              {/* Title */}
              <h2 className="text-lg sm:text-2xl font-bold mb-2 sm:mb-3 font-['Poppins'] leading-tight">
                Get 100 FREE Entries!
              </h2>

              {/* Description */}
              <p className="text-sm sm:text-base opacity-90 mb-3 sm:mb-4 leading-relaxed">
                We don&apos;t want to see you go! Stay with us and get 100 free entries added to your account right now.
                These entries will be added to both your account and the major draw.
              </p>

              {/* Free Badge */}
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="text-2xl sm:text-3xl font-bold">FREE</div>
                <div className="bg-white/20 rounded-lg px-3 py-1">
                  <span className="text-sm font-medium">100 Entries</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 sm:space-y-3">
            {/* Primary CTA - Redeem Free Entries */}
            <button
              onClick={handleRedeem}
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-xl font-bold text-base sm:text-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isProcessing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Redeeming...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Redeem 100 Free Entries</span>
                </div>
              )}
            </button>

            {/* Secondary Action */}
            <button
              onClick={handleDecline}
              className="w-full text-gray-500 py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl hover:bg-gray-100 transition-colors font-medium text-sm sm:text-base"
            >
              No thanks, continue with cancellation
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-500">
              <div className="flex items-center gap-1 sm:gap-2">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>Instant</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>No Expiry</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span>One-Time Only</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CancellationUpsellModal;
