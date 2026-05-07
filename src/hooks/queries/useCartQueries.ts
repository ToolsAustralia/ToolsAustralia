/**
 * Cart management React Query hooks
 *
 * This file contains all hooks for cart data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/queries";

// Types
export interface CartItem {
  type: "product" | "ticket";
  productId: string;
  miniDrawId?: string;
  quantity: number;
  price: number;
  product?: {
    _id: string;
    name: string;
    price: number;
    images: string[];
    brand: string;
    stock: number;
  };
  miniDraw?: {
    _id: string;
    name: string;
    ticketPrice: number;
    totalTickets: number;
    soldTickets: number;
    prize: {
      name: string;
      value: number;
      images: string[];
    };
  };
}

export interface CartSummary {
  totalItems: number;
  totalAmount: number;
  subtotal: number;
  /** AU GST is included in `totalAmount` (1/11). Display as "incl. $X GST" — never added to total. */
  gstIncluded: number;
  shipping: number;
  discount: number;
  membershipDiscount?: number;
  partnerDiscount?: number;
}

export interface CartResponse {
  items: CartItem[];
  summary: CartSummary;
  lastUpdated: string;
}

export interface AddToCartData {
  productId: string;
  quantity: number;
  price: number;
}

export interface UpdateCartItemData {
  productId: string;
  quantity: number;
}

// Hooks
export const useCart = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.cart.all(userId!),
    queryFn: async () => {
      const response = await apiGet<{
        cart: Array<{
          type: "product" | "ticket";
          productId?: string;
          miniDrawId?: string;
          quantity: number;
          price?: number;
          product?: {
            _id: string;
            name: string;
            price: number;
            images: string[];
            brand: string;
            stock: number;
          };
          miniDraw?: {
            _id: string;
            name: string;
            ticketPrice: number;
            totalTickets: number;
            soldTickets: number;
            prize: {
              name: string;
              value: number;
              images: string[];
            };
          };
        }>;
        subtotal: number;
        itemCount: number;
        summary: { productItems: number; ticketItems: number };
      }>("/api/cart");

      // Transform to match expected format
      const transformedItems = response.cart.map((item) => ({
        type: item.type,
        productId: item.productId || item.miniDrawId || "",
        miniDrawId: item.miniDrawId,
        quantity: item.quantity,
        price: item.price || 0,
        product: item.product || {
          _id: item.miniDraw?._id || "",
          name: item.miniDraw?.name || "",
          price: item.miniDraw?.ticketPrice || 0,
          images: item.miniDraw?.prize?.images || [],
          brand: "Mini Draw",
          stock: (item.miniDraw?.totalTickets || 0) - (item.miniDraw?.soldTickets || 0),
        },
        miniDraw: item.miniDraw,
      }));

      const tax = response.subtotal * 0.1;
      const shipping = response.subtotal >= 100 ? 0 : 10;
      const totalAmount = response.subtotal + tax + shipping;

      return {
        items: transformedItems,
        summary: {
          totalItems: response.itemCount,
          totalAmount,
          subtotal: response.subtotal,
          tax,
          shipping,
          discount: 0,
          membershipDiscount: 0,
          partnerDiscount: 0,
        },
        lastUpdated: new Date().toISOString(),
      };
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });
};

export const useCartItems = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.cart.items(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: CartItem[] }>("/api/cart/items");
      return response.data;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });
};

export const useCartSummary = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.cart.summary(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: CartSummary }>("/api/cart/summary");
      return response.data;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });
};

