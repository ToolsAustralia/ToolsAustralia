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
  subscriptionDefaultPaymentMethodId?: string | null;
}

/** Cached shape for `queryKeys.paymentMethods.all` — includes Stripe subscription billing PM id. */
export interface PaymentMethodsQueryResult {
  paymentMethods: SavedPaymentMethod[];
  subscriptionDefaultPaymentMethodId: string | null;
}

function normalizePaymentMethodsCache(
  cached: PaymentMethodsQueryResult | SavedPaymentMethod[] | undefined
): PaymentMethodsQueryResult {
  if (cached === undefined) {
    return { paymentMethods: [], subscriptionDefaultPaymentMethodId: null };
  }
  if (Array.isArray(cached)) {
    return { paymentMethods: cached, subscriptionDefaultPaymentMethodId: null };
  }
  return {
    paymentMethods: cached.paymentMethods,
    subscriptionDefaultPaymentMethodId: cached.subscriptionDefaultPaymentMethodId ?? null,
  };
}

export interface AddPaymentMethodData {
  paymentMethodId: string;
  setAsDefault?: boolean;
  userId: string;
}

interface DeletePaymentMethodVariables {
  paymentMethodId: string;
  userId: string;
  /** Set when server returns 409 REQUIRES_BILLING_RISK_CONFIRMATION (remove only billing PM on active sub). */
  confirmBillingRisk?: boolean;
}

interface SetDefaultPaymentMethodVariables {
  paymentMethodId: string;
  userId: string;
}

export interface PaymentStatusResponse {
  success: boolean;
  processed: boolean;
  status: "completed" | "pending";
  data: {
    paymentIntentId: string;
    eventType?: string;
    packageType?: string;
    packageName?: string;
    entries?: number;
    points?: number;
    price?: number;
    currency?: string;
    processedBy?: string;
    timestamp?: string;
    message?: string;
    latestEventType?: string;
    latestEventAt?: string;
  };
}

interface UsePaymentStatusOptions {
  enabled?: boolean;
}

const PAYMENT_STATUS_BASE_INTERVAL = 2000;
const PAYMENT_STATUS_MAX_INTERVAL = 10000;
const PAYMENT_STATUS_TIMEOUT_MS = 90000;

