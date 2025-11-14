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
} from "@/hooks/queries";
import { useUserContext } from "@/contexts/UserContext";
import type { SavedPaymentMethod } from "@/hooks/queries";

interface UseSavedPaymentMethodsReturn {
  paymentMethods: SavedPaymentMethod[];
  loading: boolean;
  error: string | null;
  savePaymentMethod: (paymentMethodId: string, setAsDefault?: boolean) => Promise<boolean>;
  deletePaymentMethod: (paymentMethodId: string) => Promise<boolean>;
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
  const { data: paymentMethods = [], isLoading, error } = usePaymentMethods(userData?._id);
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
    async (paymentMethodId: string): Promise<boolean> => {
      if (!userId) {
        console.error("Cannot delete payment method without an authenticated user.");
        return false;
      }

      try {
        await deletePaymentMethodMutation.mutateAsync({ paymentMethodId, userId });
        return true;
      } catch (error) {
        console.error("Failed to delete payment method:", error);
        return false;
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
