"use client";

import React from "react";
import { Elements } from "@stripe/react-stripe-js";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/utils/cn";

import AlertBanner from "./AlertBanner";
import PaymentMethodPicker from "./PaymentMethodPicker";
import ActionButtons from "./ActionButtons";
import InlineCardSetup from "./InlineCardSetup";
import PaymentForm from "./PaymentForm";
import { usePastDueResolve, stripePromise, renewalBillingSupportMailto } from "./usePastDueResolve";
import RenewalPreviewNote from "./RenewalPreviewNote";

interface PastDueResolvePanelProps {
  /** Called after a successful recovery (short delay) so the host sheet can close. */
  onResolved?: () => void;
}

/**
 * Sheet-native heading — a clean, compact strip that fits a bottom sheet, NOT the
 * modal's dark full-bleed hero. Amber for the on-hold/blocked states, emerald on
 * success.
 */
function PanelHead({
  tone,
  eyebrow,
  title,
  sub,
}: {
  tone: "danger" | "success";
  eyebrow: string;
  title: string;
  sub: string;
}) {
  const ok = tone === "success";
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-3 rounded-2xl border p-3.5",
        ok
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
          : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
          ok
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            "text-[10px] font-bold uppercase tracking-[0.18em]",
            ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
          )}
        >
          {eyebrow}
        </div>
        <div className="font-['Poppins'] text-[15px] font-extrabold text-primary-token dark:text-white">{title}</div>
        <div className="mt-0.5 text-xs leading-[1.4] text-muted-token">{sub}</div>
      </div>
    </div>
  );
}

/**
 * Past-due renewal recovery, rendered **natively inside the dashboard payment
 * sheet** — no modal Shell / backdrop / "Close" button / "close this modal" copy.
 * Shares the exact resolve state machine (retry / 3DS / add-card-then-retry /
 * force-charge) with `RenewalFailedModal` via `usePastDueResolve`, so the money
 * path stays single-sourced; only the presentation differs.
 */