// Hooks
export const usePaymentMethods = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.paymentMethods.all(userId!),
    queryFn: async (): Promise<PaymentMethodsQueryResult> => {
      const response = await apiGet<PaymentMethodResponse>("/api/stripe/payment-methods");
      return {
        paymentMethods: response.paymentMethods,
        subscriptionDefaultPaymentMethodId: response.subscriptionDefaultPaymentMethodId ?? null,
      };
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

export const usePaymentStatus = (paymentIntentId?: string, options?: UsePaymentStatusOptions) => {
  return useQuery({
    queryKey: ["payment-status", paymentIntentId!],
    queryFn: async () => {
      const response = await apiGet<PaymentStatusResponse>(`/api/payment-status/${paymentIntentId}`);
      return response;
    },
    enabled: !!paymentIntentId && (options?.enabled ?? true),
    staleTime: 0, // Always fresh
    gcTime: 0, // Don't cache
    refetchInterval: (query) => {
      const data = query.state.data as PaymentStatusResponse | undefined;
      if (data?.processed) {
        return false;
      }

      const startedAt = (query.meta?.startedAt as number) ?? 0;
      if (startedAt && Date.now() - startedAt > PAYMENT_STATUS_TIMEOUT_MS) {
        return false;
      }

      const attempts = query.state.dataUpdateCount ?? 0;
      const interval = Math.min(
        PAYMENT_STATUS_MAX_INTERVAL,
        PAYMENT_STATUS_BASE_INTERVAL * Math.pow(2, attempts)
      );
      return interval;
    },
    refetchIntervalInBackground: false, // Stop polling when tab is not active
    meta: {
      startedAt: Date.now(),
    },
  });
};

// Mutations
export const useAddPaymentMethod = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentMethodId, setAsDefault = false }: AddPaymentMethodData): Promise<SavedPaymentMethod> => {
      const response = await apiPost<{ success: boolean; paymentMethod: SavedPaymentMethod; message?: string }>(
        "/api/stripe/payment-methods",
        {
          paymentMethodId,
          setAsDefault,
        }
      );
      // API returns { success, paymentMethod, message } but we return just the paymentMethod
      return response.paymentMethod;
    },
    onMutate: async ({ paymentMethodId, setAsDefault = false, userId }) => {
      const paymentMethodsKey = queryKeys.paymentMethods.all(userId);
      const defaultKey = queryKeys.paymentMethods.default(userId);

      await queryClient.cancelQueries({ queryKey: paymentMethodsKey });

      const previousPaymentMethods = queryClient.getQueryData<PaymentMethodsQueryResult | SavedPaymentMethod[]>(
        paymentMethodsKey
      );
      const previousDefault = queryClient.getQueryData<SavedPaymentMethod | null>(defaultKey);

      const optimisticPaymentMethod: SavedPaymentMethod = {
        paymentMethodId,
        isDefault: setAsDefault,
        createdAt: new Date(),
      };

      queryClient.setQueryData(paymentMethodsKey, (old: PaymentMethodsQueryResult | SavedPaymentMethod[] | undefined) => {
        const { paymentMethods: prev, subscriptionDefaultPaymentMethodId } = normalizePaymentMethodsCache(old);
        const base = setAsDefault ? prev.map((method) => ({ ...method, isDefault: false })) : [...prev];
        const withoutCurrent = base.filter((method) => method.paymentMethodId !== paymentMethodId);
        const nextList = setAsDefault
          ? [optimisticPaymentMethod, ...withoutCurrent]
          : [...withoutCurrent, optimisticPaymentMethod];
        return {
          paymentMethods: nextList,
          subscriptionDefaultPaymentMethodId,
        };
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

      queryClient.setQueryData(paymentMethodsKey, (old: PaymentMethodsQueryResult | SavedPaymentMethod[] | undefined) => {
        const { paymentMethods: prev, subscriptionDefaultPaymentMethodId } = normalizePaymentMethodsCache(old);
        const withoutCurrent = prev.filter((method) => method.paymentMethodId !== data.paymentMethodId);
        const normalised = withoutCurrent.map((method) => (data.isDefault ? { ...method, isDefault: false } : method));
        const nextList = data.isDefault ? [data, ...normalised] : [...normalised, data];
        return {
          paymentMethods: nextList,
          subscriptionDefaultPaymentMethodId,
        };
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
    mutationFn: async ({ paymentMethodId, confirmBillingRisk }: DeletePaymentMethodVariables) => {
      const q = confirmBillingRisk ? "?confirmBillingRisk=1" : "";
      await apiDelete(`/api/stripe/payment-methods/${paymentMethodId}${q}`);
      return { paymentMethodId };
    },
    onMutate: async ({ paymentMethodId, userId }) => {
      const paymentMethodsKey = queryKeys.paymentMethods.all(userId);
      const defaultKey = queryKeys.paymentMethods.default(userId);

      await queryClient.cancelQueries({ queryKey: paymentMethodsKey });

      const previousPaymentMethods = queryClient.getQueryData<PaymentMethodsQueryResult | SavedPaymentMethod[]>(
        paymentMethodsKey
      );
      const previousDefault = queryClient.getQueryData<SavedPaymentMethod | null>(defaultKey);

      queryClient.setQueryData(paymentMethodsKey, (old: PaymentMethodsQueryResult | SavedPaymentMethod[] | undefined) => {
        const { paymentMethods: prev, subscriptionDefaultPaymentMethodId } = normalizePaymentMethodsCache(old);
        const filtered = prev.filter((method) => method.paymentMethodId !== paymentMethodId);
        let nextSubDefault = subscriptionDefaultPaymentMethodId;
        if (subscriptionDefaultPaymentMethodId === paymentMethodId) {
          const nextDefaultPm = filtered.find((m) => m.isDefault) ?? filtered[0];
          nextSubDefault = nextDefaultPm?.paymentMethodId ?? null;
        }
        return {
          paymentMethods: filtered,
          subscriptionDefaultPaymentMethodId: nextSubDefault,
        };
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
    onSettled: (_data, _error, variables, context) => {
      if (!context) return;
      const { paymentMethodsKey, defaultKey } = context;
      queryClient.invalidateQueries({ queryKey: paymentMethodsKey });
      queryClient.invalidateQueries({ queryKey: defaultKey });
      if (variables.userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(variables.userId) });
      }
    },
  });
};

export const useSetDefaultPaymentMethod = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentMethodId }: SetDefaultPaymentMethodVariables): Promise<SavedPaymentMethod> => {
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

      const previousPaymentMethods = queryClient.getQueryData<PaymentMethodsQueryResult | SavedPaymentMethod[]>(
        paymentMethodsKey
      );
      const previousDefault = queryClient.getQueryData<SavedPaymentMethod | null>(defaultKey);

      queryClient.setQueryData(paymentMethodsKey, (old: PaymentMethodsQueryResult | SavedPaymentMethod[] | undefined) => {
        const { paymentMethods: prev, subscriptionDefaultPaymentMethodId } = normalizePaymentMethodsCache(old);
        const selected = prev.find((method) => method.paymentMethodId === paymentMethodId);
        const others = prev
          .filter((method) => method.paymentMethodId !== paymentMethodId)
          .map((method) => ({ ...method, isDefault: false }));
        const nextList = selected ? [{ ...selected, isDefault: true }, ...others] : prev;
        return {
          paymentMethods: nextList,
          subscriptionDefaultPaymentMethodId,
        };
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

      queryClient.setQueryData(paymentMethodsKey, (old: PaymentMethodsQueryResult | SavedPaymentMethod[] | undefined) => {
        const { paymentMethods: prev, subscriptionDefaultPaymentMethodId } = normalizePaymentMethodsCache(old);
        const withoutCurrent = prev.filter((method) => method.paymentMethodId !== data.paymentMethodId);
        const reset = withoutCurrent.map((method) => ({ ...method, isDefault: false }));
        return {
          paymentMethods: [data, ...reset],
          subscriptionDefaultPaymentMethodId,
        };
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
      queryFn: async (): Promise<PaymentMethodsQueryResult> => {
        const response = await apiGet<PaymentMethodResponse>("/api/stripe/payment-methods");
        return {
          paymentMethods: response.paymentMethods,
          subscriptionDefaultPaymentMethodId: response.subscriptionDefaultPaymentMethodId ?? null,
        };
      },
      staleTime: 5 * 60 * 1000,
    });
  };

  return { prefetchPaymentMethods };
};
