/**
 * Subscription React Query hooks
 *
 * This file contains all hooks for subscription management:
 * - Upgrade (with proration)
 * - Downgrade (with benefit preservation)
 * - Renewal (failed payment recovery and reactivation)
 * - Cancellation
 * - Auto-renew toggle
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiPost, apiPatch } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import { getPackageById } from "@/data/membershipPackages";
import { usePurchaseInvalidation } from "@/hooks/usePurchaseInvalidation";
import { useEntryRewardToast } from "@/hooks/useEntryRewardToast";
import type { UserData, MyAccountData } from "@/hooks/queries/useUserQueries";
import {
  normalizePaymentMethodsCache,
  type PaymentMethodsQueryResult,
  type SavedPaymentMethod,
} from "@/hooks/queries/usePaymentQueries";

// ====================================
// Types
// ====================================

export interface UpgradeSubscriptionData {
  newPackageId: string;
  paymentMethodId?: string;
}

export interface UpgradeSubscriptionResponse {
  success: boolean;
  message: string;
  data: {
    paymentIntent?: {
      id: string;
      clientSecret: string;
      amount: number;
      currency: string;
      status: string;
    };
    subscription: {
      id: string;
      packageId: string;
      packageName: string;
      price: number;
      status: string;
    };
    upgrade: {
      fromPackage: { id: string; name: string; price: number };
      toPackage: { id: string; name: string; price: number };
      prorationAmount: number;
      prorationDetails?: string;
      billingInfo?: {
        currentBillingDate: string;
        nextBillingDate: string;
        nextBillingAmount: number;
        billingDateStays: boolean;
      };
      benefits: {
        entriesPerMonth: number;
        shopDiscountPercent: number;
        partnerDiscountDays: number;
      };
    };
    note?: string;
  };
}

export interface RenewSubscriptionData {
  packageId?: string; // Optional: renew with same or different package
  paymentMethodId?: string; // Optional: use saved or provide new payment method
  createSetupIntent?: boolean; // Create setup intent if no payment method available
}

export interface RenewSubscriptionResponse {
  success: boolean;
  requiresPaymentConfirmation?: boolean;
  requiresSetupIntent?: boolean;
  message: string;
  data?: {
    /** When true, client may show monthly-entry celebration (invoice paid / new cycle). Never for reactivate-only. */
    grantEntryRewardToast?: boolean;
    paymentIntent?: {
      id: string;
      clientSecret: string;
      amount: number;
      currency: string;
      status: string;
    };
    subscription?: {
      id: string;
      packageId: string;
      packageName: string;
      price: number;
      status: string;
    };
    payment?: {
      invoiceId: string;
      amount: number;
      status: string;
    };
    setupIntent?: {
      id: string;
      clientSecret: string;
    };
  };
}

export interface DowngradeSubscriptionData {
  newPackageId: string;
}

export interface DowngradeSubscriptionResponse {
  success: boolean;
  message: string;
  data: {
    previousPackage: {
      id: string;
      name: string;
      price: number;
      benefitsUntil: string;
    };
    newPackage: {
      id: string;
      name: string;
      price: number;
      activatesOn: string;
    };
    benefitsPreserved: boolean;
    daysUntilChange: number;
  };
}

export interface CancelSubscriptionData {
  cancelAtPeriodEnd?: boolean;
}

export interface CancelSubscriptionResponse {
  success: boolean;
  message: string;
  data: {
    subscriptionId: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
  };
}

export interface UpdateAutoRenewData {
  autoRenew: boolean;
}

export interface UpdateAutoRenewResponse {
  success: boolean;
  message: string;
  data: {
    subscriptionId: string;
    status: string;
    autoRenew: boolean;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
  };
}

export interface UpdateSubscriptionPaymentMethodResponse {
  success: boolean;
  message: string;
  data: {
    paymentMethodId: string;
    subscriptionId: string;
  };
}

export type PayFailedInvoiceFailureCode = "invoice_not_payable" | "payment_intent_not_payable";

export interface PayFailedInvoiceResponse {
  success: boolean;
  requiresPaymentConfirmation?: boolean;
  /** Customer has no default PM (e.g. cards removed); client should collect a card then retry pay-failed-invoice */
  requiresNewCardPreflight?: boolean;
  message?: string;
  error?: string;
  details?: string;
  requiresDifferentPaymentMethod?: boolean;
  failureReason?: "stripe_excessive_retry";
  failureCode?: PayFailedInvoiceFailureCode;
  data?: {
    invoiceId?: string;
    status?: string;
    paymentIntentId?: string;
    paymentIntent?: {
      id: string;
      clientSecret: string;
      amount: number;
      currency: string;
      status: string;
    };
  };
}

// ====================================
// Hooks
// ====================================

/**
 * ✅ STRIPE BEST PRACTICE: Upgrade subscription with proration
 * Uses subscription.update() for seamless upgrade experience
 */
