"use client";

import React, { useState } from "react";
import { CreditCard, Plus, Trash2, Star, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { useUpdateSubscriptionPaymentMethod } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripe-client";
import { Button } from "./ui";
import ConfirmationModal from "./ConfirmationModal";
import { formatDisplayName } from "@/utils/display-name";

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

// Stripe Card Form Component for adding new payment methods
const AddPaymentMethodForm: React.FC<{
  clientSecret: string;
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
  userEmail?: string;
  userName?: string;
  userPhone?: string;
}> = ({ clientSecret, onSuccess, onCancel, userEmail, userName, userPhone }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || "Please check your card details");
        setIsSubmitting(false);
        return;
      }

      // Pass name, email, phone, and address in confirmParams since we're hiding those fields
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        redirect: "if_required",
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: userName || userEmail || "Customer",
              email: userEmail,
              phone: userPhone || undefined,
              address: {
                country: "AU", // Default to Australia (country is auto-detected in form)
                line1: "1 Martin Place", // Default address line
                city: "Sydney",
                state: "NSW",
                postal_code: "2000",
              },
            },
          },
        },
      });

      if (confirmError) {
        setError(confirmError.message || "Failed to save payment method");
        setIsSubmitting(false);
        return;
      }

      if (setupIntent?.payment_method) {
        const paymentMethodId =
          typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method.id;

        onSuccess(paymentMethodId);
      } else {
        setError("Payment method not found");
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
      <div className="rounded-lg border border-gray-300 dark:border-neutral-600 p-2 sm:p-3 [&_iframe]:!min-h-[200px] sm:[&_iframe]:!min-h-[auto]">
        <PaymentElement
          options={{
            layout: "tabs",
            fields: {
              billingDetails: {
                name: "never" as const,
                email: "never" as const,
                phone: "never" as const,
                address: {
                  country: "auto" as const, // Auto-detect country based on user location
                  line1: "never" as const,
                  line2: "never" as const,
                  city: "never" as const,
                  state: "never" as const,
                  postalCode: "never" as const,
                },
              },
            },
            terms: {
              card: "never" as const, // Hide the "By providing your card information..." terms text
              applePay: "never" as const,
              googlePay: "never" as const,
            },
          }}
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="submit"
          disabled={isSubmitting || !stripe}
          className="w-full sm:w-auto bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold hover:from-[#cc0000] hover:to-[#e60000] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Payment Method"
          )}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="w-full sm:w-auto border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold hover:bg-gray-50 dark:hover:bg-neutral-700 disabled:opacity-60"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};