// Mutations
export const useAddToCart = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, quantity, price }: AddToCartData) => {
      const response = await apiPost<CartResponse>("/api/cart/add", {
        productId,
        quantity,
        price,
      });
      return response;
    },
    onMutate: async ({ productId, quantity, price }) => {
      if (!userId) return;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.cart.all(userId) });

      // Snapshot previous values
      const previousCart = queryClient.getQueryData(queryKeys.cart.all(userId));

      // Fetch product data for optimistic update
      let productData;
      try {
        const productResponse = await apiGet<{
          _id: string;
          name: string;
          price: number;
          images: string[];
          brand: string;
          stock: number;
        }>(`/api/products/${productId}`);
        productData = productResponse;
      } catch (error) {
        console.warn("Failed to fetch product data for optimistic update:", error);
        // Fallback to basic product data
        productData = {
          _id: productId,
          name: "Product",
          price: price,
          images: [],
          brand: "Unknown",
          stock: 0,
        };
      }

      // Optimistically update cart.all
      queryClient.setQueryData(queryKeys.cart.all(userId), (old: CartResponse | undefined) => {
        if (!old) {
          return {
            items: [
              {
                type: "product" as const,
                productId,
                quantity,
                price,
                product: productData,
              },
            ],
            summary: {
              totalItems: quantity,
              totalAmount: price * quantity,
              subtotal: price * quantity,
              gstIncluded: 0,
              shipping: 0,
              discount: 0,
            },
            lastUpdated: new Date().toISOString(),
          };
        }

        const existingItemIndex = old.items.findIndex((item) => item.productId === productId);
        let updatedItems: CartItem[];

        if (existingItemIndex >= 0) {
          // Update existing item
          updatedItems = old.items.map((item, index) =>
            index === existingItemIndex ? { ...item, quantity: item.quantity + quantity } : item
          );
        } else {
          // Add new item with full product data
          updatedItems = [
            ...old.items,
            {
              type: "product" as const,
              productId,
              quantity,
              price,
              product: productData,
            },
          ];
        }

        const totalItems = updatedItems.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = updatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const shipping = subtotal === 0 ? 0 : subtotal >= 100 ? 0 : 10;
        const totalAmount = subtotal + shipping;
        const gstIncluded = totalAmount === 0 ? 0 : Math.round((totalAmount / 11) * 100) / 100;

        return {
          ...old,
          items: updatedItems,
          summary: {
            ...old.summary,
            totalItems,
            totalAmount,
            subtotal,
            gstIncluded,
            shipping,
          },
          lastUpdated: new Date().toISOString(),
        };
      });

      return { previousCart };
    },
    onSuccess: async (data) => {
      if (!userId) return;

      // Update with server response for accuracy
      queryClient.setQueryData(queryKeys.cart.all(userId), data);
    },
    onError: async (err, variables, context) => {
      if (!userId) return;

      // Rollback on error
      if (context?.previousCart) {
        queryClient.setQueryData(queryKeys.cart.all(userId), context.previousCart);
      }
    },
    onSettled: async () => {
      if (!userId) return;

      // Always invalidate all cart-related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all(userId) });
    },
  });
};

export const useUpdateCartItem = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, quantity }: UpdateCartItemData) => {
      const response = await apiPut<CartResponse>("/api/cart/update", {
        productId,
        quantity,
      });
      return response;
    },
    onMutate: async ({ productId, quantity }) => {
      if (!userId) return;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.cart.all(userId) });

      // Snapshot previous values
      const previousCart = queryClient.getQueryData(queryKeys.cart.all(userId));

      // Optimistically update
      queryClient.setQueryData(queryKeys.cart.all(userId), (old: CartResponse | undefined) => {
        if (!old) return old;

        const updatedItems = old.items
          .map((item) => (item.productId === productId ? { ...item, quantity } : item))
          .filter((item) => item.quantity > 0); // Remove items with 0 quantity

        const totalItems = updatedItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalAmount = updatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        return {
          ...old,
          items: updatedItems,
          summary: {
            ...old.summary,
            totalItems,
            totalAmount,
            subtotal: totalAmount,
          },
          lastUpdated: new Date().toISOString(),
        };
      });

      return { previousCart };
    },
    onError: async (err, variables, context) => {
      if (!userId) return;

      // Rollback on error
      if (context?.previousCart) {
        queryClient.setQueryData(queryKeys.cart.all(userId), context.previousCart);
      }
    },
    onSuccess: async (data) => {
      if (!userId) return;

      // Update cache with real data
      queryClient.setQueryData(queryKeys.cart.all(userId), data);
    },
    onSettled: async () => {
      if (!userId) return;

      // Invalidate all cart-related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all(userId) });
    },
  });
};

