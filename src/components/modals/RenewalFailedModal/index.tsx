"use client";

import React, { useMemo } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";

import Shell from "./Shell";
import AlertBanner from "./AlertBanner";
import PaymentMethodPicker from "./PaymentMethodPicker";
import ActionButtons from "./ActionButtons";
import InlineCardSetup from "./InlineCardSetup";
import PaymentForm from "./PaymentForm";
import { usePastDueResolve, renewalBillingSupportMailto } from "./usePastDueResolve";
import RenewalPreviewNote from "./RenewalPreviewNote";
import AccessRing from "@/components/ui/AccessRing";
import { getStripePromise } from "@/lib/stripe-client";

interface RenewalFailedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The "on hold" partner-access ring shown in the modal header for the clean resolve state — the
 * member's subscription-tier partner-catalog % (50 / 75 / 100) with a lock + "Paused", so the modal
 * leads with the member benefit that's frozen, not just "renewal failed".
 */
function PartnerHoldRing({ pct }: { pct: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative">
        <AccessRing percent={pct} size={72} stroke={7} color="#d97706" trackColor="rgba(217,119,6,.16)">
          <div className="flex flex-col items-center leading-none">
            <span className="num font-poppins text-[18px] font-black text-amber-700 dark:text-amber-400">{pct}%</span>
            <span className="text-[7px] font-extrabold uppercase tracking-[0.1em] text-amber-600">Partner</span>
          </div>
        </AccessRing>
        <span className="absolute -right-0.5 -top-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-white bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-[0_4px_10px_-4px_rgba(217,119,6,.8)] dark:border-neutral-950">
          <Lock className="h-[11px] w-[11px]" />
        </span>
      </div>
      <span className="text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-400">Paused</span>
    </div>
  );
}

/**
 * The past-due renewal-recovery MODAL. The state machine lives in
 * `usePastDueResolve` (shared with the dashboard payment sheet's sheet-native
 * `PastDueResolvePanel`); this component is just the `Shell`-wrapped presentation.
 */
const RenewalFailedModal: React.FC<RenewalFailedModalProps> = ({ isOpen, onClose }) => {
  const r = usePastDueResolve({ isOpen, onClose });
  // Lazy Stripe boot — getStripePromise() returns a module-level cached singleton
  // (Stripe prohibits re-instantiation per render), so this identity is stable
  // across renders; calling it here (not at module scope) avoids booting Stripe.js
  // for every visitor who downloads this chunk (2026-07 perf audit).
  const stripePromise = useMemo(() => getStripePromise(), []);

  /* ====== Success state ====== */
  if (r.isSuccess) {
    return (
      <Shell
        isOpen={isOpen}
        onClose={onClose}
        tone="success"
        eyebrow="Payment received"
        title="You're back in business"
        sub="Your subscription has been reactivated and benefits are live again."
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
        title="Complete your renewal payment"
        sub={
          amountLabel ? (
            <>
              <strong className="font-bold text-neutral-900 dark:text-white">{amountLabel}</strong> due to reactivate your subscription.
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
      heroAside={
        !r.terminalCollectionFailure && !r.showInlineCardSetup ? <PartnerHoldRing pct={r.restorablePartnerPct} /> : undefined
      }
      eyebrow={r.terminalCollectionFailure ? "Renewal blocked" : r.showInlineCardSetup ? "Add a card" : "Membership on hold"}
      title={
        r.terminalCollectionFailure
          ? "We need to unblock billing"
          : r.showInlineCardSetup
            ? "Add a new card to retry"
            : "Reactivate to restore your benefits"
      }
      sub={
        r.terminalCollectionFailure
          ? "This invoice can't be charged from this screen — our team can fix it for you."
          : r.showInlineCardSetup
            ? "We'll save your card and retry the renewal automatically."
            : "Your partner discounts, entries & member offers are paused until your renewal clears."
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
        hideDismiss
      />
    </Shell>
  );
};

export default RenewalFailedModal;
