/**
 * Base Query Functions for React Query
 *
 * This file contains utility functions for making API requests
 * with consistent error handling and authentication.
 */

import { getSession } from "next-auth/react";
// JWT signing is server-side only - removed client-side import

// Base API URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Custom error class for API errors
export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

// Generic fetch wrapper with error handling
export async function apiRequest<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    // Get session for authentication
    const session = await getSession();

    // Prepare headers
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    // Add authorization header if session exists
    if (session?.user?.id) {
      // Use user ID directly for client-side authentication
      // JWT signing is server-side only
      (headers as Record<string, string>).Authorization = `Bearer ${session.user.id}`;
    }

    // Make the request
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Parse response
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error("Failed to parse API response as JSON:", {
        endpoint: `${API_BASE_URL}${endpoint}`,
        status: response.status,
        statusText: response.statusText,
        parseError: parseError instanceof Error ? parseError.message : parseError,
      });
      throw new ApiError("Invalid JSON response from server", response.status);
    }

    // Handle non-2xx responses
    if (!response.ok) {
      // Handle different error formats
      let errorMessage = "An error occurred";
      if (typeof data.error === "string") {
        errorMessage = data.error;
      } else if (typeof data.error === "object" && data.error?.message) {
        errorMessage = data.error.message;
      } else if (data.message) {
        errorMessage = data.message;
      } else if (data.details && Array.isArray(data.details)) {
        // Handle Zod validation errors
        errorMessage = `Validation failed: ${data.details
          .map((d: { message?: string; path?: string[] }) => d.message || d.path?.join("."))
          .join(", ")}`;
      }

      throw new ApiError(errorMessage, response.status, data);
    }

    return data;
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new ApiError("Network error - please check your connection", 0);
    }

    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }

    // Handle other errors
    throw new ApiError(error instanceof Error ? error.message : "An unknown error occurred", 0);
  }
}

// GET request helper
export async function apiGet<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: "GET" });
}

// POST request helper
export async function apiPost<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

// PUT request helper
export async function apiPut<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
}

// DELETE request helper
export async function apiDelete<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: "DELETE" });
}

// PATCH request helper
export async function apiPatch<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
}

// Retry configuration for React Query
export const retryConfig = {
  retry: (failureCount: number, error: unknown) => {
    // Don't retry on 4xx errors (client errors)
    if (error && typeof error === "object" && "status" in error) {
      const status = (error as { status: number }).status;
      if (status >= 400 && status < 500) {
        return false;
      }
    }

    // Retry up to 2 times for other errors (reduced to prevent flooding)
    return failureCount < 2;
  },
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000), // Reduced max delay
};

// Default query options
export const defaultQueryOptions = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  ...retryConfig,
};

// Default mutation options
export const defaultMutationOptions = {
  retry: 1,
  retryDelay: 1000,
};
