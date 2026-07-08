/**

 * Base Query Functions for React Query

 *

 * This file contains utility functions for making API requests

 * with consistent error handling and authentication.

 *

 * IMPORTANT:

 * Centralised auth error handling lives here so we can react consistently

 * when sessions become invalid (e.g. user deleted or deactivated).

 */

import { getSession, signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { clearUserScopedClientStorage } from "@/utils/auth/total-sign-out";
import { ErrorContext } from "@/types/error-reporting";
import { collectErrorContext } from "@/utils/error-reporting/collect-error-context";

// JWT signing is server-side only - removed client-side import

// Base API URL

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

// In-memory session cache to reduce redundant /api/auth/session calls
let cachedSession: { session: Session | null; timestamp: number } | null = null;
const SESSION_CACHE_TTL = 30_000; // 30 seconds

async function getCachedSession() {
  const now = Date.now();
  if (cachedSession && now - cachedSession.timestamp < SESSION_CACHE_TTL) {
    return cachedSession.session;
  }
  const session = await getSession();
  cachedSession = { session, timestamp: now };
  return session;
}

export function invalidateSessionCache() {
  cachedSession = null;
}

// Custom error class for API errors

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
    public errorContext?: ErrorContext
  ) {
    super(message);

    this.name = "ApiError";
  }
}

// Generic fetch wrapper with error handling

export async function apiRequest<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    // Get session for authentication (cached to reduce network calls)

    const session = await getCachedSession();

    // Prepare headers.
    //
    // Authentication is carried by the NextAuth session cookie, which the
    // browser sends automatically on same-origin requests. We deliberately do
    // NOT attach an `Authorization: Bearer <user id>` header: the raw user id is
    // not a credential, and the routes that used to accept it (cart/orders/
    // mini-draws) now authorize via `getServerSession`.

    const headers: HeadersInit = {
      "Content-Type": "application/json",

      ...options.headers,
    };

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

      // Extract a machine-readable error code when available.

      const errorCode =
        data && typeof data === "object" && "code" in data ? (data as { code?: string }).code : undefined;

      // Detect authentication / authorization failures that should invalidate the session:

      // - 401 / 403 -> generic auth failures

      // - 404 + USER_NOT_FOUND -> dangling session where backing user record is gone

      const status = response.status;

      const shouldForceLogout = status === 401 || status === 403 || (status === 404 && errorCode === "USER_NOT_FOUND");

      if (shouldForceLogout) {
        try {
          // Clear user-scoped client storage (incl. chat history), then force sign
          // out so NextAuth clears the session cookie. void ensures we don't block
          // error propagation.
          clearUserScopedClientStorage();
          void signOut();
        } catch (signOutError) {
          // If signOut fails for any reason, log it but still surface the original error.

          console.error("Failed to trigger signOut on auth error:", signOutError);
        }
      }

      // Collect error context for reportable errors (client-side only)
      let errorContext: ErrorContext | undefined;
      if (typeof window !== "undefined") {
        try {
          errorContext = await collectErrorContext(
            new Error(errorMessage),
            {
              url: `${API_BASE_URL}${endpoint}`,
              method: options.method as string,
              status: response.status,
              userId: session?.user?.id ?? undefined,
              userEmail: session?.user?.email ?? undefined,
              isAuthenticated: !!session?.user,
            }
          );
        } catch (contextError) {
          // Silently fail if context collection fails
          console.warn("Failed to collect error context:", contextError);
        }
      }

      throw new ApiError(errorMessage, response.status, data, errorContext);
    }

    return data;
  } catch (error) {
    // Handle network errors

    if (error instanceof TypeError && error.message.includes("fetch")) {
      // Get session for error context (use cached version)
      let session;
      try {
        session = await getCachedSession();
      } catch {
        // Ignore session errors during error handling
      }
      
      // Collect error context for network errors (client-side only)
      let errorContext: ErrorContext | undefined;
      if (typeof window !== "undefined") {
        try {
          errorContext = await collectErrorContext(
            error,
            {
              url: `${API_BASE_URL}${endpoint}`,
              method: options.method as string,
              userId: session?.user?.id ?? undefined,
              userEmail: session?.user?.email ?? undefined,
              isAuthenticated: !!session?.user,
            }
          );
        } catch (contextError) {
          // Silently fail if context collection fails
          console.warn("Failed to collect error context:", contextError);
        }
      }
      throw new ApiError("Network error - please check your connection", 0, undefined, errorContext);
    }

    // Re-throw ApiError instances

    if (error instanceof ApiError) {
      throw error;
    }

    // Handle other errors
    // Get session for error context (use cached version)
    let session;
    try {
      session = await getCachedSession();
    } catch {
      // Ignore session errors during error handling
    }
    
    // Collect error context for unknown errors (client-side only)
    let errorContext: ErrorContext | undefined;
    if (typeof window !== "undefined") {
      try {
        errorContext = await collectErrorContext(error, {
          url: `${API_BASE_URL}${endpoint}`,
          method: options.method as string,
          userId: session?.user?.id ?? undefined,
          userEmail: session?.user?.email ?? undefined,
          isAuthenticated: !!session?.user,
        });
      } catch (contextError) {
        // Silently fail if context collection fails
        console.warn("Failed to collect error context:", contextError);
      }
    }

    throw new ApiError(
      error instanceof Error ? error.message : "An unknown error occurred",
      0,
      undefined,
      errorContext
    );
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

export async function apiDelete<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "DELETE",

    body: data ? JSON.stringify(data) : undefined,
  });
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