const PaymentMethodsTab: React.FC<PaymentMethodsTabProps> = ({ user }) => {
  const { showToast } = useToast();
  const { paymentMethods, loading, error, deletePaymentMethod, setDefaultPaymentMethod, savePaymentMethod } =
    useSavedPaymentMethods();
  const updateSubscriptionPaymentMethod = useUpdateSubscriptionPaymentMethod();
  const [showAddForm, setShowAddForm] = useState(false);
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<string | null>(null);
  const [isCreatingSetupIntent, setIsCreatingSetupIntent] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [paymentMethodToDelete, setPaymentMethodToDelete] = useState<string | null>(null);

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
    setPaymentMethodToDelete(paymentMethodId);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!paymentMethodToDelete) return;

    setDeletingId(paymentMethodToDelete);
    setShowDeleteModal(false);
    const success = await deletePaymentMethod(paymentMethodToDelete);
    setDeletingId(null);
    setPaymentMethodToDelete(null);

    if (success) {
      showToast({
        type: "success",
        title: "Payment method deleted",
        message: "The payment method has been removed.",
      });
    } else {
      showToast({
        type: "error",
        title: "Error",
        message: "Failed to delete payment method. Please try again.",
      });
    }
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

  const getCardBrandIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes("visa")) return "💳";
    if (brandLower.includes("mastercard")) return "💳";
    if (brandLower.includes("amex") || brandLower.includes("american express")) return "💳";
    return "💳";
  };

  const formatExpiryDate = (month: number, year: number) => {
    return `${month.toString().padStart(2, "0")}/${year.toString().slice(-2)}`;
  };

  // Get the payment method currently used by subscription (if any)
  const getSubscriptionPaymentMethodId = () => {
    // This would ideally come from the subscription data, but for now we'll use the default
    return paymentMethods.find((pm) => pm.isDefault)?.paymentMethodId;
  };

  const subscriptionPaymentMethodId = getSubscriptionPaymentMethodId();

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2">Payment Methods</h3>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
          Manage your saved payment methods and update your subscription payment method.
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
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 border-b-2 border-[#ee0000] mx-auto mb-2 animate-spin" />
          <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">Loading payment methods...</p>
        </div>
      )}

      {!loading && !showAddForm && paymentMethods.length === 0 && (
        <div className="text-center py-8 sm:py-12 border-2 border-dashed border-gray-300 dark:border-neutral-600 rounded-xl px-4 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-neutral-900/50 dark:to-transparent">
          <div className="w-16 h-16 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-neutral-700 dark:to-neutral-800 rounded-full flex items-center justify-center shadow-sm">
            <CreditCard className="w-8 h-8 text-gray-400 dark:text-neutral-500" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2">No Payment Methods</h3>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 mb-4 sm:mb-6">You haven&apos;t saved any payment methods yet.</p>
          <Button
            onClick={handleAddNewPaymentMethod}
            disabled={isCreatingSetupIntent}
            className="bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold hover:from-[#cc0000] hover:to-[#e60000] disabled:opacity-60 shadow-md hover:shadow-lg transition-all"
          >
            {isCreatingSetupIntent ? (
              <>
                <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                Add Payment Method
              </>
            )}
          </Button>
        </div>
      )}

      {!loading && showAddForm && setupIntentClientSecret && (
        <div className="border-2 border-gray-200 dark:border-neutral-700 border-l-4 border-l-red-500 dark:border-l-red-400 rounded-lg p-2 sm:p-4 bg-gray-50 dark:bg-neutral-800 shadow-sm">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">Add New Payment Method</h4>
            <Button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setSetupIntentClientSecret(null);
              }}
              className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 hover:text-gray-800 dark:hover:text-white px-2 py-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded transition-colors"
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
            <AddPaymentMethodForm
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
            const isSubscriptionPaymentMethod = subscriptionPaymentMethodId === paymentMethod.paymentMethodId;
            const _isUpdating = updatingSubscriptionId === paymentMethod.paymentMethodId;

            return (
              <div
                key={paymentMethod.paymentMethodId}
                className={`border-2 rounded-lg sm:rounded-xl p-2.5 sm:p-4 transition-all shadow-sm hover:shadow-md ${
                  paymentMethod.isDefault
                    ? "border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                    : isSubscriptionPaymentMethod
                    ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30"
                    : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-gray-300 dark:hover:border-neutral-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-10 h-7 sm:w-12 sm:h-8 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-neutral-700 dark:to-neutral-800 rounded-lg flex-shrink-0 shadow-sm">
                      <span className="text-lg sm:text-xl">{getCardBrandIcon(paymentMethod.card?.brand || "")}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-xs sm:text-sm truncate">
                          {paymentMethod.card?.brand?.toUpperCase() || "CARD"} •••• {paymentMethod.card?.last4}
                        </h3>
                        {paymentMethod.isDefault && (
                          <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-full text-[10px] sm:text-xs font-semibold flex-shrink-0 shadow-sm">
                            <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
                            DEFAULT
                          </span>
                        )}
                        {isSubscriptionPaymentMethod && hasActiveSubscription && (
                          <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 rounded-full text-[10px] sm:text-xs font-semibold flex-shrink-0 shadow-sm">
                            <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            SUBSCRIPTION
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-xs text-gray-600 dark:text-neutral-400 mt-0.5 sm:mt-1">
                        Expires {formatExpiryDate(paymentMethod.card?.expMonth || 0, paymentMethod.card?.expYear || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    {!paymentMethod.isDefault && (
                      <Button
                        onClick={() => handleSetDefault(paymentMethod.paymentMethodId)}
                        disabled={settingDefaultId !== null}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded text-[9px] sm:text-xs font-medium disabled:opacity-50 flex-shrink-0 h-6 sm:h-8"
                      >
                        {settingDefaultId === paymentMethod.paymentMethodId ? (
                          <Loader2 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 animate-spin" />
                        ) : (
                          <>
                            <span className="hidden sm:inline">Set Default</span>
                            <span className="sm:hidden">Default</span>
                          </>
                        )}
                      </Button>
                    )}

                    <div
                      title={
                        isSubscriptionPaymentMethod
                          ? "Cannot delete payment method currently used by subscription"
                          : "Delete payment method"
                      }
                    >
                      <Button
                        onClick={() => handleDeleteClick(paymentMethod.paymentMethodId)}
                        disabled={deletingId === paymentMethod.paymentMethodId || isSubscriptionPaymentMethod}
                        className="bg-red-600 hover:bg-red-700 text-white p-0 sm:p-2 rounded text-[9px] sm:text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 h-6 sm:h-8 w-6 sm:w-8 flex items-center justify-center"
                      >
                        {deletingId === paymentMethod.paymentMethodId ? (
                          <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          });
          })()}

          <div className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-neutral-600">
            <Button
              onClick={handleAddNewPaymentMethod}
              disabled={isCreatingSetupIntent || showAddForm}
              className="w-full bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white py-2 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold hover:from-[#cc0000] hover:to-[#e60000] disabled:opacity-60 flex items-center justify-center gap-1.5 sm:gap-2 shadow-md hover:shadow-lg transition-all"
            >
              {isCreatingSetupIntent ? (
                <>
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  Add New Payment Method
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setPaymentMethodToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        type="delete"
        title="Delete Payment Method"
        message="Are you sure you want to delete this payment method? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={deletingId !== null}
      />
    </div>
  );
};

export default PaymentMethodsTab;

