/**
 * Wrapper hook that provides the same interface as the manual useSavedPaymentMethods
 * but uses React Query hooks under the hood for better performance and caching
 */

import { useCallback } from "react";
import {
  usePaymentMethods,
  useAddPaymentMethod,
  useDeletePaymentMethod,
  useSetDefaultPaymentMethod,
} from "@/hooks/queries/usePaymentQueries";
import { useUserContext } from "@/contexts/UserContext";
import type { SavedPaymentMethod, PaymentMethodsQueryResult } from "@/hooks/queries/usePaymentQueries";
import { ApiError } from "@/lib/queries";

export type DeletePaymentMethodOutcome =
  | { status: "deleted" }
  | { status: "needs_billing_confirm" }
  | { status: "failed"; message?: string };

interface UseSavedPaymentMethodsReturn {
  paymentMethods: SavedPaymentMethod[];
  /** Stripe subscription default PM id when user has an active subscription; null otherwise. */
  subscriptionDefaultPaymentMethodId: string | null;
  loading: boolean;
  error: string | null;
  savePaymentMethod: (paymentMethodId: string, setAsDefault?: boolean) => Promise<boolean>;
  deletePaymentMethod: (
    paymentMethodId: string,
    options?: { confirmBillingRisk?: boolean }
  ) => Promise<DeletePaymentMethodOutcome>;
  setDefaultPaymentMethod: (paymentMethodId: string) => Promise<boolean>;
  refreshPaymentMethods: () => Promise<void>;
}

/**
 * Wrapper hook for backward compatibility
 * Uses React Query hooks internally for better performance
 */
export function useSavedPaymentMethods(): UseSavedPaymentMethodsReturn {
  const { userData } = useUserContext();
  const userId = userData?._id;

  // Use React Query hooks
  const { data: paymentMethodsData, isLoading, error } = usePaymentMethods(userData?._id);
  const paymentMethods: SavedPaymentMethod[] = !paymentMethodsData
    ? []
    : Array.isArray(paymentMethodsData)
      ? paymentMethodsData
      : (paymentMethodsData as PaymentMethodsQueryResult).paymentMethods;
  const subscriptionDefaultPaymentMethodId: string | null =
    !paymentMethodsData || Array.isArray(paymentMethodsData)
      ? null
      : (paymentMethodsData as PaymentMethodsQueryResult).subscriptionDefaultPaymentMethodId ?? null;
  const addPaymentMethodMutation = useAddPaymentMethod();
  const deletePaymentMethodMutation = useDeletePaymentMethod();
  const setDefaultPaymentMethodMutation = useSetDefaultPaymentMethod();

  const savePaymentMethod = useCallback(
    async (paymentMethodId: string, setAsDefault: boolean = false): Promise<boolean> => {
      if (!userId) {
        console.error("Cannot save payment method without an authenticated user.");
        return false;
      }

      try {
        await addPaymentMethodMutation.mutateAsync({ paymentMethodId, setAsDefault, userId });
        return true;
      } catch (error) {
        console.error("Failed to save payment method:", error);
        return false;
      }
    },
    [addPaymentMethodMutation, userId]
  );

  const deletePaymentMethod = useCallback(
    async (
      paymentMethodId: string,
      options?: { confirmBillingRisk?: boolean }
    ): Promise<DeletePaymentMethodOutcome> => {
      if (!userId) {
        console.error("Cannot delete payment method without an authenticated user.");
        return { status: "failed", message: "Not signed in" };
      }

      try {
        await deletePaymentMethodMutation.mutateAsync({
          paymentMethodId,
          userId,
          confirmBillingRisk: options?.confirmBillingRisk,
        });
        return { status: "deleted" };
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const data = error.data as { code?: string } | undefined;
          if (data && typeof data === "object" && data.code === "REQUIRES_BILLING_RISK_CONFIRMATION") {
            return { status: "needs_billing_confirm" };
          }
        }
        console.error("Failed to delete payment method:", error);
        return {
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to delete payment method",
        };
      }
    },
    [deletePaymentMethodMutation, userId]
  );

  const setDefaultPaymentMethod = useCallback(
    async (paymentMethodId: string): Promise<boolean> => {
      if (!userId) {
        console.error("Cannot set default payment method without an authenticated user.");
        return false;
      }

      try {
        await setDefaultPaymentMethodMutation.mutateAsync({ paymentMethodId, userId });
        return true;
      } catch (error) {
        console.error("Failed to set default payment method:", error);
        return false;
      }
    },
    [setDefaultPaymentMethodMutation, userId]
  );

  const refreshPaymentMethods = useCallback(async (): Promise<void> => {
    // React Query handles refetching automatically
    // This is kept for backward compatibility
  }, []);

  return {
    paymentMethods,
    subscriptionDefaultPaymentMethodId,
    loading: isLoading,
    error: error?.message || null,
    savePaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
    refreshPaymentMethods,
  };
}

// Re-export the type for backward compatibility
export type { SavedPaymentMethod };
