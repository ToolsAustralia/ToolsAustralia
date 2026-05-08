"use client";

/**
 * StripePaymentModal — refactored from the 725-LOC monolith into the
 * upsell-shell design pattern. Visual treatment upgraded; Stripe integration
 * preserved byte-identically.
 *
 * Public API (props) is unchanged — all callers continue to work without
 * modification because the folder/index.tsx resolves as the same import path.
 *
 * STRIPE PRESERVATION INVARIANTS (checked by code review):
 * 1. stripePromise is a module-scope singleton (imported from PaymentForm.tsx
 *    which declares it at module scope). Stripe prohibits re-instantiation.
 * 2. <Elements key={clientSecret || "no-secret"}> re-mount key is kept for
 *    Stripe correctness — changing the key forces a fresh mount when the
 *    clientSecret changes.
 * 3. All confirmPayment / confirmCardPayment calls are in PaymentForm.tsx,
 *    unchanged from the original.
 */

import React, { useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { useSession } from "next-auth/react";
import { Lock } from "lucide-react";
import { resolveBillingAddress } from "@/lib/payment/defaultBillingAddress";
import PaymentProcessingScreen from "@/components/loading/PaymentProcessingScreen";

import Shell from "./Shell";
import OrderSummary from "./OrderSummary";
import UpgradeBenefitsPreview from "./UpgradeBenefitsPreview";
import {
  PaymentFormWithoutElements,
  PaymentFormWithElements,
  IMMEDIATE_UPGRADE_NO_PI,
  stripePromise,
} from "./PaymentForm";
import { type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";

export { IMMEDIATE_UPGRADE_NO_PI };

// ============================================================
// Public props interface — preserved byte-identically from original
// ============================================================

interface StripePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret: string;
  packageName: string;
  packageId: string;
  amount: number;
  onPaymentSuccess: (paymentIntentId: string) => void;
  // Upgrade info (no proration)
  upgradeInfo?: {
    fromPackage: { name: string; price: number };
    toPackage: { name: string; price: number };
    billingInfo?: {
      currentBillingDate: string;
      nextBillingDate: string;
      nextBillingAmount: number;
      billingDateStays: boolean;
    };
  };
}

// Derive tier from package name for hero tone
function tierFromPackageName(name: string): "tier-tradie" | "tier-foreman" | "tier-boss" {
  const lower = name.toLowerCase();
  if (lower.includes("boss")) return "tier-boss";
  if (lower.includes("foreman")) return "tier-foreman";
  return "tier-tradie";
}

/** Per-tier baseline benefit cells for the compact preview. Numbers mirror
 * VerticalAccumulationChart and the partner-discount catalog (Tradie 1d / 10%,
 * Foreman 7d / 25%, Boss 30d / 75%). Price is shown as $/mo. */
function tierBenefitCells(
  packageName: string,
  monthlyPrice: number
): Array<{ label: string; value: string | number }> {
  const tier = tierFromPackageName(packageName);
  const benefits =
    tier === "tier-boss"
      ? { entries: 100, days: 30, partner: "75%" }
      : tier === "tier-foreman"
      ? { entries: 40, days: 7, partner: "25%" }
      : { entries: 15, days: 1, partner: "10%" };
  return [
    { label: "Entries / mo", value: benefits.entries },
    { label: "Partner days", value: benefits.days },
    { label: "Per month", value: `$${monthlyPrice}` },
  ];
}

// ============================================================
// StripePaymentModal orchestrator
// ============================================================

const StripePaymentModal: React.FC<StripePaymentModalProps> = ({
  isOpen,
  onClose,
  clientSecret,
  packageName,
  packageId,
  amount,
  onPaymentSuccess,
  upgradeInfo,
}) => {
  const { data: session } = useSession();
  const stripeBillingAddress = resolveBillingAddress(session?.user);
  const activePaymentIntentRef = useRef<string | null>(null);

  const [showCardForm, setShowCardForm] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SavedPaymentMethod | null>(null);

  // PaymentProcessingScreen states
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  const handlePaymentSuccess = (id: string) => {
    if (id === IMMEDIATE_UPGRADE_NO_PI) {
      activePaymentIntentRef.current = null;
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      onPaymentSuccess(id);
      onClose();
      return;
    }
    activePaymentIntentRef.current = id;
    setPaymentIntentId(id);
    setShowPaymentProcessing(true);
  };

  const handleProcessingSuccess = () => {
    const pi = activePaymentIntentRef.current;
    activePaymentIntentRef.current = null;
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
    onPaymentSuccess(pi || "");
    onClose();
  };

  const handleProcessingError = (error: string) => {
    console.error("Payment processing error:", error);
    activePaymentIntentRef.current = null;
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
  };

  const handleProcessingTimeout = () => {
    activePaymentIntentRef.current = null;
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
    onClose();
  };

  // Show PaymentProcessingScreen if payment is being processed
  if (isOpen && showPaymentProcessing && paymentIntentId) {
    return (
      <PaymentProcessingScreen
        paymentIntentId={paymentIntentId}
        packageName={packageName}
        packageType="membership"
        packageId={packageId || undefined}
        isVisible={showPaymentProcessing}
        onSuccess={handleProcessingSuccess}
        onError={handleProcessingError}
        onTimeout={handleProcessingTimeout}
        onStillProcessingDismiss={handleProcessingTimeout}
      />
    );
  }

  // Derive tone from destination package name
  const tone = tierFromPackageName(packageName);

  // Headline copy: "Upgrading to Foreman" for upgrades
  const headlinePackagePart = upgradeInfo?.toPackage?.name ?? packageName;

  // Shared props for both PaymentForm variants
  const paymentFormProps = {
    clientSecret,
    packageName,
    packageId,
    amount,
    onPaymentSuccess: handlePaymentSuccess,
    onClose,
    showCardForm,
    setShowCardForm,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    stripeBillingAddress,
    upgradeInfo,
  };

  return (
    <Shell
      isOpen={isOpen}
      onClose={onClose}
      tone={tone}
      eyebrow={
        <span
          className="font-extrabold text-[11px] tracking-[0.22em] uppercase flex items-center gap-1.5 max-xs:text-[10px] max-xs:tracking-[0.18em]"
          style={{ color: "var(--tone-accent)" }}
        >
          <Lock size={11} strokeWidth={2.5} aria-hidden />
          FINAL STEP
          <Lock size={11} strokeWidth={2.5} aria-hidden />
        </span>
      }
      title={
        <>
          Upgrading to{" "}
          <span data-rf-accent>{headlinePackagePart}</span>
        </>
      }
      sub="Secured by Stripe"
    >
      {/* Compact upgrade benefits preview — what the user is paying FOR.
       * Stat cells are derived per-tier from the destination package name. */}
      <UpgradeBenefitsPreview
        toPackageName={upgradeInfo?.toPackage?.name ?? packageName}
        fromPackageName={upgradeInfo?.fromPackage?.name}
        cells={tierBenefitCells(upgradeInfo?.toPackage?.name ?? packageName, upgradeInfo?.toPackage?.price ?? amount / 100)}
      />

      {/* Order summary — gain-framed */}
      <OrderSummary
        packageName={packageName}
        amount={amount}
        upgradeInfo={upgradeInfo}
      />

      {/* Saved-card display is owned by PaymentMethodSelector inside PaymentForm —
       * we no longer render a duplicate card here. */}

      {/* Payment forms — Elements only when entering a new card */}
      {showCardForm && clientSecret ? (
        <Elements
          key={clientSecret || "no-secret"}
          stripe={stripePromise}
          options={{
            clientSecret,
            locale: "en",
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#059669",
                colorBackground: "#ffffff",
                colorText: "#1f2937",
                colorDanger: "#dc2626",
                fontFamily: "system-ui, sans-serif",
                spacingUnit: "4px",
                borderRadius: "8px",
              },
            },
          }}
        >
          <PaymentFormWithElements {...paymentFormProps} />
        </Elements>
      ) : (
        <PaymentFormWithoutElements {...paymentFormProps} />
      )}
    </Shell>
  );
};

export default StripePaymentModal;
