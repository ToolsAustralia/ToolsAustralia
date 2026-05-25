"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import {
  usePayFailedInvoice,
  useUpdateSubscriptionPaymentMethod,
  type PayFailedInvoiceFailureCode,
} from "@/hooks/queries/useSubscriptionQueries";
import { ApiError } from "@/lib/queries";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { useUserContext } from "@/contexts/UserContext";
import { buildMembershipStripeAppearance } from "@/utils/payment/stripe/membership-stripe-appearance";
import { getStripePromise } from "@/lib/stripe-client";
import { queryKeys } from "@/lib/queryKeys";
import { SUPPORT_EMAIL } from "@/lib/email/sender-identities";

import Shell from "./Shell";
import AlertBanner from "./AlertBanner";
import PaymentMethodPicker from "./PaymentMethodPicker";
import ActionButtons from "./ActionButtons";
import InlineCardSetup from "./InlineCardSetup";
import PaymentForm from "./PaymentForm";

// Module-scope singleton — Stripe prohibits re-instantiation per render.
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

interface RenewalFailedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RenewalFailedModal: React.FC<RenewalFailedModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const payFailedInvoiceMutation = usePayFailedInvoice();
  const updateSubscriptionPaymentMethod = useUpdateSubscriptionPaymentMethod();
  const { paymentMethods, loading: _paymentMethodsLoading, savePaymentMethod } = useSavedPaymentMethods();
  const { userData } = useUserContext();
  // This modal renders as an always-light card (the main Stripe PaymentElement
  // uses a hardcoded light appearance and floats over a dark backdrop), so the
  // inline card-setup form must stay light too — otherwise its labels/inputs
  // mismatch the rest of the modal in dark mode.
  const membershipStripeAppearance = useMemo(
    () => buildMembershipStripeAppearance(false),
    []
  );

  // State management (14 slices — dead state _showPaymentMethods removed per audit §5)
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
      setRequiresDifferentPaymentMethod(false);
      setTerminalCollectionFailure(null);
      setShowInlineCardSetup(false);
      setSetupIntentSecret(null);
      setLoadingSetupIntent(false);
      setForceChargeProcessing(false);
      setForceChargeResult(null);
    }
  }, [isOpen]);

  // SetupIntent fetch effect — with cancelled guard
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

  // ============================================================
  // Callbacks
  // ============================================================

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
        // The webhook now grants benefits asynchronously (~5–15s after Stripe
        // delivers the event). One invalidate + 2s close was racy against the
        // worker pre-cutover too, but the old sync handler usually beat the
        // refetch. Schedule two refresh passes (at 3s + 7s) before closing at
        // 8s so the My Account view picks up the worker's writes.
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current") });
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: queryKeys.users.account("current") });
        }, 3000);
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: queryKeys.users.detail("current") });
          queryClient.refetchQueries({ queryKey: queryKeys.users.account("current") });
          onClose();
        }, 8000);
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

  const handleCardSetupSuccess = async (paymentMethodId: string) => {
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
    // Same async-webhook race as handleResolvePayment above — schedule two
    // refetch passes (3s + 7s) so the dashboard reflects worker-granted
    // benefits before we close. Toast wording is intentionally softened from
    // "now active" to "reactivating" because the active state is technically
    // a few seconds out from this code path.
    queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current") });
    showToast({
      type: "success",
      title: "Payment Successful",
      message: "Your subscription is reactivating. Your benefits will appear shortly.",
      duration: 6000,
    });
    setTimeout(() => {
      queryClient.refetchQueries({ queryKey: queryKeys.users.account("current") });
    }, 3000);
    setTimeout(() => {
      queryClient.refetchQueries({ queryKey: queryKeys.users.detail("current") });
      queryClient.refetchQueries({ queryKey: queryKeys.users.account("current") });
      onClose();
    }, 8000);
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

  const handleBackFromPayment = () => {
    setShowInlineCardSetup(false);
    setSetupIntentSecret(null);
  };

  // ============================================================
  // Render — branches on isSuccess → paymentState → initial state
  // ============================================================

  /* ====== Success state ====== */
  if (isSuccess) {
    return (
      <Shell
        isOpen={isOpen}
        onClose={onClose}
        tone="success"
        eyebrow="Payment received"
        title={
          <>
            You&apos;re back <span data-rf-accent>in business</span>
          </>
        }
        sub={<>Your subscription has been reactivated and benefits are live again.</>}
      >
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-neutral-600 max-w-sm">
            Your accumulated entries and partner access are restored straight away.
          </p>
        </div>
      </Shell>
    );
  }

  /* ====== Payment Element confirmation state ====== */
  if (paymentState?.requiresConfirmation && paymentState.clientSecret) {
    const amountLabel = paymentState.amount
      ? `$${((paymentState.amount || 0) / 100).toFixed(2)} ${paymentState.currency?.toUpperCase() || "AUD"}`
      : null;

    return (
      <Shell
        isOpen={isOpen}
        onClose={onClose}
        tone="danger"
        eyebrow="Payment required"
        title={
          <>
            Complete your <span data-rf-accent>renewal payment</span>
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
        {requiresDifferentPaymentMethod ? (
          <AlertBanner
            variant="warn"
            title="Use a different card"
            message="This card cannot be retried right now due to repeated declines. Pick another saved card or enter a new one."
          />
        ) : null}

        {(error || errorDetails) ? (
          <AlertBanner
            variant="error"
            title={error ?? undefined}
            message={errorDetails ?? error ?? undefined}
          />
        ) : null}

        {paymentMethods.length > 0 ? (
          <PaymentMethodPicker
            paymentMethods={paymentMethods}
            selectedPaymentMethod={selectedPaymentMethod}
            onSelect={setSelectedPaymentMethod}
          />
        ) : null}

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
      </Shell>
    );
  }

  /* ====== Initial / inline-card / terminal state ====== */
  const isNoPayableInvoice = isNoPayableInvoiceError(error);

  return (
    <Shell
      isOpen={isOpen}
      onClose={onClose}
      tone="danger"
      eyebrow={terminalCollectionFailure ? "Renewal blocked" : "Renewal on hold"}
      title={
        terminalCollectionFailure ? (
          <>
            We need to <span data-rf-accent>unblock</span> billing
          </>
        ) : showInlineCardSetup ? (
          <>
            Add a <span data-rf-accent>new card</span> to retry
          </>
        ) : (
          <>
            Resolve your <span data-rf-accent>renewal</span> in one step
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
      {requiresDifferentPaymentMethod ? (
        <AlertBanner
          variant="warn"
          title="Use a different card"
          message="This card cannot be retried right now due to repeated declines. Add a new card in account settings, or contact support if you need help."
        />
      ) : null}

      {showInlineCardSetup ? (
        <InlineCardSetup
          setupIntentSecret={setupIntentSecret}
          loadingSetupIntent={loadingSetupIntent}
          isDarkMode={false}
          membershipStripeAppearance={membershipStripeAppearance}
          userData={userData ?? {}}
          isLoading={isLoading}
          onSuccess={handleCardSetupSuccess}
        />
      ) : null}

      {(error || errorDetails) && !showInlineCardSetup ? (
        <AlertBanner
          variant="error"
          title={error ?? undefined}
          message={errorDetails ?? error ?? undefined}
        />
      ) : null}

      {/* Pay Overdue CTA — shown when the pay-failed-invoice path reports "no payable invoice" */}
      {isNoPayableInvoice && !forceChargeResult ? (
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
      ) : null}

      {forceChargeResult && forceChargeResult.success ? (
        <div className="mt-3 mb-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:p-4">
          <p className="text-sm text-emerald-800">Payment received. Your subscription is now up to date.</p>
        </div>
      ) : null}

      {forceChargeResult && !forceChargeResult.success ? (
        <div className="mt-3 mb-3 bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4">
          <p className="text-sm text-red-800">
            {forceChargeResult.message || "Could not pay overdue amount. Please contact support."}
          </p>
        </div>
      ) : null}

      <ActionButtons
        isLoading={isLoading}
        terminalCollectionFailure={terminalCollectionFailure}
        showInlineCardSetup={showInlineCardSetup}
        isNoPayableInvoice={isNoPayableInvoice}
        forceChargeProcessing={forceChargeProcessing}
        onResolve={handleResolvePayment}
        onPayOverdue={handlePayOverdue}
        onBack={handleBackFromPayment}
        onClose={onClose}
        supportMailto={renewalBillingSupportMailto()}
      />
    </Shell>
  );
};

export default RenewalFailedModal;
