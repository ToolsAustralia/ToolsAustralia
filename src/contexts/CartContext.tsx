"use client";

import React, { createContext, useContext, ReactNode, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { CartSummary } from "@/hooks/queries/useCartQueries";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { priceCart, dollarsToCents, toDollarSummary } from "@/utils/shop/pricing";

// Define CartItem type locally to match our needs
interface CartItem {
  type: "product" | "ticket";
  productId?: string;
  miniDrawId?: string;
  /**
   * Chosen variant. Part of a product line's identity: two sizes of the same
   * product are two lines. Undefined on tickets and on legacy lines.
   */
  sku?: string;
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
    sku?: string;
    quantity: number;
    price: number;
    product?: CartItem["product"];
    miniDraw?: CartItem["miniDraw"];
  }) => Promise<void>;
  updateCartItem: (item: {
    productId?: string;
    miniDrawId?: string;
    sku?: string;
    quantity: number;
  }) => Promise<void>;
  removeFromCart: (itemId: string, itemType?: "product" | "ticket", sku?: string) => Promise<void>;
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
/**
 * Optimistic client-side totals.
 *
 * Delegates to `priceCart` so the drawer can never quote a different figure from
 * /api/cart/summary or the PaymentIntent — the flat-shipping rule used to live
 * here AND in two other files, and the GST here was additive on an already
 * GST-inclusive price.
 *
 * `tax` keeps its name for the existing consumers but now carries the GST
 * *component already inside* `totalAmount`. It must never be added to anything.
 * The member tier discount is resolved server-side, so this optimistic figure
 * shows the undiscounted price until the server responds.
 */
const calculateSummary = (items: CartItem[]): CartSummary => {
  const totals = priceCart(
    items.map((i) => ({ priceCents: dollarsToCents(i.price), quantity: i.quantity }))
  );

  return {
    ...toDollarSummary(totals),
    membershipDiscount: 0,
    partnerDiscount: 0,
  };
};

