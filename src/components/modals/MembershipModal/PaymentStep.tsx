"use client";

/**
 * PaymentStep — step 2: PaymentMethodSelector (auth or guest layout) + coupon
 * row + Purchase button + selected-plan summary card.
 *
 * IMPORTANT: cardFormRef is a passthrough — the orchestrator owns the ref
 * instance and forwards it here so that PaymentMethodSelector can attach to
 * it. The orchestrator's confirmStripeIntent() flow remains intact.
 *
 * Visual output (className strings, button copy, conditional branches) is
 * preserved byte-for-byte from the original MembershipModal.tsx
 * (lines 5420-5764).
 */

import React from "react";
import { Button } from "../ui";
import PaymentMethodSelector from "../PaymentMethodSelector";
import CouponRow from "./CouponRow";
import PlanSummaryCard from "./PlanSummaryCard";
import type { SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { type MembershipPlan as ApiMembershipPlan } from "@/hooks/useMemberships";

interface PromoLinkInfoLite {
  bonusEntries: number;
  isValid: boolean;
  isLoading: boolean;
  appliesToMembership: boolean;
  appliesToOneTime: boolean;
  code: string;
}

interface ResolvedBillingDetails {
  name?: string;
  email?: string;
  phone?: string;
  country?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  line1?: string;
}

interface PaymentStepProps {
  // Auth context
  isAuthenticated: boolean;
  // Plan
  activePlan: LocalMembershipPlan;
  promoEnhancedPlan: LocalMembershipPlan;
  isPlaceholderPlan: boolean;
  subscriptionPackages: ApiMembershipPlan[];
  oneTimePackages: ApiMembershipPlan[];
  promoThemePrimary: string;
  // Stripe state
  selectedPaymentMethod: SavedPaymentMethod | null;
  showCardForm: boolean;
  setupIntentClientSecret: string | null;
  paymentIntentClientSecret: string | null;
  cardFormRef: React.Ref<{
    confirmStripeIntent: () => Promise<{
      paymentMethodId?: string;
      paymentIntentId?: string;
      error?: string;
      setupIntentAlreadySucceeded?: boolean;
      needsRecovery?: boolean;
      lastSetupError?: { code?: string; message?: string; decline_code?: string };
    }>;
  } | null>;
  cardFormError: string | null;
  isCreatingSetupIntentPending: boolean;
  isCreatingPaymentIntentPending: boolean;
  isCreatingSubscription: boolean;
  resolvedBillingDetails: ResolvedBillingDetails;
  paymentMethodTypeFromElement: string | null;
  // Coupon
  promoLinkInfo: PromoLinkInfoLite | null;
  couponCode: string;
  couponApplied: boolean;
  showApplyingIndicator: boolean;
  isApplyDisabled: boolean;
  referralInfo: { referrerName: string } | null;
  referralError: string | null;
  // Submit
  isSubmitting: boolean;
  isFormValid: boolean;
  // Callbacks
  onPaymentMethodSelect: (paymentMethod: SavedPaymentMethod | null) => void;
  onAddNewPaymentMethod: () => Promise<void> | void;
  onCardElementChange: (event: { error?: { message?: string } }) => void;
  onPaymentMethodTypeChange: (type: string | null) => void;
  onElementReady?: (ready: boolean) => void;
  onCouponCodeChange: (value: string) => void;
  onApplyCoupon: () => void;
  onSubmit: () => void;
  onPackageChange: () => void;
}

const PaymentStep: React.FC<PaymentStepProps> = ({
  isAuthenticated,
  activePlan,
  promoEnhancedPlan,
  isPlaceholderPlan,
  subscriptionPackages,
  oneTimePackages,
  promoThemePrimary,
  selectedPaymentMethod,
  showCardForm,
  setupIntentClientSecret,
  paymentIntentClientSecret,
  cardFormRef,
  cardFormError,
  isCreatingSetupIntentPending,
  isCreatingPaymentIntentPending,
  isCreatingSubscription,
  resolvedBillingDetails,
  paymentMethodTypeFromElement,
  promoLinkInfo,
  couponCode,
  couponApplied,
  showApplyingIndicator,
  isApplyDisabled,
  referralInfo,
  referralError,
  isSubmitting,
  isFormValid,
  onPaymentMethodSelect,
  onAddNewPaymentMethod,
  onCardElementChange,
  onPaymentMethodTypeChange,
  onElementReady,
  onCouponCodeChange,
  onApplyCoupon,
  onSubmit,
  onPackageChange,
}) => {
  const amount = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
  const packageName = promoEnhancedPlan?.name || activePlan?.name;
  const intentType = paymentIntentClientSecret ? "payment" : setupIntentClientSecret ? "setup" : undefined;
  const isUpsellOffer = promoEnhancedPlan?.metadata?.isUpsellOffer === true;
  const isWalletPaymentSelected =
    paymentMethodTypeFromElement === "google_pay" ||
    paymentMethodTypeFromElement === "googlePay" ||
    paymentMethodTypeFromElement === "apple_pay" ||
    paymentMethodTypeFromElement === "applePay";
  const walletLabel =
    paymentMethodTypeFromElement === "google_pay" || paymentMethodTypeFromElement === "googlePay"
      ? "Google Pay"
      : "Apple Pay";

  return (
    <div className="space-y-2 sm:space-y-3">
      {/* Payment Method Selector - Always show for authenticated users */}
      {isAuthenticated && (
        <PaymentMethodSelector
          onPaymentMethodSelect={onPaymentMethodSelect}
          onAddNewPaymentMethod={onAddNewPaymentMethod}
          selectedPaymentMethod={selectedPaymentMethod}
          isAuthenticated={isAuthenticated}
          showCardForm={showCardForm}
          setupIntentClientSecret={setupIntentClientSecret}
          paymentIntentClientSecret={paymentIntentClientSecret}
          intentType={intentType}
          cardFormRef={cardFormRef}
          onCardElementChange={onCardElementChange}
          cardFormError={cardFormError}
          isCreatingSetupIntent={isCreatingSetupIntentPending}
          isCreatingPaymentIntent={isCreatingPaymentIntentPending}
          isCreatingSubscription={isCreatingSubscription}
          onPaymentMethodTypeChange={onPaymentMethodTypeChange}
          onElementReady={onElementReady}
          billingDetails={resolvedBillingDetails}
          amount={amount}
          packageName={packageName}
        />
      )}

      {/* Payment Section - Always show package info and payment button */}
      <div className="space-y-2 sm:space-y-3 border-t-0 sm:border-t border-gray-200 pt-0 sm:pt-4">
        {/* Payment Method Selector for non-authenticated users */}
        {/* ✅ VERIFIED: Amount is correctly calculated from activePlan (from PackageSelectionModal)
            Flow: PackageSelectionModal -> onPlanSelect -> handlePackageSelect -> onPlanChange ->
            Parent updates selectedPlan -> activePlan -> amount calculation -> PaymentMethodSelector */}
        {!isAuthenticated && (
          <PaymentMethodSelector
            onPaymentMethodSelect={onPaymentMethodSelect}
            onAddNewPaymentMethod={onAddNewPaymentMethod}
            selectedPaymentMethod={selectedPaymentMethod}
            isAuthenticated={isAuthenticated}
            showCardForm={showCardForm}
            setupIntentClientSecret={setupIntentClientSecret}
            paymentIntentClientSecret={paymentIntentClientSecret}
            intentType={intentType}
            cardFormRef={cardFormRef}
            onCardElementChange={onCardElementChange}
            cardFormError={cardFormError}
            isCreatingSetupIntent={isCreatingSetupIntentPending}
            isCreatingPaymentIntent={isCreatingPaymentIntentPending}
            isCreatingSubscription={isCreatingSubscription}
            onPaymentMethodTypeChange={onPaymentMethodTypeChange}
            billingDetails={resolvedBillingDetails}
            amount={amount}
            packageName={packageName}
          />
        )}

        {/* Bonus Applied or Coupon Code - Only show for regular packages, not upsells */}
        <CouponRow
          isUpsellOffer={isUpsellOffer}
          promoLinkInfo={promoLinkInfo}
          couponCode={couponCode}
          couponApplied={couponApplied}
          showApplyingIndicator={showApplyingIndicator}
          isApplyDisabled={isApplyDisabled}
          referralInfo={referralInfo}
          referralError={referralError}
          promoThemePrimary={promoThemePrimary}
          onCouponCodeChange={onCouponCodeChange}
          onApply={onApplyCoupon}
        />

        {/* Purchase Button - Moved above Selected Package for better UX */}
        {/* Option A (wallet UX): when Google Pay or Apple Pay is selected, hide main Purchase and show instruction to click wallet button in form */}
        {isPlaceholderPlan ? (
          // Payment Button Skeleton – user must select a package first
          <div className="h-11 bg-gray-200 rounded-lg animate-pulse"></div>
        ) : isWalletPaymentSelected ? (
          <div className="rounded-lg sm:rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4 text-center">
            <p className="text-sm font-medium text-amber-900">
              To pay with {walletLabel}, click the {walletLabel} button in the payment form above—do not use a separate Purchase button.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              This keeps your payment secure and avoids browser restrictions.
            </p>
          </div>
        ) : (
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!isFormValid || isSubmitting}
            variant="metallic"
            fullWidth
            size="lg"
            loading={isSubmitting || isCreatingPaymentIntentPending || isCreatingSetupIntentPending}
            className="h-11 !py-0 font-bold text-sm sm:text-base"
          >
            {isSubmitting ? (
              "Processing..."
            ) : isCreatingPaymentIntentPending || isCreatingSetupIntentPending ? (
              "Setting up payment..."
            ) : isAuthenticated ? (
              <>
                <span className="sm:hidden">PURCHASE & ENTER</span>
                <span className="hidden sm:inline">PURCHASE & ENTER THE DRAW</span>
              </>
            ) : (
              <>
                <span className="sm:hidden">PURCHASE</span>
                <span className="hidden sm:inline">PURCHASE</span>
              </>
            )}
          </Button>
        )}

        {/* Selected Package */}
        <PlanSummaryCard
          promoEnhancedPlan={promoEnhancedPlan}
          promoThemePrimary={promoThemePrimary}
          subscriptionPackages={subscriptionPackages}
          oneTimePackages={oneTimePackages}
          onPackageChange={onPackageChange}
        />
      </div>
    </div>
  );
};

export default PaymentStep;
