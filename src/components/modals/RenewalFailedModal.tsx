"use client";

/**
 * RenewalFailedModal Component
 *
 * Modal for handling failed subscription renewal payments.
 * Allows users to pay their existing failed invoice using the existing PaymentIntent.
 *
 * Features:
 * - Shows saved payment methods for selection
 * - Allows entering a new payment method
 * - Displays clear error messages (both error and details)
 * - Automatically saves new payment methods and sets as default
 * - Handles success/error states
 * - Can be closed and reopened from settings
 *
 * Design: shares the dark-hero / white-body / red-glow shell language with
 * CancellationUpsellModal and DowngradeConfirmModal so the renewal recovery
 * flow feels visually consistent across the cancel path.
 */

import React, { useState, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { getStripePromise } from "@/lib/stripe-client";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { StripeInlineCardSetupForm } from "@/components/payment/StripeInlineCardSetupForm";
import { useToast } from "@/components/ui/Toast";
import { AlertTriangle, CreditCard, Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import {
  usePayFailedInvoice,
  useUpdateSubscriptionPaymentMethod,
  type PayFailedInvoiceFailureCode,
} from "@/hooks/queries/useSubscriptionQueries";
import { ApiError } from "@/lib/queries";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { paymentIntentIdFromClientSecret } from "@/utils/payment/stripe/stripe-excessive-retry";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useUserContext } from "@/contexts/UserContext";
import { formatDisplayName } from "@/utils/display-name";
import { SUPPORT_EMAIL } from "@/lib/email/sender-identities";
import { useThemeStore } from "@/stores/useThemeStore";
import { buildMembershipStripeAppearance } from "@/utils/payment/stripe/membership-stripe-appearance";

const stripePromise = getStripePromise();

const RENEWAL_BILLING_SUPPORT_SUBJECT = encodeURIComponent("Subscription renewal – cannot pay invoice");
function renewalBillingSupportMailto(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${RENEWAL_BILLING_SUPPORT_SUBJECT}`;
}

function errorPayloadSuggestsMissingDefaultPm(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.requiresNewCardPreflight === true) return true;
  const details = typeof d.details === "string" ? d.details : "";
  const err = typeof d.error === "string" ? d.error : "";
  const combined = `${details} ${err}`;
  return (
    combined.includes("default_payment_method") ||
    combined.includes("Default payment method") ||
    combined.includes("no `default_payment_method`")
  );
}

interface RenewalFailedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/* === Shared shell (matches CancellationUpsellModal / DowngradeConfirmModal language) === */
const RenewalShell: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  tone?: "danger" | "success";
  eyebrow: string;
  title: ReactNode;
  sub: ReactNode;
  children: ReactNode;
  closeOnBackdrop?: boolean;
}> = ({ isOpen, onClose, tone = "danger", eyebrow, title, sub, children, closeOnBackdrop = false }) => {
  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="rf-root fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />

      <div className="rf-stage relative" role="dialog" aria-modal="true" aria-labelledby="rf-headline">
        <button className="rf-close" type="button" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={`rf-frame tone-${tone}`}>
          <div className="rf-hero">
            <div className="rf-hero-inner">
              <div className="rf-eyebrow">
                <span className="line" />
                <span className="pip">
                  {tone === "success" ? (
                    <CheckCircle size={12} strokeWidth={2.4} />
                  ) : (
                    <AlertTriangle size={12} strokeWidth={2.4} />
                  )}
                </span>
                <span className="text">{eyebrow}</span>
                <span className="pip">
                  {tone === "success" ? (
                    <CheckCircle size={12} strokeWidth={2.4} />
                  ) : (
                    <AlertTriangle size={12} strokeWidth={2.4} />
                  )}
                </span>
                <span className="line r" />
              </div>
              <h2 className="rf-headline" id="rf-headline">{title}</h2>
              {sub ? <p className="rf-sub">{sub}</p> : null}
            </div>
          </div>

          <div className="rf-body">{children}</div>
        </div>
      </div>

      <style jsx>{`
        .rf-stage {
          width: 100%;
          max-width: 440px;
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
          color: #0a0a0a;
          max-height: calc(100dvh - 16px);
          display: flex;
        }
        .rf-frame {
          position: relative;
          width: 100%;
          background: #fff;
          border-radius: 22px;
          overflow-y: auto;
          overflow-x: hidden;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.25);
          max-height: 100%;
          scrollbar-width: thin;
        }
        .rf-frame::-webkit-scrollbar {
          width: 6px;
        }
        .rf-frame::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 999px;
        }
        .rf-close {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 10;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.55);
          color: rgba(255, 255, 255, 0.95);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(8px);
          transition: background 160ms ease;
        }
        .rf-close:hover {
          background: rgba(0, 0, 0, 0.78);
        }

        .rf-hero {
          position: relative;
          padding: 18px 22px 16px;
          background:
            radial-gradient(900px 320px at 50% -120px, var(--tone-glow), transparent 65%),
            radial-gradient(600px 280px at 50% 120%, rgba(212, 175, 55, 0.14), transparent 60%),
            linear-gradient(180deg, #0a0a0a 0%, #141416 60%, #0a0a0a 100%);
          color: #fff;
          overflow: hidden;
        }
        .rf-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            45deg,
            transparent 0 14px,
            rgba(255, 255, 255, 0.012) 14px 28px
          );
          pointer-events: none;
        }
        .rf-hero-inner {
          position: relative;
          z-index: 2;
        }
        .rf-eyebrow {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .rf-eyebrow .line {
          flex: 0 0 28px;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--tone-accent));
        }
        .rf-eyebrow .line.r {
          background: linear-gradient(90deg, var(--tone-accent), transparent);
        }
        .rf-eyebrow .pip {
          color: var(--tone-accent);
          display: inline-flex;
        }
        .rf-eyebrow .text {
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--tone-accent);
        }
        .rf-headline {
          font-family: "Anton", "Inter", sans-serif;
          font-weight: 400;
          font-size: 26px;
          line-height: 1;
          letter-spacing: 0.005em;
          text-align: center;
          text-transform: uppercase;
          margin: 0 0 6px;
        }
        .rf-headline :global(.accent) {
          color: var(--tone-accent);
        }
        .rf-sub {
          text-align: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.72);
          max-width: 460px;
          margin: 0 auto;
          line-height: 1.45;
        }
        .rf-sub :global(strong) {
          color: var(--tone-accent);
          font-weight: 700;
        }

        .rf-body {
          padding: 16px 22px 18px;
          background: #fff;
        }

        .rf-frame.tone-danger {
          --tone-glow: rgba(238, 0, 0, 0.34);
          --tone-accent: #ff6b6b;
        }
        .rf-frame.tone-success {
          --tone-glow: rgba(34, 197, 94, 0.32);
          --tone-accent: #4ade80;
        }

        @media (max-width: 540px) {
          .rf-frame {
            border-radius: 16px;
            scrollbar-width: none;
          }
          .rf-frame::-webkit-scrollbar {
            width: 0;
            display: none;
          }
          .rf-hero {
            padding: 14px 14px 12px;
          }
          .rf-headline {
            font-size: 22px;
          }
          .rf-sub {
            font-size: 11px;
          }
          .rf-body {
            padding: 14px;
          }
          .rf-close {
            top: 8px;
            right: 8px;
            width: 28px;
            height: 28px;
          }
          .rf-eyebrow .line {
            flex: 0 0 18px;
          }
          .rf-eyebrow .text {
            font-size: 10px;
            letter-spacing: 0.18em;
          }
        }
      `}</style>
    </div>
  );
};

/**
 * Payment Form Component (for Payment Element)
 * Handles payment confirmation with Payment Element
 */
const PaymentForm: React.FC<{
  clientSecret: string;
  paymentIntentId?: string | null;
  amount: number;
  currency: string;
  selectedPaymentMethod?: SavedPaymentMethod | null;
  onPaymentSuccess: (paymentMethodId?: string) => void;
  onPaymentError: (error: string, details?: string, meta?: { requiresDifferentPaymentMethod?: boolean }) => void;
  onCancel: () => void;
}> = ({ clientSecret, paymentIntentId, selectedPaymentMethod, onPaymentSuccess, onPaymentError, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const { savePaymentMethod } = useSavedPaymentMethods();
  const { userData } = useUserContext();

  const buildBillingDetails = () => {
    const fullName = formatDisplayName(userData?.firstName, userData?.lastName) || userData?.email || "Customer";
    return {
      name: fullName,
      email: userData?.email,
      phone: userData?.mobile,
      address: {
        country: "AU",
        state: "NSW",
        city: "Sydney",
        postal_code: "2000",
        line1: "1 Martin Place",
      },
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    try {
      if (selectedPaymentMethod) {
        const confirmResult = await stripe.confirmCardPayment(clientSecret, {
          payment_method: selectedPaymentMethod.paymentMethodId,
        });

        if (confirmResult.error) throw new Error(confirmResult.error.message || "Payment failed");

        if (confirmResult.paymentIntent && confirmResult.paymentIntent.status === "succeeded") {
          onPaymentSuccess(selectedPaymentMethod.paymentMethodId);
          return;
        }

        throw new Error("Payment was not successful");
      }

      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || "Please complete all required fields.");

      const billingDetailsData = buildBillingDetails();
      const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");

      const confirmResult = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          payment_method_data: { billing_details: billingDetailsData },
          return_url: getReturnUrlForPaymentTypeClient("subscription"),
        },
        redirect: "if_required",
      });

      if (confirmResult.error) throw new Error(confirmResult.error.message || "Payment failed");

      const paymentIntent = confirmResult.paymentIntent;
      if (paymentIntent && paymentIntent.status === "succeeded") {
        if (paymentIntent.payment_method) {
          const paymentMethodId =
            typeof paymentIntent.payment_method === "string"
              ? paymentIntent.payment_method
              : paymentIntent.payment_method.id;
          try {
            await savePaymentMethod(paymentMethodId, true);
          } catch (saveError) {
            console.warn("Could not save payment method:", saveError);
          }
        }
        onPaymentSuccess(paymentIntent.payment_method as string | undefined);
      } else {
        throw new Error("Payment was not successful");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Payment could not be processed. Please try again.";
      const piId = paymentIntentId ?? paymentIntentIdFromClientSecret(clientSecret);
      let requiresDifferentPm = false;
      if (piId) {
        try {
          const res = await fetch("/api/stripe/analyze-payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ paymentIntentId: piId }),
          });
          if (res.ok) {
            const body = (await res.json()) as { requiresDifferentPaymentMethod?: boolean };
            requiresDifferentPm = body.requiresDifferentPaymentMethod === true;
          }
        } catch {
          /* fall back to generic error */
        }
      }
      const toastPayload = requiresDifferentPm ? formatPaymentError({ requiresDifferentPaymentMethod: true }) : null;
      onPaymentError(errorMessage, undefined, { requiresDifferentPaymentMethod: requiresDifferentPm });
      showToast({
        type: "error",
        title: toastPayload?.title ?? "Payment Failed",
        message: toastPayload?.message ?? errorMessage,
        duration: 10000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {selectedPaymentMethod && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-neutral-900 text-xs sm:text-sm">
                {selectedPaymentMethod.card?.brand?.toUpperCase() || "Card"} ••••{" "}
                {selectedPaymentMethod.card?.last4 || ""}
              </p>
              <p className="text-2xs sm:text-xs text-neutral-500">Using saved payment method</p>
            </div>
          </div>
        </div>
      )}

      {!selectedPaymentMethod && (
        <div className="border border-neutral-200 rounded-xl p-3 sm:p-4 bg-white">
          {!stripe || !elements ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-red-600" />
              <span className="ml-3 text-neutral-600 text-sm">Loading payment form...</span>
            </div>
          ) : (
            <PaymentElement
              options={{
                layout: "tabs",
                wallets: { applePay: "auto", googlePay: "auto" },
                paymentMethodOrder: ["card", "apple_pay", "google_pay"],
                fields: {
                  billingDetails: { name: "never", email: "never", phone: "never", address: "never" },
                },
                terms: { card: "never", applePay: "never", googlePay: "never" },
              }}
              id="payment-element"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-2 sm:gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="rf-btn rf-btn-ghost"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || (!elements && !selectedPaymentMethod) || isProcessing}
          className="rf-btn rf-btn-primary"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
              Pay now
            </>
          )}
        </button>
      </div>

      <div className="text-2xs sm:text-xs text-neutral-500 text-center">
        Your payment is secured by Stripe. Card details are never stored on our servers.
      </div>

      <style jsx>{`
        .rf-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 11px 14px;
          border-radius: 10px;
          font-weight: 800;
          font-size: 13px;
          letter-spacing: 0.01em;
          line-height: 1.2;
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease, border-color 160ms ease;
        }
        .rf-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .rf-btn-ghost {
          background: #fff;
          color: #525252;
          border: 1.5px solid #e5e5e5;
        }
        .rf-btn-ghost:hover:not(:disabled) {
          background: #fafafa;
          border-color: #a3a3a3;
        }
        .rf-btn-primary {
          background: linear-gradient(180deg, #ee0000, #b91c1c);
          color: #fff;
          border: 1.5px solid #b91c1c;
          box-shadow: 0 8px 18px rgba(238, 0, 0, 0.32);
        }
        .rf-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }
      `}</style>
    </form>
  );
};

/**
 * Main RenewalFailedModal Component
 */
const RenewalFailedModal: React.FC<RenewalFailedModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const payFailedInvoiceMutation = usePayFailedInvoice();
  const updateSubscriptionPaymentMethod = useUpdateSubscriptionPaymentMethod();
  const { paymentMethods, loading: _paymentMethodsLoading, savePaymentMethod } = useSavedPaymentMethods();
  const { userData } = useUserContext();
  const isDarkMode = useThemeStore((s) => s.theme === "dark");
  const membershipStripeAppearance = useMemo(() => buildMembershipStripeAppearance(isDarkMode), [isDarkMode]);

  // State management
  const [paymentState, setPaymentState] = useState<{
    requiresConfirmation: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    amount?: number;
    currency?: string;
    invoiceId?: string;
  } | null>(null);
  const [requiresDifferentPaymentMethod, setRequiresDifferentPaymentMethod] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SavedPaymentMethod | null>(null);
  const [_showPaymentMethods, setShowPaymentMethods] = useState(false);
  /** invoice_not_payable / payment_intent_not_payable: same API cannot collect without billing repair */
  const [terminalCollectionFailure, setTerminalCollectionFailure] =
    useState<PayFailedInvoiceFailureCode | null>(null);
  /** No default PM on Stripe Customer (e.g. user removed all cards) — show SetupIntent inline before retry */
  const [showInlineCardSetup, setShowInlineCardSetup] = useState(false);
  const [setupIntentSecret, setSetupIntentSecret] = useState<string | null>(null);
  const [loadingSetupIntent, setLoadingSetupIntent] = useState(false);
  const [forceChargeProcessing, setForceChargeProcessing] = useState(false);
  const [forceChargeResult, setForceChargeResult] = useState<{
    success: boolean;
    chargedInvoiceId?: string;
    paymentStatus?: string;
    amount?: number;
    reason?: string;
    message?: string;
  } | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPaymentState(null);
      setIsLoading(false);
      setIsSuccess(false);
      setError(null);
      setErrorDetails(null);
      setSelectedPaymentMethod(null);
      setShowPaymentMethods(false);
      setRequiresDifferentPaymentMethod(false);
      setTerminalCollectionFailure(null);
      setShowInlineCardSetup(false);
      setSetupIntentSecret(null);
      setLoadingSetupIntent(false);
      setForceChargeProcessing(false);
      setForceChargeResult(null);
    }
  }, [isOpen]);

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
          showToast({ type: "error", title: "Could not load card form", message: "Please try again." });
        }
      } finally {
        if (!cancelled) setLoadingSetupIntent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, showInlineCardSetup, setupIntentSecret, showToast]);

  function isNoPayableInvoiceError(errMsg: string | null | undefined): boolean {
    const m = (errMsg || "").toLowerCase();
    return (
      m.includes("no longer be paid") ||
      m.includes("no longer payable") ||
      m.includes("can't be paid") ||
      m.includes("cannot be paid") ||
      m.includes("no payable invoice")
    );
  }

  const handlePayOverdue = async () => {
    setForceChargeProcessing(true);
    try {
      const res = await fetch("/api/stripe/force-charge-overdue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as {
        success?: boolean;
        chargedInvoiceId?: string;
        paymentStatus?: string;
        amount?: number;
        reason?: string;
        message?: string;
      };
      setForceChargeResult({
        success: !!data.success,
        chargedInvoiceId: data.chargedInvoiceId,
        paymentStatus: data.paymentStatus,
        amount: data.amount,
        reason: data.reason,
        message: data.message,
      });
    } catch (err) {
      setForceChargeResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setForceChargeProcessing(false);
    }
  };

  const handleResolvePayment = async () => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);
    setTerminalCollectionFailure(null);

    try {
      const response = await payFailedInvoiceMutation.mutateAsync();

      if (response.success) {
        setIsSuccess(true);
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current") });
        setTimeout(() => onClose(), 2000);
      } else if (response.requiresPaymentConfirmation && response.data?.paymentIntent?.clientSecret) {
        setRequiresDifferentPaymentMethod(false);
        setPaymentState({
          requiresConfirmation: true,
          clientSecret: response.data.paymentIntent.clientSecret,
          paymentIntentId: response.data.paymentIntent.id,
          amount: response.data.paymentIntent.amount,
          currency: response.data.paymentIntent.currency || "aud",
          invoiceId: response.data.invoiceId,
        });
        setShowPaymentMethods(true);
      } else {
        const errorMsg =
          (response as { error?: string; message?: string }).error ||
          (response as { message?: string }).message ||
          "Failed to process payment";
        const details = (response as { details?: string }).details;
        throw new Error(errorMsg + (details ? `: ${details}` : ""));
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.data && typeof err.data === "object" && err.data !== null) {
        const d = err.data as Record<string, unknown>;
        if (
          d.requiresNewCardPreflight === true ||
          (errorPayloadSuggestsMissingDefaultPm(err.data) && d.requiresDifferentPaymentMethod !== true)
        ) {
          setShowInlineCardSetup(true);
          setError(null);
          setErrorDetails(null);
          setTerminalCollectionFailure(null);
          setRequiresDifferentPaymentMethod(false);
          setIsLoading(false);
          return;
        }
        if (d.requiresDifferentPaymentMethod === true) {
          setRequiresDifferentPaymentMethod(true);
          const formatted = formatPaymentError(err.data);
          setError(formatted.title);
          setErrorDetails(formatted.message);
          showToast({ type: "error", title: formatted.title, message: formatted.message, duration: 12000 });
        } else if (d.failureCode === "invoice_not_payable" || d.failureCode === "payment_intent_not_payable") {
          setTerminalCollectionFailure(d.failureCode as PayFailedInvoiceFailureCode);
          setRequiresDifferentPaymentMethod(false);
          const formatted = formatPaymentError(err.data);
          setError(formatted.title);
          setErrorDetails(formatted.message);
          showToast({ type: "error", title: formatted.title, message: formatted.message, duration: 14000 });
        } else {
          const errorMsg = (typeof d.error === "string" && d.error) || err.message || "Failed to process payment";
          const details = typeof d.details === "string" ? d.details : null;
          setError(errorMsg);
          setErrorDetails(details);
          showToast({ type: "error", title: errorMsg, message: details || errorMsg, duration: 10000 });
        }
      } else if (err && typeof err === "object") {
        const apiError = err as {
          name?: string;
          message?: string;
          data?: { error?: string; details?: string } | string;
        };
        let errorMsg = apiError.message || "Failed to process payment";
        let details: string | null = null;
        if (apiError.data) {
          if (typeof apiError.data === "object" && apiError.data !== null) {
            errorMsg = apiError.data.error || errorMsg;
            details = apiError.data.details || null;
          } else if (typeof apiError.data === "string") {
            details = apiError.data;
          }
        }
        setError(errorMsg);
        setErrorDetails(details);
        showToast({ type: "error", title: errorMsg, message: details || errorMsg, duration: 10000 });
      } else {
        const errorMessage = err instanceof Error ? err.message : "Failed to process payment. Please try again.";
        setError(errorMessage);
        setErrorDetails(null);
        showToast({ type: "error", title: "Payment Error", message: errorMessage, duration: 10000 });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInlineCardSaved = async (paymentMethodId: string) => {
    setIsLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const saved = await savePaymentMethod(paymentMethodId, true);
      if (!saved) throw new Error("Could not save payment method");
      await updateSubscriptionPaymentMethod.mutateAsync(paymentMethodId);
      if (userData?._id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userData._id) });
      }
      setShowInlineCardSetup(false);
      setSetupIntentSecret(null);
      showToast({ type: "success", title: "Card saved", message: "Retrying your renewal payment…", duration: 3000 });
      await handleResolvePayment();
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not save card",
        message: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = async (_paymentMethodId?: string) => {
    setIsSuccess(true);
    queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current") });
    showToast({
      type: "success",
      title: "Payment Successful",
      message: "Your subscription has been reactivated. Your benefits are now active.",
      duration: 5000,
    });
    setTimeout(() => onClose(), 2000);
  };

  const handlePaymentError = (
    errorMessage: string,
    details?: string,
    meta?: { requiresDifferentPaymentMethod?: boolean }
  ) => {
    if (meta?.requiresDifferentPaymentMethod) setRequiresDifferentPaymentMethod(true);
    setError(errorMessage);
    setErrorDetails(details || null);
  };

  const formatCardDisplay = (paymentMethod: SavedPaymentMethod) => {
    if (!paymentMethod.card) return "Payment Method";
    return `${paymentMethod.card.brand.toUpperCase()} •••• ${paymentMethod.card.last4}`;
  };

  /* ====== Success state ====== */
  if (isSuccess) {
    return (
      <RenewalShell
        isOpen={isOpen}
        onClose={onClose}
        tone="success"
        eyebrow="Payment received"
        title={
          <>
            You&apos;re back <span className="accent">in business</span>
          </>
        }
        sub={<>Your subscription has been reactivated and benefits are live again.</>}
      >
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3">
            <CheckCircle className="w-9 h-9 text-emerald-600" />
          </div>
          <p className="text-sm text-neutral-600 max-w-sm">
            Your accumulated entries and partner access are restored straight away.
          </p>
        </div>
      </RenewalShell>
    );
  }

  /* ====== Payment Element confirmation state ====== */
  if (paymentState?.requiresConfirmation && paymentState.clientSecret) {
    const amountLabel = paymentState.amount
      ? `$${((paymentState.amount || 0) / 100).toFixed(2)} ${paymentState.currency?.toUpperCase() || "AUD"}`
      : null;

    return (
      <RenewalShell
        isOpen={isOpen}
        onClose={onClose}
        tone="danger"
        eyebrow="Payment required"
        title={
          <>
            Complete your <span className="accent">renewal payment</span>
          </>
        }
        sub={
          amountLabel ? (
            <>
              <strong>{amountLabel}</strong> due to reactivate your subscription.
            </>
          ) : (
            <>Confirm your payment to reactivate your subscription.</>
          )
        }
      >
        {requiresDifferentPaymentMethod && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs sm:text-sm font-semibold text-amber-900 mb-1">Use a different card</h4>
                <p className="text-xs sm:text-sm text-amber-800">
                  This card cannot be retried right now due to repeated declines. Pick another saved card or enter a new one.
                </p>
              </div>
            </div>
          </div>
        )}

        {(error || errorDetails) && (
          <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {error && <p className="text-red-900 font-semibold text-xs sm:text-sm mb-1">{error}</p>}
                {errorDetails && <p className="text-red-700 text-xs sm:text-sm">{errorDetails}</p>}
                {!errorDetails && error && <p className="text-red-700 text-xs sm:text-sm">{error}</p>}
              </div>
            </div>
          </div>
        )}

        {paymentMethods.length > 0 && (
          <div className="mb-4">
            <h4 className="text-2xs font-bold uppercase tracking-[0.18em] text-neutral-500 mb-2">
              Choose a payment method
            </h4>
            <div className="space-y-2">
              {paymentMethods.map((pm) => {
                const active = selectedPaymentMethod?.paymentMethodId === pm.paymentMethodId;
                return (
                  <button
                    key={pm.paymentMethodId}
                    type="button"
                    onClick={() => setSelectedPaymentMethod(pm)}
                    className={`w-full p-3 sm:p-4 border-2 rounded-xl text-left transition-colors ${
                      active
                        ? "border-red-600 bg-red-50"
                        : "border-neutral-200 hover:border-neutral-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-900 text-xs sm:text-sm truncate">
                            {formatCardDisplay(pm)}
                          </p>
                          {pm.isDefault && (
                            <p className="text-2xs sm:text-xs text-neutral-500">Default payment method</p>
                          )}
                        </div>
                      </div>
                      {active && (
                        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedPaymentMethod(null)}
                className={`w-full p-3 sm:p-4 border-2 rounded-xl text-left transition-colors ${
                  !selectedPaymentMethod
                    ? "border-red-600 bg-red-50"
                    : "border-neutral-200 hover:border-neutral-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 text-xs sm:text-sm">Enter new payment method</p>
                      <p className="text-2xs sm:text-xs text-neutral-500">Use a different card</p>
                    </div>
                  </div>
                  {!selectedPaymentMethod && (
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        )}

        <Elements
          key={paymentState.clientSecret || "no-secret"}
          stripe={stripePromise}
          options={{
            clientSecret: paymentState.clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#ee0000",
                colorBackground: "#ffffff",
                colorText: "#1f2937",
                colorDanger: "#dc2626",
                fontFamily: "system-ui, sans-serif",
                spacingUnit: "4px",
                borderRadius: "8px",
                fontSizeBase: "14px",
              },
              rules: {
                ".Tab": { display: "flex", alignItems: "center", flexDirection: "row", gap: "8px" },
                ".Tab--selected": { display: "flex", alignItems: "center", flexDirection: "row", gap: "8px" },
                "button[role='tab']": { display: "flex", alignItems: "center", flexDirection: "row", gap: "8px" },
                ".TabIcon, svg, img": { display: "inline-flex", alignItems: "center", flexShrink: "0", marginRight: "0" },
                ".TabLabel, span": { display: "inline-flex", alignItems: "center" },
                ".Input": { fontSize: "14px", padding: "10px", minHeight: "auto" },
              },
            },
          }}
        >
          <PaymentForm
            clientSecret={paymentState.clientSecret}
            paymentIntentId={paymentState.paymentIntentId}
            amount={paymentState.amount || 0}
            currency={paymentState.currency || "aud"}
            selectedPaymentMethod={selectedPaymentMethod}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentError={handlePaymentError}
            onCancel={onClose}
          />
        </Elements>
      </RenewalShell>
    );
  }

  /* ====== Initial / inline-card / terminal state ====== */
  return (
    <RenewalShell
      isOpen={isOpen}
      onClose={onClose}
      tone="danger"
      eyebrow={terminalCollectionFailure ? "Renewal blocked" : "Renewal on hold"}
      title={
        terminalCollectionFailure ? (
          <>
            We need to <span className="accent">unblock</span> billing
          </>
        ) : showInlineCardSetup ? (
          <>
            Add a <span className="accent">new card</span> to retry
          </>
        ) : (
          <>
            Resolve your <span className="accent">renewal</span> in one step
          </>
        )
      }
      sub={
        terminalCollectionFailure ? (
          <>This invoice can&apos;t be charged from this screen — our team can fix it for you.</>
        ) : showInlineCardSetup ? (
          <>We&apos;ll save your card and retry the renewal automatically.</>
        ) : (
          <>Your last renewal payment didn&apos;t go through. Settle up to keep your benefits active.</>
        )
      }
    >
      {requiresDifferentPaymentMethod && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs sm:text-sm font-semibold text-amber-900 mb-1">Use a different card</h4>
              <p className="text-xs sm:text-sm text-amber-800">
                This card cannot be retried right now due to repeated declines. Add a new card in account settings, or contact support if you need help.
              </p>
            </div>
          </div>
        </div>
      )}

      {showInlineCardSetup && (
        <div className="mb-4 space-y-3 rounded-xl border-2 border-neutral-200 border-l-4 border-l-red-600 p-3 sm:p-4 bg-neutral-50 shadow-sm">
          <div className="flex items-start gap-2">
            <CreditCard className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-neutral-900">Add a payment method</h4>
              <p className="text-xs sm:text-sm text-neutral-600 mt-1">
                There&apos;s no card on file for this renewal. Enter a new card and we&apos;ll retry your payment automatically.
              </p>
            </div>
          </div>
          {loadingSetupIntent && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              Preparing secure form…
            </div>
          )}
          {setupIntentSecret && !loadingSetupIntent && (
            <Elements
              key={`${setupIntentSecret}-inline-${isDarkMode ? "d" : "l"}`}
              stripe={stripePromise}
              options={{ clientSecret: setupIntentSecret, locale: "en", appearance: membershipStripeAppearance }}
            >
              <StripeInlineCardSetupForm
                clientSecret={setupIntentSecret}
                userEmail={userData?.email}
                userName={formatDisplayName(userData?.firstName, userData?.lastName) || undefined}
                userPhone={userData?.mobile}
                onSuccess={handleInlineCardSaved}
                disabled={isLoading}
                submitLabel="Save card & retry payment"
              />
            </Elements>
          )}
        </div>
      )}

      {(error || errorDetails) && !showInlineCardSetup && (
        <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {error && <p className="text-red-900 font-semibold text-xs sm:text-sm mb-1">{error}</p>}
              {errorDetails && <p className="text-red-700 text-xs sm:text-sm">{errorDetails}</p>}
              {!errorDetails && error && <p className="text-red-700 text-xs sm:text-sm">{error}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Pay Overdue CTA — shown when the pay-failed-invoice path reports "no payable invoice" */}
      {isNoPayableInvoiceError(error) && !forceChargeResult && (
        <div className="mt-3 mb-3 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
          <p className="text-sm text-amber-900">
            We can settle your overdue cycle by finalizing your held cycle invoice. One-click recovery — no card update needed.
          </p>
          <button
            type="button"
            onClick={() => void handlePayOverdue()}
            disabled={forceChargeProcessing}
            className="inline-flex items-center justify-center rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {forceChargeProcessing ? "Paying overdue amount…" : "Pay overdue amount"}
          </button>
        </div>
      )}

      {forceChargeResult && forceChargeResult.success && (
        <div className="mt-3 mb-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:p-4">
          <p className="text-sm text-emerald-800">Payment received. Your subscription is now up to date.</p>
        </div>
      )}

      {forceChargeResult && !forceChargeResult.success && (
        <div className="mt-3 mb-3 bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4">
          <p className="text-sm text-red-800">
            {forceChargeResult.message || "Could not pay overdue amount. Please contact support."}
          </p>
        </div>
      )}

      {/* Action area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-6 sm:py-8">
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-red-600 animate-spin mb-3" />
          <p className="text-sm text-neutral-600">Loading payment options…</p>
        </div>
      ) : terminalCollectionFailure ? (
        <div className="space-y-2">
          <a href={renewalBillingSupportMailto()} className="rfx-btn rfx-btn-primary">
            <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
            Contact support
          </a>
          <Link href="/my-account" onClick={() => onClose()} className="rfx-btn rfx-btn-outline">
            Go to account
          </Link>
          <button type="button" onClick={onClose} disabled={isLoading} className="rfx-btn rfx-btn-ghost">
            Close
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {!showInlineCardSetup && (
            <button
              type="button"
              onClick={handleResolvePayment}
              disabled={isLoading}
              className="rfx-btn rfx-btn-primary"
            >
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
              Resolve payment issue
            </button>
          )}
          {showInlineCardSetup && (
            <button
              type="button"
              onClick={() => {
                setShowInlineCardSetup(false);
                setSetupIntentSecret(null);
              }}
              disabled={isLoading}
              className="rfx-btn rfx-btn-outline"
            >
              Back
            </button>
          )}
          <button type="button" onClick={onClose} disabled={isLoading} className="rfx-btn rfx-btn-ghost">
            Close
          </button>
        </div>
      )}

      <div className="mt-4 text-2xs sm:text-xs text-neutral-500 text-center">
        {terminalCollectionFailure
          ? "Our team may need to fix your invoice in billing before you can pay. You can still update saved cards under your account."
          : showInlineCardSetup
            ? "You can also close this modal and add a card later under account settings."
            : "You can close this modal and resolve the payment issue later from your account settings."}
      </div>

      <style jsx>{`
        .rfx-btn {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 11px 14px;
          border-radius: 10px;
          font-weight: 800;
          font-size: 13px;
          letter-spacing: 0.01em;
          line-height: 1.2;
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease, border-color 160ms ease;
        }
        .rfx-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .rfx-btn-primary {
          background: linear-gradient(180deg, #ee0000, #b91c1c);
          color: #fff;
          border: 1.5px solid #b91c1c;
          box-shadow: 0 8px 18px rgba(238, 0, 0, 0.32);
        }
        .rfx-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }
        .rfx-btn-outline {
          background: #fff;
          color: #b91c1c;
          border: 1.5px solid #fecaca;
        }
        .rfx-btn-outline:hover:not(:disabled) {
          background: #fff1f2;
          border-color: #ee0000;
        }
        .rfx-btn-ghost {
          background: transparent;
          color: #525252;
          border: 1.5px solid transparent;
        }
        .rfx-btn-ghost:hover:not(:disabled) {
          background: #fafafa;
        }
      `}</style>
    </RenewalShell>
  );
};

export default RenewalFailedModal;