export const useUpgradeSubscription = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const invalidatePurchaseCaches = usePurchaseInvalidation();

  return useMutation({
    mutationFn: async ({ newPackageId, paymentMethodId }: UpgradeSubscriptionData) => {
      const response = await apiPost<UpgradeSubscriptionResponse>("/api/stripe/upgrade-subscription-payment", {
        newPackageId,
        paymentMethodId,
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.packages });
      if (userId) {
        invalidatePurchaseCaches(userId);
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userId) });

        // The upgrade-payment route writes `isActive: true` synchronously,
        // but the new entries grant happens via the `invoice.payment_succeeded`
        // webhook — now async, landing 5–15s after the API returns. Without
        // these deferred passes the immediate invalidations above refetch
        // stale data (pre-grant entry count) and the user sees the correct
        // entries only on the next manual refresh.
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: queryKeys.users.account(userId) });
          queryClient.refetchQueries({ queryKey: queryKeys.users.detail(userId) });
        }, 3000);
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: queryKeys.users.account(userId) });
          queryClient.refetchQueries({ queryKey: queryKeys.users.detail(userId) });
        }, 8000);
      }

    },
  });
};

/**
 * ✅ Renew subscription (failed payment recovery or reactivation)
 * Handles:
 * - Failed payment retry (past_due, unpaid)
 * - Reactivate canceled subscription within grace period
 * - Create new subscription for expired subscriptions
 */
export const useRenewSubscription = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const invalidatePurchaseCaches = usePurchaseInvalidation();
  const showEntryReward = useEntryRewardToast();

  return useMutation({
    mutationFn: async ({ packageId, paymentMethodId }: RenewSubscriptionData) => {
      const response = await apiPost<RenewSubscriptionResponse>("/api/stripe/renew-subscription", {
        packageId,
        paymentMethodId,
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.packages });
      if (userId) {
        invalidatePurchaseCaches(userId);
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      }

      if (data.success && !data.requiresPaymentConfirmation && userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userId) });
      }

      const resolvedPackageId = data.data?.subscription?.packageId;
      if (
        data.success &&
        !data.requiresPaymentConfirmation &&
        data.data?.grantEntryRewardToast === true &&
        resolvedPackageId
      ) {
        const pkg = getPackageById(resolvedPackageId);
        const monthly = pkg?.entriesPerMonth ?? 0;
        if (monthly > 0) {
          showEntryReward({
            entries: monthly,
            drawType: "major",
            source: "useRenewSubscription",
          });
        }
      }
    },
  });
};

/**
 * ✅ Downgrade subscription with benefit preservation
 * User keeps current benefits until billing cycle ends
 */
export const useDowngradeSubscription = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async ({ newPackageId }: DowngradeSubscriptionData) => {
      const response = await apiPost<DowngradeSubscriptionResponse>("/api/stripe/downgrade-subscription", {
        newPackageId,
      });
      return response;
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    },
  });
};

/**
 * ✅ Cancel subscription
 * Supports both immediate and end-of-period cancellation
 */
export const useCancelSubscription = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const invalidatePurchaseCaches = usePurchaseInvalidation();

  return useMutation({
    mutationFn: async ({ cancelAtPeriodEnd = true }: CancelSubscriptionData) => {
      const response = await apiPost<CancelSubscriptionResponse>("/api/stripe/cancel-subscription", {
        cancelAtPeriodEnd,
      });
      return response;
    },
    onSuccess: () => {
      if (!userId) return;
      invalidatePurchaseCaches(userId);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    },
  });
};

/**
 * ✅ Toggle auto-renew
 * Enable or disable automatic subscription renewal
 */
export const useUpdateAutoRenew = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async ({ autoRenew }: UpdateAutoRenewData) => {
      const response = await apiPatch<UpdateAutoRenewResponse>("/api/stripe/update-auto-renew", {
        autoRenew,
      });
      return response;
    },
    onMutate: async ({ autoRenew }) => {
      if (!userId) return { previousDetail: undefined, previousAccount: undefined };
      // users.detail is a PREFIX of users.account (["users", id] vs ["users", id, "account"]),
      // so this one call cancels the in-flight reads behind both.
      await queryClient.cancelQueries({ queryKey: queryKeys.users.detail(userId) });

      const previousDetail = queryClient.getQueryData<UserData>(queryKeys.users.detail(userId));
      const previousAccount = queryClient.getQueryData<MyAccountData>(queryKeys.users.account(userId));

      queryClient.setQueryData(queryKeys.users.detail(userId), (old: UserData | undefined) =>
        old?.subscription ? { ...old, subscription: { ...old.subscription, autoRenew } } : old
      );
      // setQueryData is EXACT-match, not prefix — and /my-account reads users.account. Without
      // this mirror the prediction is invisible there: the "Membership resumed" toast fires while
      // the card still says "Ends <date>" and the live Resume button can send a second billing PATCH.
      queryClient.setQueryData(queryKeys.users.account(userId), (old: MyAccountData | undefined) => {
        if (!old?.user.subscription) return old;
        return { ...old, user: { ...old.user, subscription: { ...old.user.subscription, autoRenew } } };
      });

      return { previousDetail, previousAccount };
    },
    onError: (err, variables, context) => {
      if (!userId) return;
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.users.detail(userId), context.previousDetail);
      }
      if (context?.previousAccount) {
        queryClient.setQueryData(queryKeys.users.account(userId), context.previousAccount);
      }
    },
    onSettled: () => {
      if (!userId) return;
      // Returned so mutateAsync settles only once the reconciled refetch has landed — callers
      // show the success toast on resolve, which must not beat the re-render it describes.
      return queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
    },
  });
};

