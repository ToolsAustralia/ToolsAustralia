"use client";

import React, { createContext, useContext, ReactNode, useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { CartSummary } from "@/hooks/queries/useCartQueries";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";

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

// localStorage persistence for guest carts (24h TTL, schema-versioned).
// Logged-in users persist via /api/cart/*; guests stay client-side until login,
// then `mergeGuestCartIntoServer` reconciles.
const LS_KEY = "shop_cart_v1";
const LS_TTL_MS = 24 * 60 * 60 * 1000;

interface LocalCartShape {
  v: 1;
  savedAt: number;
  items: CartItem[];
}

export function loadLocalCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalCartShape;
    if (parsed.v !== 1) return [];
    if (Date.now() - parsed.savedAt > LS_TTL_MS) {
      window.localStorage.removeItem(LS_KEY);
      return [];
    }
    return parsed.items ?? [];
  } catch {
    return [];
  }
}

function saveLocalCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    const data: LocalCartShape = { v: 1, savedAt: Date.now(), items };
    window.localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* quota exceeded etc — ignore */
  }
}

export function clearLocalCart() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_KEY);
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
// AU GST-inclusive pricing: prices already include GST. `gstIncluded` is the
// 1/11 portion of the total — for display only, never added to the total.
const calculateSummary = (items: CartItem[]): CartSummary => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal === 0 ? 0 : subtotal >= 100 ? 0 : 10;
  const totalAmount = subtotal + shipping;
  const gstIncluded = totalAmount === 0 ? 0 : Math.round((totalAmount / 11) * 100) / 100;

  return {
    totalItems,
    totalAmount,
    subtotal,
    shipping,
    gstIncluded,
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
  const { trackRemoveFromCart, trackAddToCart: pixelTrackAddToCart } = usePixelTracking();
  const {
    trackRemoveFromCart: trackKlaviyoRemoveFromCart,
    trackAddToCart: klaviyoTrackAddToCart,
  } = useKlaviyoTracking();

  // Enhanced cart state
  const [cartState, setCartState] = useState<OptimisticCartState>({
    items: [],
    summary: {
      totalItems: 0,
      totalAmount: 0,
      subtotal: 0,
      gstIncluded: 0,
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
        credentials: "include",
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
  }, [userId]);

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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(operation.data),
                credentials: "include",
              });
              break;

            case "update":
              response = await fetch("/api/cart/update", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(operation.data),
                credentials: "include",
              });
              break;

            case "remove":
              response = await fetch("/api/cart", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(operation.data),
                credentials: "include",
              });
              break;

            case "clear":
              response = await fetch("/api/cart/clear", {
                method: "DELETE",
                credentials: "include",
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

        // Both successful and failed ops must be cleared from pendingOperations,
        // otherwise the auto-sync useEffect re-fires forever and isLoading flickers
        // true on every retry, which keeps every "Add to cart" button stuck on "Adding..."
        const successfulIds = new Set(successfulOperations);
        const failedIds = new Set(failedOperations.map((op) => op.id));

        return {
          ...prev,
          items: updatedItems,
          summary: calculateSummary(updatedItems),
          isDirty: failedOperations.length > 0,
          lastSyncTime: Date.now(),
          pendingOperations: prev.pendingOperations.filter(
            (op) => !successfulIds.has(op.id) && !failedIds.has(op.id)
          ),
          failedOperations: [...prev.failedOperations, ...failedOperations],
        };
      });
    } catch (error) {
      console.error("Failed to process pending operations:", error);
      setError(error instanceof Error ? error.message : "Failed to sync operations");
    } finally {
      setIsLoading(false);
    }
  }, [cartState.pendingOperations, userId]);

  // Debounced sync function
  const debouncedSync = useCallback(() => {
    const syncFn = async () => {
      await processPendingOperations();
    };
    return createDebouncedSync(syncFn, 1000)();
  }, [processPendingOperations]);

  // Merge guest localStorage cart into server cart on login.
  // Server wins per-item conflict; guest-only items get POST'd.
  const mergeGuestCartIntoServer = useCallback(async () => {
    const local = loadLocalCart();
    if (local.length === 0) {
      await loadCartFromServer();
      return;
    }

    // Read current server cart
    const serverRes = await fetch("/api/cart", { credentials: "include" });
    const serverData = serverRes.ok ? await serverRes.json() : { cart: [] };
    const serverItems: CartItem[] = (serverData.cart ?? []) as CartItem[];

    // Server wins on conflict — only post items the server doesn't already have
    const serverIds = new Set(
      serverItems.map((i) => (i.type === "product" ? i.productId : i.miniDrawId)),
    );
    const toAdd = local.filter(
      (i) => !serverIds.has(i.type === "product" ? i.productId : i.miniDrawId),
    );

    for (const item of toAdd) {
      const apiData =
        item.type === "ticket"
          ? { type: "ticket" as const, miniDrawId: item.miniDrawId, quantity: item.quantity }
          : { type: "product" as const, productId: item.productId, quantity: item.quantity };
      await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
        credentials: "include",
      }).catch((err) => {
        console.error("[cart] merge POST failed", err);
      });
    }
    clearLocalCart();
    await loadCartFromServer();
  }, [loadCartFromServer]);

  // Track previous userId so the merge fires only on guest → logged-in transition.
  const prevUserIdRef = useRef<string | undefined>(undefined);

  // Load initial cart data — server for logged-in users, localStorage for guests.
  // Trigger merge once when userId transitions from undefined → defined.
  useEffect(() => {
    const wasGuest = prevUserIdRef.current === undefined;
    prevUserIdRef.current = userId;

    if (userId && wasGuest) {
      void mergeGuestCartIntoServer();
    } else if (userId) {
      loadCartFromServer();
    } else {
      const local = loadLocalCart();
      if (local.length > 0) {
        setCartState((prev) => ({
          ...prev,
          items: local,
          summary: calculateSummary(local),
        }));
      }
    }
  }, [userId, loadCartFromServer, mergeGuestCartIntoServer]);

  // Persist guest cart on every mutation. No-op for logged-in users — those
  // sync via /api/cart/* through processPendingOperations.
  useEffect(() => {
    if (!userId) {
      saveLocalCart(cartState.items);
    }
  }, [userId, cartState.items]);

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

      // AddToCart tracking — shop products only (mini-draw tickets have their own funnel)
      if (!isTicket && item.productId) {
        try {
          pixelTrackAddToCart({
            value: item.price * item.quantity,
            currency: "AUD",
            productId: item.productId,
            contentName: item.product?.name,
            numItems: item.quantity,
          });
          klaviyoTrackAddToCart({
            value: item.price * item.quantity,
            currency: "AUD",
            productId: item.productId,
            productName: item.product?.name,
            numItems: item.quantity,
          });
        } catch (error) {
          console.error("Error tracking AddToCart:", error);
          // tracking failures must not break cart functionality
        }
      }
    },
    [cartState.items, pixelTrackAddToCart, klaviyoTrackAddToCart]
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

          // Track Klaviyo remove from cart event
          trackKlaviyoRemoveFromCart({
            value: itemToRemove.price * itemToRemove.quantity,
            currency: "AUD",
            productId: type === "product" ? itemId : undefined,
            productName: type === "product" ? itemToRemove.product?.name : itemToRemove.miniDraw?.name,
            numItems: itemToRemove.quantity,
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
    [cartState.items, trackRemoveFromCart, trackKlaviyoRemoveFromCart]
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
