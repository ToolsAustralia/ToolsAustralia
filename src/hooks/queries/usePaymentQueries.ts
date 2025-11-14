/**
 * Payment method React Query hooks
 *
 * This file contains all hooks for payment method data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/queries";
import { paymentMethodQueryOptions } from "@/lib/requestDeduplication";

// Types
export interface SavedPaymentMethod {
  paymentMethodId: string;
  isDefault: boolean;
  createdAt: Date;
  lastUsed?: Date;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
}

export interface PaymentMethodResponse {
  paymentMethods: SavedPaymentMethod[];
}

export interface AddPaymentMethodData {
  paymentMethodId: string;
  setAsDefault?: boolean;
  userId: string;
}

interface DeletePaymentMethodVariables {
  paymentMethodId: string;
  userId: string;
}

interface SetDefaultPaymentMethodVariables {
  paymentMethodId: string;
  userId: string;
}

export interface PaymentStatusResponse {
  success: boolean;
  data: {
    status: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
    metadata?: Record<string, unknown>;
  };
}

// Hooks
export const usePaymentMethods = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.paymentMethods.all(userId!),
    queryFn: async () => {
      const response = await apiGet<PaymentMethodResponse>("/api/stripe/payment-methods");
      return response.paymentMethods;
    },
    enabled: !!userId,
    ...paymentMethodQueryOptions, // Use optimized caching options
  });
};

export const useDefaultPaymentMethod = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.paymentMethods.default(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: SavedPaymentMethod | null }>(
        "/api/stripe/payment-methods/default"
      );
      return response.data;
    },
    enabled: !!userId,
    ...paymentMethodQueryOptions, // Use optimized caching options
  });
};

export const usePaymentStatus = (paymentIntentId?: string) => {
  return useQuery({
    queryKey: ["payment-status", paymentIntentId!],
    queryFn: async () => {
      const response = await apiGet<PaymentStatusResponse>(`/api/payment-status/${paymentIntentId}`);
      return response;
    },
    enabled: !!paymentIntentId,
    staleTime: 0, // Always fresh
    gcTime: 0, // Don't cache
    refetchInterval: 2 * 1000, // Poll every 2 seconds
    refetchIntervalInBackground: false, // Stop polling when tab is not active
  });
};

// Mutations
export const useAddPaymentMethod = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentMethodId, setAsDefault = false }: AddPaymentMethodData) => {
      const response = await apiPost<{ success: boolean; data: SavedPaymentMethod }>("/api/stripe/payment-methods", {
        paymentMethodId,
        setAsDefault,
      });
      return response.data;
    },
    onMutate: async ({ paymentMethodId, setAsDefault = false, userId }) => {
      const paymentMethodsKey = queryKeys.paymentMethods.all(userId);
      const defaultKey = queryKeys.paymentMethods.default(userId);

      await queryClient.cancelQueries({ queryKey: paymentMethodsKey });

      const previousPaymentMethods = queryClient.getQueryData<SavedPaymentMethod[]>(paymentMethodsKey);
      const previousDefault = queryClient.getQueryData<SavedPaymentMethod | null>(defaultKey);

      const optimisticPaymentMethod: SavedPaymentMethod = {
        paymentMethodId,
        isDefault: setAsDefault,
        createdAt: new Date(),
      };

      queryClient.setQueryData(paymentMethodsKey, (old: SavedPaymentMethod[] = []) => {
        const base = setAsDefault ? old.map((method) => ({ ...method, isDefault: false })) : [...old];
        const withoutCurrent = base.filter((method) => method.paymentMethodId !== paymentMethodId);
        return setAsDefault
          ? [optimisticPaymentMethod, ...withoutCurrent]
          : [...withoutCurrent, optimisticPaymentMethod];
      });

      if (setAsDefault) {
        queryClient.setQueryData(defaultKey, optimisticPaymentMethod);
      }

      return { previousPaymentMethods, previousDefault, paymentMethodsKey, defaultKey };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;
      const { previousPaymentMethods, previousDefault, paymentMethodsKey, defaultKey } = context;
      if (previousPaymentMethods) {
        queryClient.setQueryData(paymentMethodsKey, previousPaymentMethods);
      }
      if (previousDefault) {
        queryClient.setQueryData(defaultKey, previousDefault);
      }
    },
    onSuccess: (data, _variables, context) => {
      if (!context) return;
      const { paymentMethodsKey, defaultKey } = context;

      queryClient.setQueryData(paymentMethodsKey, (old: SavedPaymentMethod[] = []) => {
        const withoutCurrent = old.filter((method) => method.paymentMethodId !== data.paymentMethodId);
        const normalised = withoutCurrent.map((method) => (data.isDefault ? { ...method, isDefault: false } : method));
        return data.isDefault ? [data, ...normalised] : [...normalised, data];
      });

      if (data.isDefault) {
        queryClient.setQueryData(defaultKey, data);
      }
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context) return;
      const { paymentMethodsKey, defaultKey } = context;
      queryClient.invalidateQueries({ queryKey: paymentMethodsKey });
      queryClient.invalidateQueries({ queryKey: defaultKey });
    },
  });
};

export const useDeletePaymentMethod = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentMethodId }: DeletePaymentMethodVariables) => {
      await apiDelete(`/api/stripe/payment-methods/${paymentMethodId}`);
      return { paymentMethodId };
    },
    onMutate: async ({ paymentMethodId, userId }) => {
      const paymentMethodsKey = queryKeys.paymentMethods.all(userId);
      const defaultKey = queryKeys.paymentMethods.default(userId);

      await queryClient.cancelQueries({ queryKey: paymentMethodsKey });

      const previousPaymentMethods = queryClient.getQueryData<SavedPaymentMethod[]>(paymentMethodsKey);
      const previousDefault = queryClient.getQueryData<SavedPaymentMethod | null>(defaultKey);

      queryClient.setQueryData(paymentMethodsKey, (old: SavedPaymentMethod[] = []) => {
        return old.filter((method) => method.paymentMethodId !== paymentMethodId);
      });

      return { previousPaymentMethods, previousDefault, paymentMethodsKey, defaultKey };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;
      const { previousPaymentMethods, previousDefault, paymentMethodsKey, defaultKey } = context;
      if (previousPaymentMethods) {
        queryClient.setQueryData(paymentMethodsKey, previousPaymentMethods);
      }
      if (previousDefault) {
        queryClient.setQueryData(defaultKey, previousDefault);
      }
    },
    onSuccess: (data, _variables, context) => {
      if (!context) return;
      const { defaultKey } = context;
      queryClient.setQueryData(defaultKey, (old: SavedPaymentMethod | null) => {
        return old?.paymentMethodId === data.paymentMethodId ? null : old;
      });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context) return;
      const { paymentMethodsKey, defaultKey } = context;
      queryClient.invalidateQueries({ queryKey: paymentMethodsKey });
      queryClient.invalidateQueries({ queryKey: defaultKey });
    },
  });
};

export const useSetDefaultPaymentMethod = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentMethodId }: SetDefaultPaymentMethodVariables) => {
      const response = await apiPut<{ success: boolean; data: SavedPaymentMethod }>(
        `/api/stripe/payment-methods/${paymentMethodId}/default`,
        {}
      );
      return response.data;
    },
    onMutate: async ({ paymentMethodId, userId }) => {
      const paymentMethodsKey = queryKeys.paymentMethods.all(userId);
      const defaultKey = queryKeys.paymentMethods.default(userId);

      await queryClient.cancelQueries({ queryKey: paymentMethodsKey });

      const previousPaymentMethods = queryClient.getQueryData<SavedPaymentMethod[]>(paymentMethodsKey);
      const previousDefault = queryClient.getQueryData<SavedPaymentMethod | null>(defaultKey);

      queryClient.setQueryData(paymentMethodsKey, (old: SavedPaymentMethod[] = []) => {
        const selected = old.find((method) => method.paymentMethodId === paymentMethodId);
        const others = old
          .filter((method) => method.paymentMethodId !== paymentMethodId)
          .map((method) => ({ ...method, isDefault: false }));
        return selected ? [{ ...selected, isDefault: true }, ...others] : old;
      });

      return { previousPaymentMethods, previousDefault, paymentMethodsKey, defaultKey };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;
      const { previousPaymentMethods, previousDefault, paymentMethodsKey, defaultKey } = context;
      if (previousPaymentMethods) {
        queryClient.setQueryData(paymentMethodsKey, previousPaymentMethods);
      }
      if (previousDefault) {
        queryClient.setQueryData(defaultKey, previousDefault);
      }
    },
    onSuccess: (data, _variables, context) => {
      if (!context) return;
      const { paymentMethodsKey, defaultKey } = context;

      queryClient.setQueryData(paymentMethodsKey, (old: SavedPaymentMethod[] = []) => {
        const withoutCurrent = old.filter((method) => method.paymentMethodId !== data.paymentMethodId);
        const reset = withoutCurrent.map((method) => ({ ...method, isDefault: false }));
        return [data, ...reset];
      });

      queryClient.setQueryData(defaultKey, data);
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context) return;
      const { paymentMethodsKey, defaultKey } = context;
      queryClient.invalidateQueries({ queryKey: paymentMethodsKey });
      queryClient.invalidateQueries({ queryKey: defaultKey });
    },
  });
};

// Utility hooks
export const usePaymentMethodPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchPaymentMethods = (userId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.paymentMethods.all(userId),
      queryFn: async () => {
        const response = await apiGet<PaymentMethodResponse>("/api/stripe/payment-methods");
        return response.paymentMethods;
      },
      staleTime: 5 * 60 * 1000,
    });
  };

  return { prefetchPaymentMethods };
};
