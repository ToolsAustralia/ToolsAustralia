// src/hooks/queries/useOrdersQueries.ts
import { useQuery } from "@tanstack/react-query";

interface Order {
  _id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  gstAmount: number;
  shippingCost: number;
  createdAt: string;
  products: { product: string; quantity: number; price: number }[];
  shippingAddress: Record<string, string>;
  paymentIntentId?: string;
  trackingNumber?: string;
}

export type ShopOrder = Order;

export function useOrdersQuery() {
  return useQuery({
    queryKey: ["orders", "mine"],
    queryFn: async (): Promise<Order[]> => {
      const res = await fetch("/api/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      return data.orders ?? [];
    },
  });
}

export function useOrderQuery(orderNumber: string | undefined) {
  return useQuery({
    queryKey: ["orders", orderNumber],
    queryFn: async (): Promise<Order> => {
      const res = await fetch(`/api/orders/${orderNumber}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load order");
      const data = await res.json();
      return data.order;
    },
    enabled: !!orderNumber,
  });
}

export function useOrderByPaymentIntentQuery(piId: string | undefined) {
  return useQuery({
    queryKey: ["orders", "by-pi", piId],
    queryFn: async (): Promise<{ status: "ready" | "pending"; order?: Order }> => {
      const res = await fetch(`/api/orders/by-payment-intent/${piId}`);
      if (!res.ok) throw new Error("Failed to poll PI status");
      return res.json();
    },
    enabled: !!piId,
    refetchInterval: (q) => (q.state.data?.status === "ready" ? false : 2000),
    refetchIntervalInBackground: false,
  });
}
