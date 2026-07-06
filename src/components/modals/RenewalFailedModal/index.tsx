"use client";

import React from "react";
import { Elements } from "@stripe/react-stripe-js";

import Shell from "./Shell";
import AlertBanner from "./AlertBanner";
import PaymentMethodPicker from "./PaymentMethodPicker";
import ActionButtons from "./ActionButtons";
import InlineCardSetup from "./InlineCardSetup";
import PaymentForm from "./PaymentForm";
import { usePastDueResolve, stripePromise, renewalBillingSupportMailto } from "./usePastDueResolve";
import RenewalPreviewNote from "./RenewalPreviewNote";

interface RenewalFailedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The past-due renewal-recovery MODAL. The state machine lives in
 * `usePastDueResolve` (shared with the dashboard payment sheet's sheet-native
 * `PastDueResolvePanel`); this component is just the `Shell`-wrapped presentation.
 */
const RenewalFailedModal: React.FC<RenewalFailedModalProps> = ({ isOpen, onClose }) => {
  const r = usePastDueResolve({ isOpen, onClose });

  /* ====== Success state ====== */
  if (r.isSuccess) {
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
          <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-sm">
            Your accumulated entries and partner access are restored straight away.
          </p>
        </div>
      </Shell>
    );
  }

  /* ====== Payment Element confirmation state ====== */
  if (r.paymentState?.requiresConfirmation && r.paymentState.clientSecret) {
    const amountLabel = r.paymentState.amount
      ? `$${((r.paymentState.amount || 0) / 100).toFixed(2)} ${r.paymentState.currency?.toUpperCase() || "AUD"}`
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
            onCancel={onClose}
          />
        </Elements>
      </Shell>
    );
  }

  /* ====== Initial / inline-card / terminal state ====== */
  return (
    <Shell
      isOpen={isOpen}
      onClose={onClose}
      tone="danger"
      eyebrow={r.terminalCollectionFailure ? "Renewal blocked" : "Renewal on hold"}
      title={
        r.terminalCollectionFailure ? (
          <>
            We need to <span data-rf-accent>unblock</span> billing
          </>
        ) : r.showInlineCardSetup ? (
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
        r.terminalCollectionFailure ? (
          <>This invoice can&apos;t be charged from this screen — our team can fix it for you.</>
        ) : r.showInlineCardSetup ? (
          <>We&apos;ll save your card and retry the renewal automatically.</>
        ) : (
          <>Your last renewal payment didn&apos;t go through. Settle up to keep your benefits active.</>
        )
      }
    >
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
        onClose={onClose}
        supportMailto={renewalBillingSupportMailto()}
      />
    </Shell>
  );
};

export default RenewalFailedModal;
