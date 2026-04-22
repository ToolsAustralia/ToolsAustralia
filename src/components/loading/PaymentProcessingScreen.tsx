"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Check, Gift, Star, Zap, AlertCircle, Tag, X } from "lucide-react";
import { Z_INDEX } from "@/constants/z-index";
import { usePaymentStatus, type PaymentStatusResponse } from "@/hooks/queries";
import { rewardsEnabled } from "@/config/featureFlags";
import { trackPurchaseWithEventId } from "@/components/FacebookPixel";
import { getPartnerDiscountBenefitTextForPackageId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getPackageById } from "@/data/membershipPackages";

interface PaymentProcessingScreenProps {
  paymentIntentId: string;
  packageName: string;
  packageType: "one-time" | "membership" | "upsell" | "mini-draw";
  /** When set, success state can show partner-discount and (for membership) shop discount lines even before poll returns. */
  packageId?: string;
  isVisible?: boolean;
  onSuccess?: (status: PaymentStatusResponse) => void;
  onError?: (error: string) => void;
  onTimeout?: () => void;
  /**
   * Called when the user dismisses the long-waiting "Still processing" state (close or "Stay on this page")
   * so they are not forced to the dashboard. Usually mirrors `onTimeout` (hide overlay; polling stops via `isVisible`).
   */
  onStillProcessingDismiss?: () => void;
}

const STEP_BY_EVENT: Record<string, number> = {
  "payment_intent.created": 0,
  "payment_intent.processing": 0,
  "payment_intent.succeeded": 1,
  "invoice.payment_succeeded": 1,
  "customer.subscription.created": 2,
  "customer.subscription.updated": 2,
  BenefitsGranted: 3,
};

function deriveStepIndex(
  processed: boolean,
  latestEventType: string | undefined,
  stepsLength: number
): number {
  if (processed) return Math.max(0, stepsLength - 1);
  const raw = latestEventType ? STEP_BY_EVENT[latestEventType] ?? 0 : 0;
  const maxPending = Math.max(0, stepsLength - 2);
  return Math.min(Math.max(0, raw), maxPending);
}

/**
 * Webhook-aware payment processing screen: polls payment status and maps Stripe hints to steps.
 */
