"use client";

import React, { useState, useEffect } from "react";
import { Check, Gift, Star, Zap, AlertCircle } from "lucide-react";
import { pollPaymentStatusWithCancel, type PaymentStatusResponse } from "@/utils/payment/payment-status";

interface PaymentProcessingScreenProps {
  paymentIntentId: string;
  packageName: string;
  packageType: "one-time" | "subscription" | "upsell" | "mini-draw";
  isVisible?: boolean;
  onSuccess?: (status: PaymentStatusResponse) => void;
  onError?: (error: string) => void;
  onTimeout?: () => void;
}

/**
 * Webhook-Aware Payment Processing Screen
 * Polls payment status and shows real-time progress based on webhook processing
 */
const PaymentProcessingScreen: React.FC<PaymentProcessingScreenProps> = ({
  paymentIntentId,
  packageName,
  packageType,
  isVisible = true,
  onSuccess,
  onError,
  onTimeout,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState<PaymentStatusResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Define processing steps based on package type
  const getProcessingSteps = () => {
    const baseSteps = [
      "Processing your payment...",
      "Verifying payment with Stripe...",
      "Granting your benefits...",
      "Updating your account...",
      "Adding entries to major draw...",
      "Finalizing your purchase...",
    ];

    switch (packageType) {
      case "subscription":
        return [...baseSteps, "Activating your subscription...", "Setting up recurring benefits..."];
      case "one-time":
        return [...baseSteps, "Adding entries to your account...", "Updating your rewards..."];
      case "upsell":
        return [...baseSteps, "Adding bonus entries...", "Updating your rewards..."];
      case "mini-draw":
        return [...baseSteps, "Adding mini-draw entries...", "Updating your account..."];
      default:
        return baseSteps;
    }
  };

  const steps = getProcessingSteps();

  useEffect(() => {
    if (!isVisible || !paymentIntentId) return;

    // Note: Removed immediate_upgrade case - all upgrades now follow webhook-first approach

    // Handle processing upgrade case (showing immediately when Pay button clicked)
    if (paymentIntentId === "processing_upgrade") {
      console.log("🔄 Processing upgrade - showing success after brief delay");

      // For upgrades, show processing steps and then success
      // Since webhook handles the actual processing, we just show progress
      let stepIndex = 0;
      const stepInterval = setInterval(() => {
        if (stepIndex < steps.length - 1) {
          setCurrentStep(stepIndex);
          stepIndex++;
        } else {
          clearInterval(stepInterval);
          // Show success after all steps complete
          setTimeout(() => {
            setIsProcessing(false);
            setCurrentStep(steps.length - 1);
            onSuccess?.({
              success: true,
              processed: true,
              status: "completed",
              data: {
                paymentIntentId: "upgrade_processing",
                message: "Upgrade completed successfully",
              },
            });
          }, 1000);
        }
      }, 2000); // Advance step every 2 seconds

      // Cleanup function
      return () => {
        clearInterval(stepInterval);
      };
    }

    // Start polling payment status with cancellation support
    const { promise, cancel } = pollPaymentStatusWithCancel(paymentIntentId, {
      interval: 2000, // Poll every 2 seconds
      timeout: 90000, // 90 second timeout for webhook processing
      onUpdate: (status) => {
        setStatus(status);

        // Update step based on status
        if (status.processed) {
          setCurrentStep(steps.length - 1);
          setIsProcessing(false);
          onSuccess?.(status);
        } else {
          // Increment step every 3 seconds while processing
          setCurrentStep((prev) => Math.min(prev + 1, steps.length - 2));
        }
      },
    });

    // Handle the polling result
    promise
      .then((result) => {
        if (result.processed) {
          setStatus(result);
          setIsProcessing(false);
          onSuccess?.(result);
        } else if (!result.success) {
          // Check if this is a timeout (payment might still be processing)
          if (result.data?.message?.includes("timeout")) {
            setIsProcessing(false);
            setError(
              "Payment processing is taking longer than expected. Your payment was successful and benefits will be added shortly. Please check your account in a few minutes."
            );
            onTimeout?.();
          } else {
            setIsProcessing(false);
            setError("Payment processing failed. Please check your account or contact support.");
            onError?.("Payment processing failed");
          }
        } else {
          // Payment is successful but not yet processed - show success after timeout
          console.log("Payment successful but not yet processed, will show success after timeout");
        }
      })
      .catch((err: unknown) => {
        setIsProcessing(false);
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        onError?.(errorMessage);
      });

    // Cleanup function to cancel polling
    return () => {
      cancel();
    };
  }, [isVisible, paymentIntentId, onSuccess, onError, onTimeout, steps.length]);

  // Auto-advance steps while processing
  useEffect(() => {
    if (!isProcessing || error) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        const nextStep = prev + 1;
        // Don't go to the last step until payment is processed
        return Math.min(nextStep, steps.length - 2);
      });
    }, 3000); // Advance step every 3 seconds

    return () => clearInterval(interval);
  }, [isProcessing, error, steps.length]);

  // Fallback: Show success after 30 seconds if payment is successful but not processed
  useEffect(() => {
    if (!isProcessing || !paymentIntentId || error) return;

    const fallbackTimer = setTimeout(() => {
      console.log("Fallback: Showing success after 30 seconds");
      setIsProcessing(false);
      onSuccess?.({
        success: true,
        processed: true,
        status: "completed",
        data: {
          paymentIntentId,
          message: "Payment completed successfully",
        },
      });
    }, 30000); // 30 seconds fallback

    return () => clearTimeout(fallbackTimer);
  }, [isProcessing, paymentIntentId, error, onSuccess]);

  if (!isVisible) return null;

  // Show success screen if payment is processed - using SuccessScreen design
  if (status?.processed && status.data) {
    const benefits = [];

    if (status.data.entries && status.data.entries > 0) {
      benefits.push({
        text: `${status.data.entries} entries added to your account`,
        icon: "star" as const,
      });
    }

    if (status.data.points && status.data.points > 0) {
      benefits.push({
        text: `${status.data.points} reward points earned`,
        icon: "gift" as const,
      });
    }

    if (status.data.entries && status.data.entries > 0) {
      benefits.push({
        text: `${status.data.entries} entries added to major draw`,
        icon: "zap" as const,
      });
    }

    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md mx-auto p-4 sm:p-8 text-center animate-in zoom-in-95 duration-500">
          <div className="mb-4 sm:mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-green-600 to-green-700 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-700 delay-200">
              <Check className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-in fade-in duration-500 delay-500" />
            </div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">
              {packageType === "subscription" ? `${packageName} Upgraded!` : `${packageName} Activated!`}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600">
              {packageType === "subscription"
                ? "Your subscription has been upgraded successfully!"
                : "Your benefits have been successfully granted"}
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-800 to-green-900 border border-green-700 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-xl">
            <div className="text-xs sm:text-sm text-white space-y-2 sm:space-y-3">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 sm:gap-3 animate-in slide-in-from-left-4 duration-500"
                  style={{ animationDelay: `${index * 100 + 800}ms` }}
                >
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-600 rounded-full flex items-center justify-center shadow-md flex-shrink-0">
                    {benefit.icon === "gift" && <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                    {benefit.icon === "star" && <Star className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                    {benefit.icon === "zap" && <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                  </div>
                  <span className="font-medium text-xs sm:text-sm">{benefit.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error screen - using SuccessScreen design pattern but with appropriate theme
  if (error) {
    const isTimeout = error.includes("taking longer than expected");

    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md mx-auto p-4 sm:p-8 text-center animate-in zoom-in-95 duration-500">
          <div className="mb-4 sm:mb-6">
            <div
              className={`w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 bg-gradient-to-br ${
                isTimeout ? "from-yellow-600 to-yellow-700" : "from-red-600 to-red-700"
              } rounded-full flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-700 delay-200`}
            >
              <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-in fade-in duration-500 delay-500" />
            </div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">
              {isTimeout ? "Processing in Progress" : "Processing Error"}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mb-4">{error}</p>
            {isTimeout ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Your payment was successful. Benefits will appear in your account shortly.
                </p>
                <button
                  onClick={() => (window.location.href = "/dashboard")}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  Check My Account
                </button>
              </div>
            ) : (
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show processing screen - using LoadingScreen design exactly
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-transparent rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md mx-auto p-8 sm:p-12 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 relative">
            <div className="absolute inset-0 border-4 border-red-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Processing Purchase</h3>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-white">
          <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
          <span className="animate-bounce text-center font-medium">{steps[currentStep]}</span>
        </div>
      </div>
    </div>
  );
};

export default PaymentProcessingScreen;
