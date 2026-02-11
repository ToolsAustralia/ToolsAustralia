/**
 * Payment Success Handler Component
 * 
 * Reusable component for handling payment success with 3DS support.
 * Wraps use3DSRedirectHandler hook and provides appropriate UI states.
 */

"use client";

import React, { useRef, useEffect } from "react";
import { use3DSRedirectHandler, type PaymentStatus } from "@/hooks/use3DSRedirectHandler";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { trackFacebookEvent } from "@/components/FacebookPixel";

export interface PaymentSuccessHandlerProps {
  /**
   * Payment type for customizing success messages
   */
  paymentType?: "subscription" | "one-time" | "upsell" | "mini-draw";
  
  /**
   * Custom success message
   */
  successMessage?: string;
  
  /**
   * Custom error message
   */
  errorMessage?: string;
  
  /**
   * Children to render when payment is successful
   */
  children?: React.ReactNode;
  
  /**
   * Callback when payment status changes
   */
  onStatusChange?: (status: PaymentStatus) => void;
}

/**
 * Payment Success Handler Component
 * 
 * Handles 3DS redirect verification and displays appropriate UI states:
 * - Loading: While verifying payment status
 * - Success: When payment succeeded
 * - Error: When payment failed
 * - Processing: When payment is still processing
 */
export function PaymentSuccessHandler({
  paymentType = "one-time",
  successMessage,
  errorMessage,
  children,
  onStatusChange,
}: PaymentSuccessHandlerProps) {
  const { paymentStatus, paymentIntent, isLoading, error } = use3DSRedirectHandler();
  const pixelPurchaseFiredRef = useRef(false);

  // Fire Pixel Purchase once when 3DS redirect success (same eventID as CAPI for deduplication)
  useEffect(() => {
    if (
      paymentStatus === "succeeded" &&
      paymentIntent?.id &&
      !pixelPurchaseFiredRef.current
    ) {
      pixelPurchaseFiredRef.current = true;
      const amount = paymentIntent.amount ?? 0;
      trackFacebookEvent("Purchase", {
        value: amount / 100,
        currency: (paymentIntent.currency ?? "aud").toUpperCase(),
        order_id: paymentIntent.id,
        eventID: paymentIntent.id,
      });
    }
  }, [paymentStatus, paymentIntent?.id, paymentIntent?.amount, paymentIntent?.currency]);

  // Notify parent of status changes
  React.useEffect(() => {
    if (onStatusChange) {
      onStatusChange(paymentStatus);
    }
  }, [paymentStatus, onStatusChange]);

  // Default success message based on payment type
  const getDefaultSuccessMessage = () => {
    switch (paymentType) {
      case "subscription":
        return "Your subscription has been activated successfully!";
      case "upsell":
        return "Your upsell purchase was successful!";
      case "mini-draw":
        return "Your mini-draw entry was added successfully!";
      default:
        return "Your purchase was successful!";
    }
  };

  // Show loading state
  if (isLoading || paymentStatus === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-600 font-medium">Verifying your payment...</p>
        <p className="text-sm text-gray-500">Please wait while we confirm your payment status.</p>
      </div>
    );
  }

  // Show processing state
  if (paymentStatus === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <Loader2 className="w-12 h-12 text-yellow-600 animate-spin" />
        <p className="text-gray-600 font-medium">Processing your payment...</p>
        <p className="text-sm text-gray-500">Your payment is being processed. This may take a few moments.</p>
      </div>
    );
  }

  // Show error state
  if (paymentStatus === "failed" || error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <XCircle className="w-12 h-12 text-red-600" />
        <p className="text-gray-900 font-semibold text-lg">Payment Failed</p>
        <p className="text-gray-600 text-center max-w-md">
          {errorMessage || error || "Your payment could not be processed. Please try again."}
        </p>
        {paymentIntent?.id && (
          <p className="text-xs text-gray-500">Payment Intent ID: {paymentIntent.id}</p>
        )}
      </div>
    );
  }

  // Show requires_action state (shouldn't happen on success page, but handle gracefully)
  if (paymentStatus === "requires_action") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <AlertCircle className="w-12 h-12 text-yellow-600" />
        <p className="text-gray-900 font-semibold text-lg">Action Required</p>
        <p className="text-gray-600 text-center max-w-md">
          Additional authentication is required. Please complete the verification process.
        </p>
      </div>
    );
  }

  // Show success state
  if (paymentStatus === "succeeded") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <CheckCircle className="w-12 h-12 text-green-600" />
        <p className="text-gray-900 font-semibold text-lg">
          {successMessage || getDefaultSuccessMessage()}
        </p>
        {children}
        {paymentIntent?.id && (
          <p className="text-xs text-gray-500 mt-4">Payment Intent ID: {paymentIntent.id}</p>
        )}
      </div>
    );
  }

  // Idle state (no 3DS redirect, normal flow)
  // Render children if provided, otherwise show default success
  if (children) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <CheckCircle className="w-12 h-12 text-green-600" />
      <p className="text-gray-900 font-semibold text-lg">
        {successMessage || getDefaultSuccessMessage()}
      </p>
    </div>
  );
}
