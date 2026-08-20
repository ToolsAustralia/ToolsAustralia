/**
 * Order React Query hooks
 *
 * This file contains all hooks for order data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost, apiPut } from "@/lib/queries";
import { usePurchaseInvalidation } from "@/hooks/usePurchaseInvalidation";

// Types
export interface OrderItem {
  /**
   * The schema field is `product` — an ObjectId ref, populated to an object by
   * the order read routes. It is NOT `productId`; both order reads populated
   * that non-existent path until 2026-08-17 and would have thrown on the first
   * real order.
   */
  product?: { _id: string; name: string; images: string[]; brand: string } | string;
  /** Chosen variant, snapshotted at purchase — this is what the printer makes. */
  sku?: string;
  /** Product name, snapshotted so a later catalog rename cannot rewrite history. */
  name?: string;
  quantity: number;
  price: number;
  /**
   * The chosen variant, snapshotted alongside the sku. Rendered as
   * `[colour, size]` joined — the same order `listOrders` builds its `variant`
   * string in, so one order reads identically on the success page and in the
   * order history.
   */
  size?: string;
  colour?: string;
  /**
   * Free entries included with ONE unit, snapshotted at purchase.
   *
   * Present on the document but not the payout: what was actually granted is
   * `entriesGranted` on the order. Read that for anything customer-facing, or a
   * change to the multiplier after the fact would restate history.
   */
  includedEntries?: number;
}

/**
 * The client view of an Order.
 *
 * This interface used to be a fiction — it declared `items`, `paymentStatus`,
 * `paymentMethod`, `billingAddress`, `estimatedDelivery` and a `"refunded"`
 * status, none of which exist on `src/models/Order.ts`. Nothing caught it
 * because no Order had ever been written. It now mirrors the real schema; if you
 * add a field here, add it to the model first.
 */
export interface Order {
  _id: string;
  orderNumber: string;
  /** Line items. The schema field is `products`, NOT `items`. */
  products: OrderItem[];
  totalAmount: number;
  subtotal: number;
  /** GST already INSIDE totalAmount — never add it. */
  gstAmount: number;
  shippingCost: number;
  appliedDiscounts?: { type: string; amount: number; description: string }[];
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "completed";
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    /** @deprecated legacy single-line address on pre-2026-08 orders. */
    address?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    deliveryInstructions?: string;
  };
  paymentIntentId?: string;
  trackingNumber?: string;
  notes?: string;
  /**
   * Free entries actually granted for this order, written once by the webhook.
   *
   * Absent or `0` is the normal state while merchandise entries ship dark at
   * `includedEntries: 0`, so a surface must render this only above zero rather
   * than announcing "0 free entries" — a promise we are not currently making.
   */
  entriesGranted?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * An order is paid once the webhook has moved it off `pending`.
 *
 * There is no `paymentStatus` field — payment state is inferred from `status`,
 * which is the only thing the webhook writes.
 */
export function isOrderPaid(order: Pick<Order, "status">): boolean {
  return order.status !== "pending" && order.status !== "cancelled";
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

/**
 * A row from the ORDER LIST — not a full order document.
 *
 * `/api/orders` returns a lean projection built by `listOrders`, deliberately: an
 * unprojected list once shipped every Product document and every address on every
 * row. Use `useOrder(id)` when the whole document is genuinely needed.
 */
export interface OrderListRow {
  id: string;
  orderNumber: string;
  status: Order["status"];
  createdAt: string;
  totalAmount: number;
  itemCount: number;
  categories: string[];
  /** Admin surfaces only — omitted from a customer's own list. */
  customerName?: string;
  entriesGranted?: number;
  /** Postage on this order, so a row's total reconciles with its own lines. */
  shippingCost?: number;
  submittedAt?: string;
  trackingNumber?: string;
  items: { name: string; sku?: string; variant?: string; quantity: number; price: number }[];
}

export interface OrderResponse {
  orders: OrderListRow[];
  total: number;
  page: number;
  totalPages: number;
}

/** @deprecated Legacy paginated envelope. Nothing returns this shape any more. */
export interface LegacyOrderResponse {
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
      // The route returns { page, totalPages }, not a pagination envelope — the old
      // shape was never what /api/orders sent.
      return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
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
      // GET /api/orders/[id] returns { order } (src/app/api/orders/[id]/route.ts) —
      // reading the previously-assumed { success, data } shape made `order` always
      // undefined, which rendered /checkout/success's error state and silenced the
      // shop Purchase pixel (shop's only Meta signal — no CAPI counterpart).
      const response = await apiGet<{ order: Order }>(`/api/orders/${orderId}`);
      return response.order;
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
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const invalidatePurchaseCaches = usePurchaseInvalidation();

  return useMutation({
    mutationFn: async (orderData: CreateOrderData) => {
      const response = await apiPost<{ success: boolean; data: Order }>("/api/orders", orderData);
      return response.data;
    },
    onSuccess: () => {
      if (!userId) return;
      invalidatePurchaseCaches(userId);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.recent(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.analytics(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all(userId) });
    },
    onError: (error) => {
      console.error("Failed to create order:", error);
    },
  });
};

export const useCancelOrder = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiPut<{ success: boolean; data: Order }>(`/api/orders/${orderId}/cancel`, {});
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.orders.detail(data._id), data);
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.recent(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.analytics(userId) });
    },
  });
};

export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: Order["status"] }) => {
      const response = await apiPut<{ success: boolean; data: Order }>(`/api/orders/${orderId}/status`, { status });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.orders.detail(data._id), data);
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.recent(userId) });
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
