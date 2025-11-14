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
import { apiPost, apiPatch } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";

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

// ====================================
// Hooks
// ====================================

/**
 * ✅ STRIPE BEST PRACTICE: Upgrade subscription with proration
 * Uses subscription.update() for seamless upgrade experience
 */
export const useUpgradeSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ newPackageId, paymentMethodId }: UpgradeSubscriptionData) => {
      const response = await apiPost<UpgradeSubscriptionResponse>("/api/stripe/upgrade-subscription-payment", {
        newPackageId,
        paymentMethodId,
      });
      return response;
    },
    onSuccess: (data) => {
      // Invalidate user and membership queries to reflect new subscription
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.packages });
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all("current-user") });
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

  return useMutation({
    mutationFn: async ({ packageId, paymentMethodId }: RenewSubscriptionData) => {
      const response = await apiPost<RenewSubscriptionResponse>("/api/stripe/renew-subscription", {
        packageId,
        paymentMethodId,
      });
      return response;
    },
    onSuccess: (data) => {
      // Invalidate user and membership queries
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.packages });

      // If payment was successful immediately, invalidate payment methods too
      if (data.success && !data.requiresPaymentConfirmation) {
        queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all("current-user") });
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

  return useMutation({
    mutationFn: async ({ newPackageId }: DowngradeSubscriptionData) => {
      const response = await apiPost<DowngradeSubscriptionResponse>("/api/stripe/downgrade-subscription", {
        newPackageId,
      });
      return response;
    },
    onSuccess: () => {
      // Invalidate user query to show pending downgrade
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
    },
  });
};

/**
 * ✅ Cancel subscription
 * Supports both immediate and end-of-period cancellation
 */
export const useCancelSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cancelAtPeriodEnd = true }: CancelSubscriptionData) => {
      const response = await apiPost<CancelSubscriptionResponse>("/api/stripe/cancel-subscription", {
        cancelAtPeriodEnd,
      });
      return response;
    },
    onSuccess: () => {
      // Invalidate user query to reflect cancellation
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
    },
  });
};

/**
 * ✅ Toggle auto-renew
 * Enable or disable automatic subscription renewal
 */
export const useUpdateAutoRenew = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ autoRenew }: UpdateAutoRenewData) => {
      const response = await apiPatch<UpdateAutoRenewResponse>("/api/stripe/update-auto-renew", {
        autoRenew,
      });
      return response;
    },
    onMutate: async ({ autoRenew }) => {
      // Cancel outgoing refetches
      const userQueryKey = queryKeys.users.detail("current");
      await queryClient.cancelQueries({ queryKey: userQueryKey });

      // Snapshot previous value
      const previousUser = queryClient.getQueryData(userQueryKey);

      // Optimistically update
      queryClient.setQueryData(userQueryKey, (old: unknown) => {
        if (!old) return old;
        const userData = old as { subscription?: { autoRenew?: boolean } };
        return {
          ...userData,
          subscription: {
            ...userData.subscription,
            autoRenew,
          },
        };
      });

      return { previousUser };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousUser) {
        queryClient.setQueryData(queryKeys.users.detail("current"), context.previousUser);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
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
    trialing: "Trial",
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
