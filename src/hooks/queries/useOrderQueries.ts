/**
 * Order React Query hooks
 *
 * This file contains all hooks for order data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost, apiPut } from "@/lib/queries";

// Types
export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  product?: {
    _id: string;
    name: string;
    images: string[];
    brand: string;
  };
}

export interface Order {
  _id: string;
  orderNumber: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  shippingAddress: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethod?: {
    type: string;
    last4?: string;
    brand?: string;
  };
  trackingNumber?: string;
  estimatedDelivery?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFilters extends Record<string, unknown> {
  status?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface OrderResponse {
  orders: Order[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    limit: number;
  };
}

export interface CreateOrderData {
  items: OrderItem[];
  shippingAddress: Order["shippingAddress"];
  billingAddress?: Order["billingAddress"];
  paymentMethodId?: string;
  couponCode?: string;
}

export interface OrderAnalytics {
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  monthlyGrowth: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  orderStatusBreakdown: Record<string, number>;
  monthlyRevenue: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
}

// Hooks
export const useOrders = (userId?: string, filters: OrderFilters = {}) => {
  return useQuery({
    queryKey: queryKeys.orders.all(userId!),
    queryFn: async () => {
      const params = new URLSearchParams();

      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });

      const response = await apiGet<OrderResponse>(`/api/orders?${params.toString()}`);
      return response;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: keepPreviousData,
  });
};

export const useInfiniteOrders = (userId?: string, filters: OrderFilters = {}) => {
  return useInfiniteQuery({
    queryKey: queryKeys.orders.all(userId!),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();

      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });

      params.append("page", String(pageParam));
      params.append("limit", "10");

      const response = await apiGet<OrderResponse>(`/api/orders?${params.toString()}`);
      return response;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasNextPage ? lastPage.pagination.currentPage + 1 : undefined;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useOrder = (orderId?: string) => {
  return useQuery({
    queryKey: queryKeys.orders.detail(orderId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: Order }>(`/api/orders/${orderId}`);
      return response.data;
    },
    enabled: !!orderId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useRecentOrders = (userId?: string, limit: number = 5) => {
  return useQuery({
    queryKey: queryKeys.orders.recent(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: Order[] }>(`/api/orders/recent?limit=${limit}`);
      return response.data;
    },
    enabled: !!userId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
};

export const useOrderAnalytics = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.orders.analytics(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: OrderAnalytics }>(`/api/orders/analytics`);
      return response.data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
};

// Mutations
export const useCreateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderData: CreateOrderData) => {
      const response = await apiPost<{ success: boolean; data: Order }>("/api/orders", orderData);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate orders list
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all("current-user") });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.recent("current-user") });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.analytics("current-user") });

      // Clear cart after successful order
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all("current-user") });
    },
    onError: (error) => {
      console.error("Failed to create order:", error);
    },
  });
};

export const useCancelOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiPut<{ success: boolean; data: Order }>(`/api/orders/${orderId}/cancel`, {});
      return response.data;
    },
    onSuccess: (data) => {
      // Update order in cache
      queryClient.setQueryData(queryKeys.orders.detail(data._id), data);

      // Invalidate orders list
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all("current-user") });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.recent("current-user") });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.analytics("current-user") });
    },
  });
};

export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: Order["status"] }) => {
      const response = await apiPut<{ success: boolean; data: Order }>(`/api/orders/${orderId}/status`, { status });
      return response.data;
    },
    onSuccess: (data) => {
      // Update order in cache
      queryClient.setQueryData(queryKeys.orders.detail(data._id), data);

      // Invalidate orders list
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all("current-user") });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.recent("current-user") });
    },
  });
};

export const useRequestRefund = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const response = await apiPost<{ success: boolean; data: Order }>(`/api/orders/${orderId}/refund`, { reason });
      return response.data;
    },
    onSuccess: (data) => {
      // Update order in cache
      queryClient.setQueryData(queryKeys.orders.detail(data._id), data);

      // Invalidate orders list
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all("current-user") });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.recent("current-user") });
    },
  });
};

// Utility hooks
export const useOrderStats = (userId?: string) => {
  const { data: analytics } = useOrderAnalytics(userId);

  return {
    totalOrders: analytics?.totalOrders || 0,
    totalSpent: analytics?.totalSpent || 0,
    averageOrderValue: analytics?.averageOrderValue || 0,
    ordersThisMonth: analytics?.ordersThisMonth || 0,
    ordersLastMonth: analytics?.ordersLastMonth || 0,
    monthlyGrowth: analytics?.monthlyGrowth || 0,
    topProducts: analytics?.topProducts || [],
    orderStatusBreakdown: analytics?.orderStatusBreakdown || {},
    monthlyRevenue: analytics?.monthlyRevenue || [],
  };
};

export const useOrderPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchOrder = (orderId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.orders.detail(orderId),
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: Order }>(`/api/orders/${orderId}`);
        return response.data;
      },
      staleTime: 5 * 60 * 1000,
    });
  };

  const prefetchRecentOrders = (userId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.orders.recent(userId),
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: Order[] }>("/api/orders/recent?limit=5");
        return response.data;
      },
      staleTime: 1 * 60 * 1000,
    });
  };

  return { prefetchOrder, prefetchRecentOrders };
};
