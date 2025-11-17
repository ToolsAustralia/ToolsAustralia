"use client";

import React, { createContext, useContext, ReactNode, useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { CartSummary } from "@/hooks/queries/useCartQueries";
import { usePixelTracking } from "@/hooks/usePixelTracking";

// Define CartItem type locally to match our needs
interface CartItem {
  type: "product" | "ticket";
  productId?: string;
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

// Enhanced cart state with optimistic updates
export interface OptimisticCartState {
  items: CartItem[];
  summary: CartSummary;
  isDirty: boolean;
  lastSyncTime: number;
  pendingOperations: PendingOperation[];
  failedOperations: FailedOperation[];
}

export interface PendingOperation {
  id: string;
  type: "add" | "update" | "remove" | "clear";
  timestamp: number;
  data: Record<string, unknown>;
  optimisticState: CartItem[];
}

export interface FailedOperation {
  id: string;
  type: "add" | "update" | "remove" | "clear";
  timestamp: number;
  data: Record<string, unknown>;
  error: string;
  retryCount: number;
  maxRetries: number;
}

export interface CartContextType extends OptimisticCartState {
  // Optimistic actions (immediate UI updates)
  addToCart: (item: {
    productId?: string;
    miniDrawId?: string;
    quantity: number;
    price: number;
    product?: CartItem["product"];
    miniDraw?: CartItem["miniDraw"];
  }) => Promise<void>;
  updateCartItem: (item: { productId?: string; miniDrawId?: string; quantity: number }) => Promise<void>;
  removeFromCart: (itemId: string, itemType?: "product" | "ticket") => Promise<void>;
  clearCart: () => Promise<void>;

  // Retry failed operations
  retryFailedOperation: (operationId: string) => Promise<void>;
  retryAllFailedOperations: () => Promise<void>;

  // Status
  isLoading: boolean;
  error: string | null;
  hasFailedOperations: boolean;

  // Product-specific loading states
  isAddingToCart: (productId: string) => boolean;
  isUpdatingCart: (productId: string) => boolean;
  isRemovingFromCart: (productId: string) => boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Helper functions for cart calculations
const calculateSummary = (items: CartItem[]): CartSummary => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.1;
  const shipping = subtotal >= 100 ? 0 : 10;
  const totalAmount = subtotal + tax + shipping;

  return {
    totalItems,
    totalAmount,
    subtotal,
    tax,
    shipping,
    discount: 0,
    membershipDiscount: 0,
    partnerDiscount: 0,
  };
};

// Generate unique operation ID
const generateOperationId = () => `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Debounced sync function
const createDebouncedSync = (syncFn: () => Promise<void>, delay: number = 1000) => {
  let timeoutId: NodeJS.Timeout;
  return () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(syncFn, delay);
  };
};

export function CartProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { trackRemoveFromCart } = usePixelTracking();

  // Enhanced cart state
  const [cartState, setCartState] = useState<OptimisticCartState>({
    items: [],
    summary: {
      totalItems: 0,
      totalAmount: 0,
      subtotal: 0,
      tax: 0,
      shipping: 0,
      discount: 0,
    },
    isDirty: false,
    lastSyncTime: 0,
    pendingOperations: [],
    failedOperations: [],
  });

  // Sync state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial cart data from server
  const loadCartFromServer = useCallback(async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/cart", {
        headers: {
          Authorization: `Bearer ${session?.user?.id}`,
        },
      });

      if (!response.ok) throw new Error("Failed to load cart");

      const data = await response.json();

      setCartState((prev) => ({
        ...prev,
        items: data.cart || [],
        summary: calculateSummary(data.cart || []),
        isDirty: false,
        lastSyncTime: Date.now(),
        pendingOperations: [], // Clear pending operations on successful load
        failedOperations: [], // Clear failed operations on successful load
      }));
    } catch (error) {
      console.error("Failed to load cart:", error);
      setError(error instanceof Error ? error.message : "Failed to load cart");
    } finally {
      setIsLoading(false);
    }
  }, [userId, session?.user?.id]);

  // Process pending operations
  const processPendingOperations = useCallback(async () => {
    if (cartState.pendingOperations.length === 0 || !userId) return;

    try {
      setIsLoading(true);
      setError(null);

      const operations = [...cartState.pendingOperations];
      const successfulOperations: string[] = [];
      const failedOperations: FailedOperation[] = [];

      // Process operations in sequence to maintain order
      for (const operation of operations) {
        try {
          let response: Response;

          switch (operation.type) {
            case "add":
              response = await fetch("/api/cart", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.user?.id}`,
                },
                body: JSON.stringify(operation.data),
              });
              break;

            case "update":
              response = await fetch("/api/cart/update", {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.user?.id}`,
                },
                body: JSON.stringify(operation.data),
              });
              break;

            case "remove":
              response = await fetch("/api/cart/remove", {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.user?.id}`,
                },
                body: JSON.stringify(operation.data),
              });
              break;

            case "clear":
              response = await fetch("/api/cart", {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${session?.user?.id}`,
                },
              });
              break;

            default:
              throw new Error(`Unknown operation type: ${operation.type}`);
          }

          if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
          }

          successfulOperations.push(operation.id);
        } catch (error) {
          failedOperations.push({
            id: operation.id,
            type: operation.type,
            timestamp: operation.timestamp,
            data: operation.data,
            error: error instanceof Error ? error.message : "Unknown error",
            retryCount: 0,
            maxRetries: 3,
          });
        }
      }

      // Update state based on results
      setCartState((prev) => {
        let updatedItems = prev.items;

        // If all operations failed, rollback to last known good state
        if (failedOperations.length === operations.length) {
          // Find the last successful operation's state
          const lastSuccessfulOperation = operations
            .filter((op) => successfulOperations.includes(op.id))
            .sort((a, b) => b.timestamp - a.timestamp)[0];

          if (lastSuccessfulOperation) {
            updatedItems = lastSuccessfulOperation.optimisticState;
          }
        }

        return {
          ...prev,
          items: updatedItems,
          summary: calculateSummary(updatedItems),
          isDirty: failedOperations.length > 0,
          lastSyncTime: Date.now(),
          pendingOperations: prev.pendingOperations.filter((op) => !successfulOperations.includes(op.id)),
          failedOperations: [...prev.failedOperations, ...failedOperations],
        };
      });
    } catch (error) {
      console.error("Failed to process pending operations:", error);
      setError(error instanceof Error ? error.message : "Failed to sync operations");
    } finally {
      setIsLoading(false);
    }
  }, [cartState.pendingOperations, userId, session?.user?.id]);

  // Debounced sync function
  const debouncedSync = useCallback(() => {
    const syncFn = async () => {
      await processPendingOperations();
    };
    return createDebouncedSync(syncFn, 1000)();
  }, [processPendingOperations]);

  // Load initial cart data
  useEffect(() => {
    if (userId) {
      loadCartFromServer();
    }
  }, [userId, loadCartFromServer]);

  // Auto-sync when cart becomes dirty
  useEffect(() => {
    if (cartState.isDirty && userId && cartState.pendingOperations.length > 0) {
      debouncedSync();
    }
  }, [cartState.isDirty, cartState.pendingOperations.length, userId, debouncedSync]);

  // Optimistic cart actions
  const addToCart = useCallback(
    async (item: {
      productId?: string;
      miniDrawId?: string;
      quantity: number;
      price: number;
      product?: CartItem["product"];
      miniDraw?: CartItem["miniDraw"];
    }) => {
      const operationId = generateOperationId();
      const timestamp = Date.now();

      // Determine if this is a product or ticket
      const isTicket = !!item.miniDrawId;

      // Create optimistic state
      const optimisticItems = (() => {
        const existingItemIndex = cartState.items.findIndex((cartItem) =>
          isTicket ? cartItem.miniDrawId === item.miniDrawId : cartItem.productId === item.productId
        );

        if (existingItemIndex >= 0) {
          // Update existing item - preserve data
          return cartState.items.map((cartItem, index) =>
            index === existingItemIndex
              ? {
                  ...cartItem,
                  quantity: cartItem.quantity + item.quantity,
                  // Preserve existing data or use new data
                  product: cartItem.product || item.product,
                  miniDraw: cartItem.miniDraw || item.miniDraw,
                }
              : cartItem
          );
        } else {
          // Add new item with full data
          return [
            ...cartState.items,
            {
              type: isTicket ? ("ticket" as const) : ("product" as const),
              productId: isTicket ? undefined : item.productId,
              miniDrawId: isTicket ? item.miniDrawId : undefined,
              quantity: item.quantity,
              price: item.price,
              product: isTicket
                ? undefined
                : item.product || {
                    _id: item.productId || "",
                    name: "Loading...",
                    price: item.price,
                    images: [],
                    brand: "Unknown",
                    stock: 0,
                  },
              miniDraw: isTicket
                ? item.miniDraw || {
                    _id: item.miniDrawId!,
                    name: "Loading...",
                    ticketPrice: item.price,
                    totalTickets: 0,
                    soldTickets: 0,
                    prize: {
                      name: "Loading...",
                      value: 0,
                      images: [],
                    },
                  }
                : undefined,
            },
          ];
        }
      })();

      // Prepare data for API call
      const apiData = isTicket
        ? {
            type: "ticket" as const,
            miniDrawId: item.miniDrawId,
            quantity: item.quantity,
          }
        : {
            type: "product" as const,
            productId: item.productId,
            quantity: item.quantity,
          };

      // Update UI immediately (optimistic update)
      setCartState((prev) => ({
        ...prev,
        items: optimisticItems,
        summary: calculateSummary(optimisticItems),
        isDirty: true,
        pendingOperations: [
          ...prev.pendingOperations,
          {
            id: operationId,
            type: "add",
            timestamp,
            data: apiData,
            optimisticState: optimisticItems,
          },
        ],
      }));
    },
    [cartState.items]
  );

  const updateCartItem = useCallback(
    async (item: { productId?: string; miniDrawId?: string; quantity: number }) => {
      const operationId = generateOperationId();
      const timestamp = Date.now();

      // Determine if this is a product or ticket
      const isTicket = !!item.miniDrawId;

      // Create optimistic state
      const optimisticItems = cartState.items
        .map((cartItem) => {
          const matches = isTicket ? cartItem.miniDrawId === item.miniDrawId : cartItem.productId === item.productId;

          return matches ? { ...cartItem, quantity: item.quantity } : cartItem;
        })
        .filter((cartItem) => cartItem.quantity > 0);

      // Prepare data for API call
      const apiData = isTicket
        ? {
            type: "ticket" as const,
            miniDrawId: item.miniDrawId,
            quantity: item.quantity,
          }
        : {
            type: "product" as const,
            productId: item.productId,
            quantity: item.quantity,
          };

      // Update UI immediately (optimistic update)
      setCartState((prev) => ({
        ...prev,
        items: optimisticItems,
        summary: calculateSummary(optimisticItems),
        isDirty: true,
        pendingOperations: [
          ...prev.pendingOperations,
          {
            id: operationId,
            type: "update",
            timestamp,
            data: apiData,
            optimisticState: optimisticItems,
          },
        ],
      }));
    },
    [cartState.items]
  );

  const removeFromCart = useCallback(
    async (itemId: string, itemType?: "product" | "ticket") => {
      const operationId = generateOperationId();
      const timestamp = Date.now();

      // Determine item type if not provided
      const type = itemType || (cartState.items.find((item) => item.productId === itemId) ? "product" : "ticket");

      // Find the item being removed for tracking
      const itemToRemove = cartState.items.find((cartItem) => {
        if (type === "product") {
          return cartItem.productId === itemId;
        } else {
          return cartItem.miniDrawId === itemId;
        }
      });

      // Create optimistic state
      const optimisticItems = cartState.items.filter((cartItem) => {
        if (type === "product") {
          return cartItem.productId !== itemId;
        } else {
          return cartItem.miniDrawId !== itemId;
        }
      });

      // Track RemoveFromCart event
      if (itemToRemove) {
        try {
          trackRemoveFromCart({
            value: itemToRemove.price * itemToRemove.quantity,
            currency: "AUD",
            productId: type === "product" ? itemId : undefined,
            contentName: type === "product" ? itemToRemove.product?.name : itemToRemove.miniDraw?.name,
          });
        } catch (error) {
          console.error("Error tracking RemoveFromCart:", error);
          // Don't throw - tracking should not break cart functionality
        }
      }

      // Prepare data for API call
      const apiData =
        type === "product"
          ? { type: "product" as const, productId: itemId }
          : { type: "ticket" as const, miniDrawId: itemId };

      // Update UI immediately (optimistic update)
      setCartState((prev) => ({
        ...prev,
        items: optimisticItems,
        summary: calculateSummary(optimisticItems),
        isDirty: true,
        pendingOperations: [
          ...prev.pendingOperations,
          {
            id: operationId,
            type: "remove",
            timestamp,
            data: apiData,
            optimisticState: optimisticItems,
          },
        ],
      }));
    },
    [cartState.items, trackRemoveFromCart]
  );

  const clearCart = useCallback(async () => {
    const operationId = generateOperationId();
    const timestamp = Date.now();

    // Create optimistic state
    const optimisticItems: CartItem[] = [];

    // Update UI immediately (optimistic update)
    setCartState((prev) => ({
      ...prev,
      items: optimisticItems,
      summary: calculateSummary(optimisticItems),
      isDirty: true,
      pendingOperations: [
        ...prev.pendingOperations,
        {
          id: operationId,
          type: "clear",
          timestamp,
          data: {},
          optimisticState: optimisticItems,
        },
      ],
    }));
  }, []);

  // Retry failed operations
  const retryFailedOperation = useCallback(
    async (operationId: string) => {
      const failedOp = cartState.failedOperations.find((op) => op.id === operationId);
      if (!failedOp || failedOp.retryCount >= failedOp.maxRetries) return;

      // Move from failed to pending
      setCartState((prev) => ({
        ...prev,
        failedOperations: prev.failedOperations.filter((op) => op.id !== operationId),
        pendingOperations: [
          ...prev.pendingOperations,
          {
            id: operationId,
            type: failedOp.type,
            timestamp: Date.now(),
            data: failedOp.data,
            optimisticState: prev.items,
          },
        ],
      }));
    },
    [cartState.failedOperations]
  );

  const retryAllFailedOperations = useCallback(async () => {
    const retryableOps = cartState.failedOperations.filter((op) => op.retryCount < op.maxRetries);

    setCartState((prev) => ({
      ...prev,
      failedOperations: prev.failedOperations.filter((op) => op.retryCount >= op.maxRetries),
      pendingOperations: [
        ...prev.pendingOperations,
        ...retryableOps.map((op) => ({
          id: op.id,
          type: op.type,
          timestamp: Date.now(),
          data: op.data,
          optimisticState: prev.items,
        })),
      ],
    }));
  }, [cartState.failedOperations]);

  // Product-specific loading state helpers
  const isAddingToCart = useCallback(
    (productId: string) => {
      return cartState.pendingOperations.some((op) => op.type === "add" && op.data.productId === productId);
    },
    [cartState.pendingOperations]
  );

  const isUpdatingCart = useCallback(
    (productId: string) => {
      return cartState.pendingOperations.some((op) => op.type === "update" && op.data.productId === productId);
    },
    [cartState.pendingOperations]
  );

  const isRemovingFromCart = useCallback(
    (productId: string) => {
      return cartState.pendingOperations.some((op) => op.type === "remove" && op.data.productId === productId);
    },
    [cartState.pendingOperations]
  );

  const contextValue: CartContextType = {
    ...cartState,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    retryFailedOperation,
    retryAllFailedOperations,
    isLoading,
    error,
    hasFailedOperations: cartState.failedOperations.length > 0,
    isAddingToCart,
    isUpdatingCart,
    isRemovingFromCart,
  };

  return <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>;
}

// Hook to use cart context
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
