"use client";

/**
 * PaymentMethodsTab — decomposed from a 666-LOC flat file into the canonical
 * orchestrator-folder pattern.
 *
 * NOTE: Despite living under `src/components/modals/`, this is NOT a modal —
 * it's an inline tab content panel embedded by SettingsModal. The component
 * renders as a bare `<div>` (no ModalContainer wrapper). The folder lives
 * here for legacy reasons.
 *
 * Public API (props) is preserved byte-identically — all callers continue to
 * work without modification because the folder/index.tsx resolves as the same
 * import path.
 *
 * STRIPE PRESERVATION INVARIANTS:
 * 1. `stripePromise` is a module-scope singleton (Stripe prohibits re-instantiation
 *    per render). The Elements provider lives inside the orchestrator, but the
 *    promise is created exactly once at module load.
 * 2. The Elements `key` (`setupIntentClientSecret || "no-secret"`) is preserved —
 *    changing the key forces a fresh mount when the SetupIntent secret changes.
 * 3. The embedded `<ConfirmationModal>` portal for delete-confirm flow stays in
 *    this orchestrator.
 */

import React, { useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import {
  getPaymentMethodDeleteFlowKind,
  getPaymentMethodDeleteMessages,
  type PaymentMethodDeleteFlowKind,
} from "@/utils/payment/payment-method-delete-flow";
import { useUpdateSubscriptionPaymentMethod } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Elements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripe-client";
import { Button } from "../ui";
import ConfirmationModal from "../ConfirmationModal";
import { formatDisplayName } from "@/utils/display-name";

import SavedMethodRow from "./SavedMethodRow";
import AddPaymentCTA from "./AddPaymentCTA";
import AddPaymentForm from "./AddPaymentForm";

// Module-scope Stripe singleton — Stripe prohibits re-instantiation per render.
const stripePromise = getStripePromise();

interface PaymentMethodsTabProps {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    mobile?: string;
    subscription?: {
      isActive?: boolean;
      status?: string;
    };
    stripeSubscriptionId?: string;
  };
}

type DeleteFlowState = { paymentMethodId: string; kind: PaymentMethodDeleteFlowKind };