/**
 * ✅ Update subscription payment method
 * Updates the payment method used for subscription billing
 */
export const useUpdateSubscriptionPaymentMethod = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const response = await apiPost<UpdateSubscriptionPaymentMethodResponse>(
        "/api/stripe/subscription/update-payment-method",
        {
          paymentMethodId,
        }
      );
      return response;
    },
    // F-05: predict `subscriptionDefaultPaymentMethodId` HERE, in the mutation that owns it.
    //
    // The Payment sheet picks the starred/hero card off this field for subscribers
    // (SettingsRedesignPayment.tsx: `subscriptionCardKnown ? pm.paymentMethodId === id : pm.isDefault`),
    // and nothing predicted it — so choosing a renewal card sat visibly dead through THREE
    // sequential round-trips (PUT default -> POST update-payment-method -> refetched GET).
    //
    // It must NOT be predicted inside `useSetDefaultPaymentMethod`: SavedPaymentMethodsModal
    // calls that one WITHOUT this subscription update, so the prediction would be wrong there
    // and visibly snap back. Only this mutation actually moves the renewal card.
    onMutate: async (paymentMethodId: string) => {
      if (!userId) return;
      const paymentMethodsKey = queryKeys.paymentMethods.all(userId);
      await queryClient.cancelQueries({ queryKey: paymentMethodsKey });
      const previousPaymentMethods = queryClient.getQueryData<
        PaymentMethodsQueryResult | SavedPaymentMethod[]
      >(paymentMethodsKey);

      queryClient.setQueryData(
        paymentMethodsKey,
        (old: PaymentMethodsQueryResult | SavedPaymentMethod[] | undefined) => {
          // Normalised because this entry can still hold the legacy bare-array shape.
          // `paymentMethods` is left untouched — this mutation moves only which card RENEWS,
          // not which card is the wallet default (that is set-default's job).
          const { paymentMethods } = normalizePaymentMethodsCache(old);
          return { paymentMethods, subscriptionDefaultPaymentMethodId: paymentMethodId };
        }
      );

      return { previousPaymentMethods, paymentMethodsKey };
    },
    onError: (_err, _paymentMethodId, context) => {
      // Restore even when the snapshot was `undefined`: onMutate wrote into a possibly-empty
      // entry, so skipping the restore would leave a fabricated row behind.
      if (!context) return;
      queryClient.setQueryData(context.paymentMethodsKey, context.previousPaymentMethods);
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userId) });
    },
  });
};

/**
 * ✅ Pay failed invoice (Pay Now flow for failed renewals)
 * Allows users with failed subscription renewals to pay their existing Stripe invoice
 * Reuses existing invoice and PaymentIntent (does not create new resources)
 */
export const usePayFailedInvoice = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async () => {
      const response = await apiPost<PayFailedInvoiceResponse>("/api/stripe/pay-failed-invoice", {});
      return response;
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userId) });
    },
  });
};

// ====================================
// Utility Functions
// ====================================

/**
 * Check if user can renew subscription
 * Returns true if subscription is in a renewable state
 */
export function canRenewSubscription(subscriptionStatus?: string): boolean {
  if (!subscriptionStatus) return false;

  const renewableStatuses = ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"];
  return renewableStatuses.includes(subscriptionStatus.toLowerCase());
}

/**
 * Get subscription status display text
 */
export function getSubscriptionStatusText(status?: string): string {
  if (!status) return "Unknown";

  const statusMap: Record<string, string> = {
    active: "Active",
    canceled: "Canceled",
    past_due: "Payment Failed",
    unpaid: "Unpaid",
    incomplete: "Incomplete",
    incomplete_expired: "Expired",
    // We never sell a real free trial; `trialing` only ever means a paid, active member whose
    // billing date was anchored/reanchored via Stripe `trial_end`. Always show "Active" to members.
    trialing: "Active",
    paused: "Paused",
  };

  return statusMap[status.toLowerCase()] || status;
}

/**
 * Get subscription status color
 */
export function getSubscriptionStatusColor(status?: string): "success" | "error" | "warning" | "default" {
  if (!status) return "default";

  const colorMap: Record<string, "success" | "error" | "warning" | "default"> = {
    active: "success",
    trialing: "success",
    canceled: "error",
    past_due: "error",
    unpaid: "error",
    incomplete: "warning",
    incomplete_expired: "error",
    paused: "warning",
  };

  return colorMap[status.toLowerCase()] || "default";
}