export default function PastDueResolvePanel({ onResolved }: PastDueResolvePanelProps) {
  const close = React.useCallback(() => onResolved?.(), [onResolved]);
  const r = usePastDueResolve({ isOpen: true, onClose: close });

  /* ====== Success state ====== */
  if (r.isSuccess) {
    return (
      <div>
        <PanelHead
          tone="success"
          eyebrow="Payment received"
          title="You're back in business"
          sub="Your subscription is reactivated and benefits are live again."
        />
        <p className="text-sm text-muted-token">
          Your accumulated entries and partner access are restored straight away.
        </p>
      </div>
    );
  }

  /* ====== Payment Element confirmation (3DS/SCA) state ====== */
  if (r.paymentState?.requiresConfirmation && r.paymentState.clientSecret) {
    const amountLabel = r.paymentState.amount
      ? `$${((r.paymentState.amount || 0) / 100).toFixed(2)} ${r.paymentState.currency?.toUpperCase() || "AUD"}`
      : null;

    return (
      <div>
        <PanelHead
          tone="danger"
          eyebrow="Payment required"
          title="Complete your renewal payment"
          sub={amountLabel ? `${amountLabel} due to reactivate your subscription.` : "Confirm your payment to reactivate your subscription."}
        />

        {r.requiresDifferentPaymentMethod ? (
          <AlertBanner
            variant="warn"
            title="Use a different card"
            message="This card cannot be retried right now due to repeated declines. Pick another saved card or enter a new one."
          />
        ) : null}

        {r.error || r.errorDetails ? (
          <AlertBanner variant="error" title={r.error ?? undefined} message={r.errorDetails ?? r.error ?? undefined} />
        ) : null}

        {r.paymentMethods.length > 0 ? (
          <PaymentMethodPicker
            paymentMethods={r.paymentMethods}
            selectedPaymentMethod={r.selectedPaymentMethod}
            onSelect={r.setSelectedPaymentMethod}
          />
        ) : null}

        <Elements
          key={`${r.paymentState.clientSecret || "no-secret"}-${r.isDarkMode ? "dark" : "light"}`}
          stripe={stripePromise}
          options={{ clientSecret: r.paymentState.clientSecret, appearance: r.membershipStripeAppearance }}
        >
          <PaymentForm
            clientSecret={r.paymentState.clientSecret}
            paymentIntentId={r.paymentState.paymentIntentId}
            amount={r.paymentState.amount || 0}
            currency={r.paymentState.currency || "aud"}
            selectedPaymentMethod={r.selectedPaymentMethod}
            onPaymentSuccess={r.handlePaymentSuccess}
            onPaymentError={r.handlePaymentError}
            onCancel={close}
          />
        </Elements>
      </div>
    );
  }

  /* ====== Initial / inline-card / terminal state ====== */
  return (
    <div>
      <PanelHead
        tone="danger"
        eyebrow={r.terminalCollectionFailure ? "Renewal blocked" : "Renewal on hold"}
        title={
          r.terminalCollectionFailure
            ? "We need to unblock billing"
            : r.showInlineCardSetup
              ? "Add a new card to retry"
              : "Resolve your renewal in one step"
        }
        sub={
          r.terminalCollectionFailure
            ? "This invoice can't be charged from this screen — our team can fix it for you."
            : r.showInlineCardSetup
              ? "We'll save your card and retry the renewal automatically."
              : "Your last renewal payment didn't go through. Settle up to keep your benefits active."
        }
      />

      {/* What they pay + the entries they unlock — only on the normal resolve prompt, not the
          add-card / terminal states. */}
      {!r.terminalCollectionFailure && !r.showInlineCardSetup ? (
        <RenewalPreviewNote preview={r.renewalPreview} />
      ) : null}

      {r.requiresDifferentPaymentMethod ? (
        <AlertBanner
          variant="warn"
          title="Use a different card"
          message="This card cannot be retried right now due to repeated declines. Add a new card in account settings, or contact support if you need help."
        />
      ) : null}

      {r.showInlineCardSetup ? (
        <InlineCardSetup
          setupIntentSecret={r.setupIntentSecret}
          loadingSetupIntent={r.loadingSetupIntent}
          isDarkMode={r.isDarkMode}
          membershipStripeAppearance={r.membershipStripeAppearance}
          userData={r.userData ?? {}}
          isLoading={r.isLoading}
          onSuccess={r.handleCardSetupSuccess}
        />
      ) : null}

      {(r.error || r.errorDetails) && !r.showInlineCardSetup ? (
        <AlertBanner variant="error" title={r.error ?? undefined} message={r.errorDetails ?? r.error ?? undefined} />
      ) : null}

      {/* Pay Overdue CTA — shown when the pay-failed-invoice path reports "no payable invoice" */}
      {r.isNoPayableInvoice && !r.forceChargeResult ? (
        <div className="mt-3 mb-3 flex flex-col gap-3 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 p-3 sm:p-4">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            We can settle your overdue cycle by finalizing your held cycle invoice. One-click recovery — no card update needed.
          </p>
          <button
            type="button"
            onClick={() => void r.handlePayOverdue()}
            disabled={r.forceChargeProcessing}
            className="inline-flex items-center justify-center rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {r.forceChargeProcessing ? "Paying overdue amount…" : "Pay overdue amount"}
          </button>
        </div>
      ) : null}

      {r.forceChargeResult && r.forceChargeResult.success ? (
        <div className="mt-3 mb-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-3 sm:p-4">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">Payment received. Your subscription is now up to date.</p>
        </div>
      ) : null}

      {r.forceChargeResult && !r.forceChargeResult.success ? (
        <div className="mt-3 mb-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-3 sm:p-4">
          <p className="text-sm text-red-800 dark:text-red-200">
            {r.forceChargeResult.message || "Could not pay overdue amount. Please contact support."}
          </p>
        </div>
      ) : null}

      <ActionButtons
        isLoading={r.isLoading}
        terminalCollectionFailure={r.terminalCollectionFailure}
        showInlineCardSetup={r.showInlineCardSetup}
        isNoPayableInvoice={r.isNoPayableInvoice}
        forceChargeProcessing={r.forceChargeProcessing}
        onResolve={r.handleResolvePayment}
        onPayOverdue={r.handlePayOverdue}
        onBack={r.handleBackFromPayment}
        onClose={close}
        supportMailto={renewalBillingSupportMailto()}
        hideDismiss
      />
    </div>
  );
}