const PaymentMethodsTab: React.FC<PaymentMethodsTabProps> = ({ user }) => {
  const { showToast } = useToast();
  const {
    paymentMethods,
    subscriptionDefaultPaymentMethodId,
    loading,
    error,
    deletePaymentMethod,
    setDefaultPaymentMethod,
    savePaymentMethod,
  } = useSavedPaymentMethods();
  const updateSubscriptionPaymentMethod = useUpdateSubscriptionPaymentMethod();
  const [showAddForm, setShowAddForm] = useState(false);
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<string | null>(null);
  const [isCreatingSetupIntent, setIsCreatingSetupIntent] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);
  const [deleteFlow, setDeleteFlow] = useState<DeleteFlowState | null>(null);

  // Get subscription info
  const hasActiveSubscription = user.subscription?.isActive && user.stripeSubscriptionId;
  const subscriptionStatus = user.subscription?.status;

  const handleAddNewPaymentMethod = async () => {
    try {
      setIsCreatingSetupIntent(true);
      const response = await fetch("/api/stripe/create-setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create setup intent");
      }

      setSetupIntentClientSecret(data.client_secret);
      setShowAddForm(true);
    } catch (error) {
      showToast({
        type: "error",
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to initialize payment form",
      });
    } finally {
      setIsCreatingSetupIntent(false);
    }
  };

  const handlePaymentMethodSaved = async (paymentMethodId: string) => {
    try {
      // Set as default if it's the first payment method, or always set new ones as default
      const setAsDefault = true; // Always set newly added payment methods as default
      const success = await savePaymentMethod(paymentMethodId, setAsDefault);
      if (success) {
        showToast({
          type: "success",
          title: "Payment method saved",
          message: "Your payment method has been saved and set as default.",
        });
        setShowAddForm(false);
        setSetupIntentClientSecret(null);
      } else {
        // Only show error if savePaymentMethod explicitly returns false
        showToast({
          type: "error",
          title: "Error",
          message: "Failed to save payment method. Please try again.",
        });
      }
    } catch (error) {
      // Only show error toast if there's an actual error thrown
      console.error("Error saving payment method:", error);
      showToast({
        type: "error",
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to save payment method",
      });
    }
  };

  const handleDeleteClick = (paymentMethodId: string) => {
    const kind = getPaymentMethodDeleteFlowKind(
      paymentMethodId,
      paymentMethods,
      subscriptionDefaultPaymentMethodId,
      Boolean(hasActiveSubscription)
    );
    setDeleteFlow({ paymentMethodId, kind });
  };

  const handleConfirmDelete = async () => {
    if (!deleteFlow) return;

    setDeletingId(deleteFlow.paymentMethodId);
    const confirmBillingRisk = deleteFlow.kind === "billing-last";
    const result = await deletePaymentMethod(deleteFlow.paymentMethodId, confirmBillingRisk ? { confirmBillingRisk: true } : {});
    setDeletingId(null);

    if (result.status === "deleted") {
      setDeleteFlow(null);
      showToast({
        type: "success",
        title: "Payment method removed",
        message: "The card was detached from your account.",
      });
      return;
    }

    if (result.status === "needs_billing_confirm") {
      setDeleteFlow({ paymentMethodId: deleteFlow.paymentMethodId, kind: "billing-last" });
      return;
    }

    setDeleteFlow(null);
    showToast({
      type: "error",
      title: "Error",
      message: result.message || "Failed to delete payment method. Please try again.",
    });
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    // Prevent multiple simultaneous requests - disable all default buttons while processing
    if (settingDefaultId !== null) {
      return; // Already processing a default change
    }

    setSettingDefaultId(paymentMethodId);
    try {
      const success = await setDefaultPaymentMethod(paymentMethodId);

      if (success) {
        // If user has an active subscription, also update the subscription payment method
        if (hasActiveSubscription) {
          try {
            await updateSubscriptionPaymentMethod.mutateAsync(paymentMethodId);
            showToast({
              type: "success",
              title: "Default payment method updated",
              message: "Your default payment method has been updated and will be used for future subscription payments.",
            });
          } catch (subscriptionError) {
            // Default was set successfully, but subscription update failed
            console.error("Error updating subscription payment method:", subscriptionError);
            showToast({
              type: "success",
              title: "Default payment method updated",
              message: "Default payment method updated. However, failed to update subscription payment method. Please try again.",
            });
          }
        } else {
          showToast({
            type: "success",
            title: "Default payment method updated",
            message: "The default payment method has been updated.",
          });
        }
      } else {
        showToast({
          type: "error",
          title: "Error",
          message: "Failed to set default payment method. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error setting default payment method:", error);
      showToast({
        type: "error",
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to set default payment method",
      });
    } finally {
      setSettingDefaultId(null);
    }
  };

  const _handleUpdateSubscriptionPaymentMethod = async (paymentMethodId: string) => {
    if (!hasActiveSubscription) {
      showToast({
        type: "error",
        title: "No active subscription",
        message: "You don't have an active subscription to update.",
      });
      return;
    }

    setUpdatingSubscriptionId(paymentMethodId);
    try {
      await updateSubscriptionPaymentMethod.mutateAsync(paymentMethodId);
      showToast({
        type: "success",
        title: "Subscription payment method updated",
        message: "Your subscription will use this payment method for future payments.",
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to update subscription payment method",
      });
    } finally {
      setUpdatingSubscriptionId(null);
    }
  };

  // Suppress unused warning for the helper preserved verbatim from the original
  // flat file (kept for callers that may rely on it via codemods).
  void _handleUpdateSubscriptionPaymentMethod;
  void updatingSubscriptionId;

  const deleteModalCopy = deleteFlow ? getPaymentMethodDeleteMessages(deleteFlow.kind) : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-neutral-100 mb-1 sm:mb-2">Payment Methods</h3>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
          Manage your saved payment methods and update your subscription payment method.
        </p>
        <p className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-500 mt-2 leading-relaxed">
          Card details are stored securely by Stripe; we only keep payment method references. Removing a card detaches it
          from your account. See our{" "}
          <Link href="/privacy" className="text-red-600 dark:text-red-400 underline hover:opacity-90">
            Privacy Policy
          </Link>{" "}
          for more.
        </p>
      </div>

      {hasActiveSubscription && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-800 border-l-4 border-l-blue-500 dark:border-l-blue-400 rounded-lg p-2 sm:p-4 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-200">Active Subscription</p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Your subscription is {subscriptionStatus === "active" ? "active" : subscriptionStatus}. Update the
                payment method below to change how future payments are processed.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm">{error}</div>
      )}

      {loading && (
        <div className="text-center py-6 sm:py-8">
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 border-b-2 border-red-600 mx-auto mb-2 animate-spin" />
          <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">Loading payment methods...</p>
        </div>
      )}

      {!loading && !showAddForm && paymentMethods.length === 0 && (
        <AddPaymentCTA
          variant="empty-state"
          isCreatingSetupIntent={isCreatingSetupIntent}
          onClick={handleAddNewPaymentMethod}
        />
      )}

      {!loading && showAddForm && setupIntentClientSecret && (
        <div className="border-2 border-gray-200 dark:border-neutral-700 border-l-4 border-l-red-500 dark:border-l-red-400 rounded-lg p-2 sm:p-4 bg-gray-50 dark:bg-neutral-800 shadow-sm">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-neutral-100">Add New Payment Method</h4>
            <Button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setSetupIntentClientSecret(null);
              }}
              className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 hover:text-gray-800 dark:text-neutral-100 dark:hover:text-white px-2 py-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded transition-colors"
            >
              Cancel
            </Button>
          </div>
          <Elements
            key={setupIntentClientSecret || "no-secret"}
            stripe={stripePromise}
            options={{
              clientSecret: setupIntentClientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  spacingUnit: "4px",
                  borderRadius: "8px",
                  fontFamily: 'system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontSizeBase: "14px",
                },
              },
            }}
          >
            <AddPaymentForm
              clientSecret={setupIntentClientSecret}
              onSuccess={handlePaymentMethodSaved}
              onCancel={() => {
                setShowAddForm(false);
                setSetupIntentClientSecret(null);
              }}
              userEmail={user.email}
              userName={formatDisplayName(user.firstName, user.lastName) || undefined}
              userPhone={user.mobile || undefined}
            />
          </Elements>
        </div>
      )}

      {!loading && !showAddForm && paymentMethods.length > 0 && (
        <div className="space-y-2 sm:space-y-3">
          {(() => {
            // ✅ SAFETY NET: Deduplicate payment methods before rendering to prevent React key errors
            // Use Map to ensure unique paymentMethodIds (keeps first occurrence)
            const uniquePaymentMethodsMap = new Map<string, SavedPaymentMethod>();
            for (const pm of paymentMethods) {
              if (pm.paymentMethodId && !uniquePaymentMethodsMap.has(pm.paymentMethodId)) {
                uniquePaymentMethodsMap.set(pm.paymentMethodId, pm);
              }
            }
            const uniquePaymentMethods = Array.from(uniquePaymentMethodsMap.values());

            return uniquePaymentMethods.map((paymentMethod) => {
              const isSubscriptionBillingCard =
                Boolean(hasActiveSubscription) &&
                subscriptionDefaultPaymentMethodId === paymentMethod.paymentMethodId;

              return (
                <SavedMethodRow
                  key={paymentMethod.paymentMethodId}
                  paymentMethod={paymentMethod}
                  isSubscriptionBillingCard={isSubscriptionBillingCard}
                  settingDefaultId={settingDefaultId}
                  deletingId={deletingId}
                  onSetDefault={handleSetDefault}
                  onDelete={handleDeleteClick}
                />
              );
            });
          })()}

          <AddPaymentCTA
            variant="footer"
            isCreatingSetupIntent={isCreatingSetupIntent}
            showAddForm={showAddForm}
            onClick={handleAddNewPaymentMethod}
          />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteFlow !== null}
        onClose={() => {
          if (deletingId) return;
          setDeleteFlow(null);
        }}
        onConfirm={handleConfirmDelete}
        type="delete"
        title={deleteModalCopy?.title ?? "Remove payment method"}
        message={deleteModalCopy?.message ?? ""}
        confirmText={deleteModalCopy?.confirmText ?? "Remove"}
        cancelText="Cancel"
        isLoading={deletingId !== null}
        requireCheckboxToConfirm={deleteModalCopy?.requireCheckbox}
      />
    </div>
  );
};

export default PaymentMethodsTab;