// Generate unique operation ID
const generateOperationId = () => `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// How long a cart action waits before the queue is drained to the server.
const SYNC_DEBOUNCE_MS = 1000;

export function CartProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { trackRemoveFromCart } = usePixelTracking();
  const { trackRemoveFromCart: trackKlaviyoRemoveFromCart } = useKlaviyoTracking();

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

  // The debounced drain fires long after the render that scheduled it, so it must read the
  // queue through a ref — a captured copy would replay operations that were already sent.
  const pendingOperationsRef = useRef<PendingOperation[]>(cartState.pendingOperations);
  useEffect(() => {
    pendingOperationsRef.current = cartState.pendingOperations;
  }, [cartState.pendingOperations]);

  // One shared timer, so a second cart action cancels the first action's scheduled drain
  // instead of letting both fire.
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  const fetchServerCartItems = useCallback(async (): Promise<CartItem[]> => {
    const response = await fetch("/api/cart");
    if (!response.ok) throw new Error("Failed to load cart");
    const data: { cart?: CartItem[] } = await response.json();
    return data.cart ?? [];
  }, []);

  // Load initial cart data from server
  const loadCartFromServer = useCallback(async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      setError(null);

      const items = await fetchServerCartItems();

      setCartState((prev) => ({
        ...prev,
        items,
        summary: calculateSummary(items),
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
  }, [userId, fetchServerCartItems]);

  // Process pending operations
  const processPendingOperations = useCallback(async () => {
    // A drain already in flight owns the queue. Starting a second one would re-send the same
    // operations, and POST /api/cart is additive (quantity += n), so the server total doubles.
    if (!userId || isSyncingRef.current) return;

    const operations = pendingOperationsRef.current;
    if (operations.length === 0) return;

    isSyncingRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

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
                },
                body: JSON.stringify(operation.data),
              });
              break;

            case "update":
              response = await fetch("/api/cart/update", {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(operation.data),
              });
              break;

            case "remove":
              response = await fetch("/api/cart", {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(operation.data),
              });
              break;

            case "clear":
              // Whole-cart clear has its own route; DELETE /api/cart removes a
              // single item and requires a JSON body, so it cannot clear.
              response = await fetch("/api/cart/clear", {
                method: "DELETE",
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

      // The server is the only thing that knows what actually landed — a rejected add, a
      // half-applied batch, a quantity it clamped — so reconcile from it instead of
      // reconstructing the cart client-side. This is also what reverts the optimistic item
      // behind a failed add, which the old client-side rollback never managed to do.
      let serverItems: CartItem[] | null = null;
      try {
        serverItems = await fetchServerCartItems();
      } catch (error) {
        console.error("Failed to reconcile cart after sync:", error);
      }

      // Update state based on results
      setCartState((prev) => {
        // Both successful and failed ops must be cleared from pendingOperations,
        // otherwise the auto-sync useEffect re-fires forever and isLoading flickers
        // true on every retry, which keeps every "Add to cart" button stuck on "Adding..."
        const settledIds = new Set([...successfulOperations, ...failedOperations.map((op) => op.id)]);
        const remainingOperations = prev.pendingOperations.filter((op) => !settledIds.has(op.id));

        // Only adopt the server snapshot once the queue is empty: an action taken while this
        // drain was in flight exists only in the optimistic list and would flicker away.
        const updatedItems = serverItems && remainingOperations.length === 0 ? serverItems : prev.items;

        return {
          ...prev,
          items: updatedItems,
          summary: calculateSummary(updatedItems),
          isDirty: remainingOperations.length > 0 || failedOperations.length > 0,
          lastSyncTime: Date.now(),
          pendingOperations: remainingOperations,
          failedOperations: [...prev.failedOperations, ...failedOperations],
        };
      });
    } catch (error) {
      console.error("Failed to process pending operations:", error);
      setError(error instanceof Error ? error.message : "Failed to sync operations");
    } finally {
      isSyncingRef.current = false;
      setIsLoading(false);
    }
  }, [userId, fetchServerCartItems]);

  // Load initial cart data
  useEffect(() => {
    if (userId) {
      loadCartFromServer();
    }
  }, [userId, loadCartFromServer]);

  // Auto-sync when cart becomes dirty. The timer lives in a ref and is cleared before every
  // reschedule — the previous per-call timer was never cancelled, so a second action within
  // the debounce window let the first timer fire too and re-send its operation.
  useEffect(() => {
    if (!userId || !cartState.isDirty || cartState.pendingOperations.length === 0) return;

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void processPendingOperations();
    }, SYNC_DEBOUNCE_MS);
  }, [cartState.isDirty, cartState.pendingOperations.length, userId, processPendingOperations]);

  // Cancel a scheduled drain on unmount so it cannot fire against a torn-down provider.
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  // Optimistic cart actions
  const addToCart = useCallback(
    async (item: {
      productId?: string;
      miniDrawId?: string;
      sku?: string;
      quantity: number;
      price: number;
      product?: CartItem["product"];
      miniDraw?: CartItem["miniDraw"];
    }) => {
      const operationId = generateOperationId();
      const timestamp = Date.now();

      // Determine if this is a product or ticket
      const isTicket = !!item.miniDrawId;

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
            sku: item.sku,
            quantity: item.quantity,
          };

      // Update UI immediately (optimistic update). The new list is derived from `prev` inside
      // the updater rather than from this render's snapshot — two actions in quick succession
      // would otherwise both build on the same stale list, and the later one would erase the
      // earlier one's item.
      setCartState((prev) => {
        // Product lines are keyed on (productId, sku) so two sizes stay separate.
        // Mirrors findCartItem in /api/cart — keep the two in step.
        const existingItemIndex = prev.items.findIndex((cartItem) =>
          isTicket
            ? cartItem.miniDrawId === item.miniDrawId
            : cartItem.productId === item.productId &&
              (cartItem.sku ?? undefined) === (item.sku ?? undefined)
        );

        const optimisticItems: CartItem[] =
          existingItemIndex >= 0
            ? // Update existing item - preserve data
              prev.items.map((cartItem, index) =>
                index === existingItemIndex
                  ? {
                      ...cartItem,
                      quantity: cartItem.quantity + item.quantity,
                      // Preserve existing data or use new data
                      product: cartItem.product || item.product,
                      miniDraw: cartItem.miniDraw || item.miniDraw,
                    }
                  : cartItem
              )
            : // Add new item with full data
              [
                ...prev.items,
                {
                  type: isTicket ? ("ticket" as const) : ("product" as const),
                  productId: isTicket ? undefined : item.productId,
                  miniDrawId: isTicket ? item.miniDrawId : undefined,
                  sku: isTicket ? undefined : item.sku,
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

        return {
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
            },
          ],
        };
      });
    },
    []
  );

  const updateCartItem = useCallback(
    async (item: { productId?: string; miniDrawId?: string; sku?: string; quantity: number }) => {
      const operationId = generateOperationId();
      const timestamp = Date.now();

      // Determine if this is a product or ticket
      const isTicket = !!item.miniDrawId;

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
            sku: item.sku,
            quantity: item.quantity,
          };

      // Update UI immediately (optimistic update), derived from `prev` so a quantity change
      // does not resurrect items an earlier un-rendered action already removed.
      setCartState((prev) => {
        const optimisticItems = prev.items
          .map((cartItem) => {
            const matches = isTicket
              ? cartItem.miniDrawId === item.miniDrawId
              : cartItem.productId === item.productId &&
                (cartItem.sku ?? undefined) === (item.sku ?? undefined);

            return matches ? { ...cartItem, quantity: item.quantity } : cartItem;
          })
          .filter((cartItem) => cartItem.quantity > 0);

        return {
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
            },
          ],
        };
      });
    },
    []
  );

  const removeFromCart = useCallback(
    async (itemId: string, itemType?: "product" | "ticket", sku?: string) => {
      const operationId = generateOperationId();
      const timestamp = Date.now();

      // Determine item type if not provided
      const type = itemType || (cartState.items.find((item) => item.productId === itemId) ? "product" : "ticket");

      // A product line is (productId, sku), so removing the Large must not also
      // remove the Medium. Matching is exact on both sides.
      const matchesLine = (cartItem: CartItem) =>
        type === "product"
          ? cartItem.productId === itemId && (cartItem.sku ?? undefined) === (sku ?? undefined)
          : cartItem.miniDrawId === itemId;

      // Find the item being removed for tracking
      const itemToRemove = cartState.items.find(matchesLine);

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
            product_id: type === "product" ? itemId : undefined,
            product_name: type === "product" ? itemToRemove.product?.name : itemToRemove.miniDraw?.name,
            num_items: itemToRemove.quantity,
          });
        } catch (error) {
          console.error("Error tracking RemoveFromCart:", error);
          // Don't throw - tracking should not break cart functionality
        }
      }

      // Prepare data for API call
      const apiData =
        type === "product"
          ? { type: "product" as const, productId: itemId, sku }
          : { type: "ticket" as const, miniDrawId: itemId };

      // Update UI immediately (optimistic update), filtering `prev` so a removal cannot
      // reinstate items that another action removed in the same debounce window.
      setCartState((prev) => {
        const optimisticItems = prev.items.filter((cartItem) => !matchesLine(cartItem));

        return {
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
            },
          ],
        };
      });
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
        },
      ],
    }));
  }, []);

  // Retry failed operations
  const retryFailedOperation = useCallback(
    async (operationId: string) => {
      const failedOp = cartState.failedOperations.find((op) => op.id === operationId);
      if (!failedOp || failedOp.retryCount >= failedOp.maxRetries) return;

      // Move from failed to pending. isDirty must be set explicitly — the auto-sync effect
      // gates on it, so a requeued operation would otherwise sit unsent.
      setCartState((prev) => ({
        ...prev,
        isDirty: true,
        failedOperations: prev.failedOperations.filter((op) => op.id !== operationId),
        pendingOperations: [
          ...prev.pendingOperations,
          {
            id: operationId,
            type: failedOp.type,
            timestamp: Date.now(),
            data: failedOp.data,
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
      isDirty: true,
      failedOperations: prev.failedOperations.filter((op) => op.retryCount >= op.maxRetries),
      pendingOperations: [
        ...prev.pendingOperations,
        ...retryableOps.map((op) => ({
          id: op.id,
          type: op.type,
          timestamp: Date.now(),
          data: op.data,
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

  // Memoized: a fresh object per provider render re-rendered every cart consumer.
  // Every constituent is either useState-held or useCallback-wrapped above.
  const contextValue = useMemo<CartContextType>(
    () => ({
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
    }),
    [
      cartState,
      addToCart,
      updateCartItem,
      removeFromCart,
      clearCart,
      retryFailedOperation,
      retryAllFailedOperations,
      isLoading,
      error,
      isAddingToCart,
      isUpdatingCart,
      isRemovingFromCart,
    ]
  );

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
