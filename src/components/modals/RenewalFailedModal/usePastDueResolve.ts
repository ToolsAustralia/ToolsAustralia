"use client";

/**
 * usePastDueResolve — the past-due *renewal recovery* state machine, extracted
 * from RenewalFailedModal so BOTH the legacy modal (RenewalFailedModal, via
 * `Shell`) and the dashboard **payment sheet** (via `PastDueResolvePanel`, sheet-
 * native — no modal chrome) can render it without duplicating the money-path
 * logic (retry / 3DS / add-card-then-retry / force-charge-overdue). The logic
 * here is byte-identical to the original modal; only the presentation differs
 * between the two consumers.
 */

import { useEffect, useMemo, useState } from "react";
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
import { getPastDueRenewalPreview } from "@/utils/subscription/past-due-renewal-preview";
import type { IUser } from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { tierKeyFromName } from "@/utils/membership/tier-visuals";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { useHtmlDarkForUi } from "@/hooks/useHtmlDarkForUi";
import { buildMembershipStripeAppearance } from "@/utils/payment/stripe/membership-stripe-appearance";
import { queryKeys } from "@/lib/queryKeys";
import { SUPPORT_EMAIL } from "@/lib/email/sender-identities";

const RENEWAL_BILLING_SUPPORT_SUBJECT = encodeURIComponent("Subscription renewal – cannot pay invoice");

export function renewalBillingSupportMailto(): string {
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

export function isNoPayableInvoiceError(errMsg: string | null | undefined): boolean {
  const m = (errMsg || "").toLowerCase();
  return (
    m.includes("no longer be paid") ||
    m.includes("no longer payable") ||
    m.includes("can't be paid") ||
    m.includes("cannot be paid") ||
    m.includes("no payable invoice")
  );
}

export interface UsePastDueResolveArgs {
  /** True while the surface is open — gates the reset + SetupIntent-fetch effects. */
  isOpen: boolean;
  /** Called after a successful recovery (with a short delay) to close the surface. */
  onClose: () => void;
}

export function usePastDueResolve({ isOpen, onClose }: UsePastDueResolveArgs) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const payFailedInvoiceMutation = usePayFailedInvoice();
  const updateSubscriptionPaymentMethod = useUpdateSubscriptionPaymentMethod();
  const { paymentMethods, loading: _paymentMethodsLoading, savePaymentMethod } = useSavedPaymentMethods();
  const { userData } = useUserContext();
  // What the member pays + the entries they unlock on resolve — reuses the canonical preview so the
  // popup/sheet match the dashboard note, the renewal-failure email, and the Klaviyo property.
  const renewalPreview = getPastDueRenewalPreview((userData ?? {}) as unknown as IUser);
  // Partner-catalog access % the member RESTORES by reactivating — their subscription tier's %
  // (Tradie 50 / Foreman 75 / Boss 100). Drives the "on hold" ring in the modal header, framing the
  // resolve around the paused member benefit rather than just "renewal failed".
  const subscriptionPkg = (() => {
    const pid = ((userData ?? {}) as unknown as IUser).subscription?.packageId;
    return pid ? getPackageById(String(pid)) : null;
  })();
  const tierKey = subscriptionPkg?.name ? tierKeyFromName(subscriptionPkg.name) : null;
  const tierLabel = subscriptionPkg?.name ?? null;
  const restorablePartnerPct = tierKey ? getPartnerCatalogAccessPercentForPlanId(`${tierKey}-subscription`) : 0;
  // Source of truth = the actual `.dark` class on <html> (what Tailwind styles the
  // surface with), NOT useThemeStore — those can disagree (time-based auto-dark, or
  // /admin theme). useHtmlDarkForUi reads the class so the PaymentElement matches.
  const isDarkMode = useHtmlDarkForUi();
  const membershipStripeAppearance = useMemo(
    () => buildMembershipStripeAppearance(isDarkMode),
    [isDarkMode]
  );

  // State management (14 slices)
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

  // Reset state when the surface opens/closes
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
        // The webhook grants benefits asynchronously (~5–15s after Stripe delivers
        // the event). Schedule two refresh passes (3s + 7s) before closing at 8s so
        // the My Account view picks up the worker's writes.
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
    // Same async-webhook race as handleResolvePayment above — schedule two refetch
    // passes (3s + 7s) so the dashboard reflects worker-granted benefits before we close.
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

  const isNoPayableInvoice = isNoPayableInvoiceError(error);

  return {
    // state
    paymentState,
    requiresDifferentPaymentMethod,
    isLoading,
    isSuccess,
    error,
    errorDetails,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    terminalCollectionFailure,
    showInlineCardSetup,
    setupIntentSecret,
    loadingSetupIntent,
    forceChargeProcessing,
    forceChargeResult,
    // derived
    isDarkMode,
    membershipStripeAppearance,
    paymentMethods,
    userData,
    renewalPreview,
    restorablePartnerPct,
    tierLabel,
    isNoPayableInvoice,
    // handlers
    handlePayOverdue,
    handleResolvePayment,
    handleCardSetupSuccess,
    handlePaymentSuccess,
    handlePaymentError,
    handleBackFromPayment,
  };
}

export type PastDueResolve = ReturnType<typeof usePastDueResolve>;