const PaymentProcessingScreen: React.FC<PaymentProcessingScreenProps> = ({
  paymentIntentId,
  packageName,
  packageType,
  packageId,
  isVisible = true,
  onSuccess,
  onError,
  onTimeout: _onTimeout,
  onStillProcessingDismiss,
}) => {
  const mountTo = typeof document !== "undefined" ? document.body : null;

  const renderOverlay = (ui: React.ReactNode) => {
    if (mountTo) {
      return createPortal(ui, mountTo);
    }
    return ui;
  };
  const [status, setStatus] = useState<PaymentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stillWaitingLong, setStillWaitingLong] = useState(false);
  const onSuccessCalledRef = useRef(false);
  const pixelPurchaseFiredRef = useRef(false);

  const shouldPoll = isVisible && !!paymentIntentId && paymentIntentId.startsWith("pi_");

  const { data: paymentStatus, isError: paymentStatusError, error: paymentStatusErrorDetails } = usePaymentStatus(
    paymentIntentId,
    { enabled: shouldPoll }
  );

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
      case "membership":
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

  const currentStep = useMemo(() => {
    const processed = !!status?.processed;
    const ev = status?.data?.latestEventType ?? paymentStatus?.data?.latestEventType;
    return deriveStepIndex(processed, ev, steps.length);
  }, [status?.processed, status?.data?.latestEventType, paymentStatus?.data?.latestEventType, steps.length]);

  useEffect(() => {
    if (!paymentIntentId || !isVisible) {
      return;
    }
    onSuccessCalledRef.current = false;
    setStatus(null);
    setError(null);
    setStillWaitingLong(false);
  }, [paymentIntentId, isVisible]);

  useEffect(() => {
    if (!shouldPoll || !paymentStatus) return;

    setStatus((prev) => ({
      ...paymentStatus,
      data: {
        ...paymentStatus.data,
        latestEventType: paymentStatus.data.latestEventType ?? prev?.data?.latestEventType,
        latestEventAt: paymentStatus.data.latestEventAt ?? prev?.data?.latestEventAt,
      },
    }));

    if (paymentStatus.processed) {
      if (!onSuccessCalledRef.current) {
        onSuccessCalledRef.current = true;
        onSuccess?.(paymentStatus);
      }
    }
  }, [paymentStatus, shouldPoll, onSuccess, packageType]);

  useEffect(() => {
    if (!shouldPoll || !paymentStatusError) return;
    const errorMessage =
      paymentStatusErrorDetails instanceof Error
        ? paymentStatusErrorDetails.message
        : "Payment processing failed. Please try again.";
    setError(errorMessage);
    onError?.(errorMessage);
  }, [shouldPoll, paymentStatusError, paymentStatusErrorDetails, onError]);

  useEffect(() => {
    if (!isVisible || !shouldPoll || status?.processed || error) return;

    const t = setTimeout(() => {
      setStillWaitingLong(true);
    }, 30000);
    return () => clearTimeout(t);
  }, [isVisible, shouldPoll, paymentIntentId, status?.processed, error]);

  if (!isVisible) return null;

  if (status?.processed && status.data) {
    if (!pixelPurchaseFiredRef.current && paymentIntentId && shouldPoll) {
      const value = status.data.price;
      if (typeof value === "number" && value > 0) {
        pixelPurchaseFiredRef.current = true;
        const currency = status.data.currency ?? "AUD";
        trackPurchaseWithEventId(value, currency, paymentIntentId, paymentIntentId);
      }
    }

    type BenefitIcon = "gift" | "star" | "zap" | "tag";
    const benefits: { text: string; icon: BenefitIcon }[] = [];

    const entries = status.data.entries;
    if (entries && entries > 0) {
      const entryText =
        packageType === "membership"
          ? `${entries} free entries added every month`
          : `${entries} free entries added to your account`;
      benefits.push({ text: entryText, icon: "star" });
    }

    if (rewardsEnabled() && status.data.points && status.data.points > 0) {
      const pointsText =
        packageType === "membership"
          ? `${status.data.points} reward points earned every month`
          : `${status.data.points} reward points earned`;
      benefits.push({ text: pointsText, icon: "zap" });
    }

    if (packageId?.trim()) {
      const partnerLine = getPartnerDiscountBenefitTextForPackageId(packageId);
      if (partnerLine) {
        benefits.push({ text: partnerLine, icon: "tag" });
      }
      if (packageType === "membership") {
        const pkg = getPackageById(packageId);
        const shopPct = pkg?.shopDiscountPercent ?? 0;
        if (shopPct > 0) {
          benefits.push({ text: `${shopPct}% off Tools Australia shop`, icon: "tag" });
        }
      }
    }

    return renderOverlay(
      <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300" style={{ zIndex: Z_INDEX.TOAST_LOADING }}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md mx-auto p-4 sm:p-8 text-center animate-in zoom-in-95 duration-500">
          <div className="mb-4 sm:mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-green-600 to-green-700 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-700 delay-200">
              <Check className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-in fade-in duration-500 delay-500" />
            </div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">
              {packageType === "membership" ? `${packageName} Upgraded!` : `${packageName} Activated!`}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
              {packageType === "membership"
                ? "Your subscription has been upgraded successfully!"
                : "Your benefits have been successfully granted"}
            </p>
          </div>

          {benefits.length > 0 ? (
            <div className="bg-gradient-to-br from-green-800 to-green-900 border border-green-700 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-xl">
              <div className="text-xs sm:text-sm text-white space-y-2 sm:space-y-3">
                {benefits.map((benefit, index) => (
                  <div
                    key={`${benefit.text}-${index}`}
                    className="flex items-center gap-2 sm:gap-3 animate-in slide-in-from-left-4 duration-500"
                    style={{ animationDelay: `${index * 100 + 800}ms` }}
                  >
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-600 rounded-full flex items-center justify-center shadow-md flex-shrink-0">
                      {benefit.icon === "gift" && <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                      {benefit.icon === "star" && <Star className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                      {benefit.icon === "zap" && <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                      {benefit.icon === "tag" && <Tag className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                    </div>
                    <span className="font-medium text-xs sm:text-sm">{benefit.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (error) {
    return renderOverlay(
      <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300" style={{ zIndex: Z_INDEX.TOAST_LOADING }}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md mx-auto p-4 sm:p-8 text-center animate-in zoom-in-95 duration-500">
          <div className="mb-4 sm:mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-red-600 to-red-700 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-700 delay-200">
              <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-in fade-in duration-500 delay-500" />
            </div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">Processing Error</h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 mb-4">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stillWaitingLong && shouldPoll && !status?.processed) {
    return renderOverlay(
      <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4" style={{ zIndex: Z_INDEX.TOAST_LOADING }}>
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto p-6 sm:p-8 text-center">
          {onStillProcessingDismiss && (
            <button
              type="button"
              onClick={onStillProcessingDismiss}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              aria-label="Close and stay on this page"
            >
              <X className="h-5 w-5" />
            </button>
          )}
          <AlertCircle className="w-14 h-14 text-amber-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Still processing</h3>
          <p className="text-sm text-gray-600 mb-6">
            Your payment is taking longer than usual to confirm. We&apos;ll email you when everything is finalised. You can
            safely leave this screen.
          </p>
          <div className="flex flex-col gap-2 sm:gap-3">
            {onStillProcessingDismiss && (
              <button
                type="button"
                onClick={onStillProcessingDismiss}
                className="w-full px-4 py-3 border border-gray-300 text-gray-900 bg-white rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Stay on this page
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                window.location.href = "/my-account";
              }}
              className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return renderOverlay(
    <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4" style={{ zIndex: Z_INDEX.TOAST_LOADING }}>
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
          <span className="text-center font-medium">{steps[currentStep] ?? steps[0]}</span>
        </div>
      </div>
    </div>
  );
};

export default PaymentProcessingScreen;
