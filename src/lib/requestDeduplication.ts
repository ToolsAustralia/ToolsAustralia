/**
 * Request Deduplication Utilities
 *
 * This file provides utilities to prevent duplicate API requests and improve caching efficiency.
 */

import { QueryClient } from "@tanstack/react-query";

// Track ongoing requests to prevent duplicates
const ongoingRequests = new Map<string, Promise<unknown>>();

/**
 * Deduplicate requests by caching ongoing promises
 */
export function deduplicateRequest<T>(requestKey: string, requestFn: () => Promise<T>): Promise<T> {
  // If request is already ongoing, return the existing promise
  if (ongoingRequests.has(requestKey)) {
    return ongoingRequests.get(requestKey) as Promise<T>;
  }

  // Create new request and cache it
  const requestPromise = requestFn().finally(() => {
    // Clean up when request completes
    ongoingRequests.delete(requestKey);
  });

  ongoingRequests.set(requestKey, requestPromise);
  return requestPromise;
}

/**
 * Enhanced query client with better deduplication
 */
export function createDeduplicatedQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Enhanced deduplication settings
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
        refetchOnWindowFocus: false, // Prevent refetch on focus
        refetchOnMount: false, // Don't refetch if data is fresh
        refetchOnReconnect: true, // Only refetch on reconnect
        retry: 1, // Reduced retries
        retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 5000),

        // Custom query function with deduplication
        queryFn: async ({ queryKey }) => {
          const requestKey = JSON.stringify(queryKey);

          return deduplicateRequest(requestKey, async () => {
            // This would be replaced by the actual query function
            // The deduplication happens at the query level
            throw new Error("This should be overridden by individual queries");
          });
        },
      },
      mutations: {
        retry: 0, // Don't retry mutations by default
      },
    },
  });
}

/**
 * Create a deduplicated API request function
 */
export function createDeduplicatedApiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const requestKey = `${options.method || "GET"}:${endpoint}:${JSON.stringify(options.body || {})}`;

  return deduplicateRequest(requestKey, async () => {
    const response = await fetch(endpoint, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  });
}

/**
 * Clear all ongoing requests (useful for cleanup)
 */
export function clearOngoingRequests(): void {
  ongoingRequests.clear();
}

/**
 * Get the number of ongoing requests (useful for debugging)
 */
export function getOngoingRequestCount(): number {
  return ongoingRequests.size;
}

/**
 * Enhanced query options for payment methods with better caching
 */
export const paymentMethodQueryOptions = {
  staleTime: 15 * 60 * 1000, // 15 minutes - payment methods don't change often
  gcTime: 60 * 60 * 1000, // 1 hour - keep in cache longer
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: true,
  retry: 1,
  retryDelay: 2000, // 2 second delay
};

/**
 * Enhanced query options for user data with better caching
 */
export const userDataQueryOptions = {
  staleTime: 10 * 60 * 1000, // 10 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: true,
  retry: 1,
};

/**
 * Enhanced query options for product data with better caching
 */
export const productQueryOptions = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 15 * 60 * 1000, // 15 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: true,
  retry: 1,
};