export const useRemoveFromCart = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      const response = await apiDelete<CartResponse>(`/api/cart/remove/${productId}`);
      return response;
    },
    onMutate: async (productId) => {
      if (!userId) return;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.cart.all(userId) });

      // Snapshot previous value
      const previousCart = queryClient.getQueryData(queryKeys.cart.all(userId));

      // Optimistically update
      queryClient.setQueryData(queryKeys.cart.all(userId), (old: CartResponse | undefined) => {
        if (!old) return old;

        const updatedItems = old.items.filter((item) => item.productId !== productId);
        const totalItems = updatedItems.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = updatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const shipping = subtotal === 0 ? 0 : subtotal >= 100 ? 0 : 10;
        const totalAmount = subtotal + shipping;
        const gstIncluded = totalAmount === 0 ? 0 : Math.round((totalAmount / 11) * 100) / 100;

        return {
          ...old,
          items: updatedItems,
          summary: {
            ...old.summary,
            totalItems,
            totalAmount,
            subtotal,
            gstIncluded,
            shipping,
          },
          lastUpdated: new Date().toISOString(),
        };
      });

      return { previousCart };
    },
    onError: async (err, variables, context) => {
      if (!userId) return;

      // Rollback on error
      if (context?.previousCart) {
        queryClient.setQueryData(queryKeys.cart.all(userId), context.previousCart);
      }
    },
    onSuccess: async (data) => {
      if (!userId) return;

      // Update cache with real data
      queryClient.setQueryData(queryKeys.cart.all(userId), data);
    },
    onSettled: async () => {
      if (!userId) return;

      // Invalidate all cart-related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all(userId) });
    },
  });
};

export const useClearCart = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiDelete<CartResponse>("/api/cart");
      return response;
    },
    onSuccess: async (data) => {
      if (!userId) return;

      // Update cache with real data
      queryClient.setQueryData(queryKeys.cart.all(userId), data);
    },
    onSettled: async () => {
      if (!userId) return;

      // Invalidate all cart-related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all(userId) });
    },
  });
};

// Prefetch hook for cart data
export const useCartPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchCart = async (userId: string) => {
    try {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.cart.all(userId),
        queryFn: async () => {
          const response = await apiGet<{
            cart: Array<{
              type: "product" | "ticket";
              productId?: string;
              miniDrawId?: string;
              quantity: number;
              price?: number;
              product?: {
                _id: string;
                name: string;
                price: number;
                images: string[];
                brand: string;
                stock: number;
              };
              miniDraw?: {
                _id: string;
                name: string;
                ticketPrice: number;
                totalTickets: number;
                soldTickets: number;
                prize: {
                  name: string;
                  value: number;
                  images: string[];
                };
              };
            }>;
            subtotal: number;
            itemCount: number;
            summary: { productItems: number; ticketItems: number };
          }>("/api/cart");

          // Transform to match expected format
          const transformedItems = response.cart.map((item) => ({
            type: item.type,
            productId: item.productId || item.miniDrawId || "",
            miniDrawId: item.miniDrawId,
            quantity: item.quantity,
            price: item.price || 0,
            product: item.product || {
              _id: item.miniDraw?._id || "",
              name: item.miniDraw?.name || "",
              price: item.miniDraw?.ticketPrice || 0,
              images: item.miniDraw?.prize?.images || [],
              brand: "Mini Draw",
              stock: (item.miniDraw?.totalTickets || 0) - (item.miniDraw?.soldTickets || 0),
            },
            miniDraw: item.miniDraw,
          }));

          const tax = response.subtotal * 0.1;
          const shipping = response.subtotal >= 100 ? 0 : 10;
          const totalAmount = response.subtotal + tax + shipping;

          return {
            items: transformedItems,
            summary: {
              totalItems: response.itemCount,
              totalAmount,
              subtotal: response.subtotal,
              tax,
              shipping,
              discount: 0,
              membershipDiscount: 0,
              partnerDiscount: 0,
            },
            lastUpdated: new Date().toISOString(),
          };
        },
        staleTime: 30 * 1000, // 30 seconds
        gcTime: 2 * 60 * 1000, // 2 minutes
      });
    } catch (error) {
      console.error("Error prefetching cart data:", error);
    }
  };

  return { prefetchCart };
};
