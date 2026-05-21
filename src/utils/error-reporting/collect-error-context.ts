/**
 * Error Context Collection Utility
 * 
 * Collects comprehensive error context information when an error occurs.
 * This includes browser information, user session, API details, and console errors.
 * 
 * This utility runs client-side and collects all available context for error reporting.
 */

import { ErrorContext } from "@/types/error-reporting";
import { getSession } from "next-auth/react";

// Store console errors for context collection
let consoleErrorBuffer: Array<{
  message: string;
  source?: string;
  line?: number;
  column?: number;
  timestamp: number;
}> = [];

// Maximum number of console errors to store
const MAX_CONSOLE_ERRORS = 10;

/**
 * Initialize console error tracking
 * This should be called once when the app loads
 */
export function initializeConsoleErrorTracking(): void {
  if (typeof window === "undefined") return;

  // Store original console.error
  const originalConsoleError = console.error;

  // Override console.error to capture errors
  console.error = function (...args: unknown[]) {
    // Call original console.error
    originalConsoleError.apply(console, args);

    // Capture error information
    try {
      const errorMessage = args
        .map((arg) => {
          if (arg instanceof Error) {
            return arg.message;
          }
          if (typeof arg === "string") {
            return arg;
          }
          return JSON.stringify(arg);
        })
        .join(" ");

      // Try to extract source information from error stack
      let source: string | undefined;
      let line: number | undefined;
      let column: number | undefined;

      if (args[0] instanceof Error && args[0].stack) {
        const stackLines = args[0].stack.split("\n");
        if (stackLines.length > 1) {
          const match = stackLines[1].match(/at .+ \((.+):(\d+):(\d+)\)/);
          if (match) {
            source = match[1];
            line = parseInt(match[2], 10);
            column = parseInt(match[3], 10);
          }
        }
      }

      // Add to buffer (keep only recent errors)
      consoleErrorBuffer.push({
        message: errorMessage.substring(0, 500), // Limit message length
        source,
        line,
        column,
        timestamp: Date.now(),
      });

      // Keep only the most recent errors
      if (consoleErrorBuffer.length > MAX_CONSOLE_ERRORS) {
        consoleErrorBuffer = consoleErrorBuffer.slice(-MAX_CONSOLE_ERRORS);
      }
    } catch (error) {
      // Silently fail if error tracking fails
      console.warn("Failed to track console error:", error);
    }
  };
}

/**
 * Get browser information from user agent
 */
function getBrowserInfo(): {
  name?: string;
  version?: string;
  os?: string;
} {
  if (typeof window === "undefined" || !window.navigator) {
    return {};
  }

  const userAgent = window.navigator.userAgent;
  const browserInfo: { name?: string; version?: string; os?: string } = {};

  // Detect browser
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
    browserInfo.name = "Chrome";
    const match = userAgent.match(/Chrome\/(\d+)/);
    if (match) browserInfo.version = match[1];
  } else if (userAgent.includes("Firefox")) {
    browserInfo.name = "Firefox";
    const match = userAgent.match(/Firefox\/(\d+)/);
    if (match) browserInfo.version = match[1];
  } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    browserInfo.name = "Safari";
    const match = userAgent.match(/Version\/(\d+)/);
    if (match) browserInfo.version = match[1];
  } else if (userAgent.includes("Edg")) {
    browserInfo.name = "Edge";
    const match = userAgent.match(/Edg\/(\d+)/);
    if (match) browserInfo.version = match[1];
  }

  // Detect OS
  if (userAgent.includes("Windows")) {
    browserInfo.os = "Windows";
  } else if (userAgent.includes("Mac")) {
    browserInfo.os = "macOS";
  } else if (userAgent.includes("Linux")) {
    browserInfo.os = "Linux";
  } else if (userAgent.includes("Android")) {
    browserInfo.os = "Android";
  } else if (userAgent.includes("iOS") || userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    browserInfo.os = "iOS";
  }

  return browserInfo;
}

/**
 * Extract API endpoint from error or request information
 */
function extractApiEndpoint(error: unknown, requestInfo?: { url?: string; method?: string }): {
  apiEndpoint?: string;
  httpMethod?: string;
} {
  const result: { apiEndpoint?: string; httpMethod?: string } = {};

  // Try to get from request info first
  if (requestInfo?.url) {
    try {
      const url = new URL(requestInfo.url);
      result.apiEndpoint = url.pathname;
      result.httpMethod = requestInfo.method;
    } catch {
      // Invalid URL, try to extract pathname manually
      const match = requestInfo.url.match(/\/api\/[^?#]+/);
      if (match) {
        result.apiEndpoint = match[0];
      }
    }
  }

  // Try to extract from error message or stack
  if (!result.apiEndpoint && error instanceof Error) {
    const errorText = error.message + (error.stack || "");
    const apiMatch = errorText.match(/\/api\/[^\s"']+/);
    if (apiMatch) {
      result.apiEndpoint = apiMatch[0];
    }
  }

  return result;
}

/** Request info passed to collectErrorContext (exported for callers) */
export interface CollectErrorContextRequest {
  url?: string;
  method?: string;
  status?: number;
  userEmail?: string;
  guestEmail?: string;
  userId?: string;
  isAuthenticated?: boolean;
}

/**
 * Collect comprehensive error context
 * 
 * @param error - The error object that occurred
 * @param requestInfo - Optional request information (URL, method, status, guestEmail, userId, isAuthenticated)
 * @returns ErrorContext object with all collected information
 */
export async function collectErrorContext(
  error: unknown,
  requestInfo?: CollectErrorContextRequest
): Promise<ErrorContext> {
  const timestamp = Date.now();

  // Extract error information
  let errorMessage = "Unknown error";
  let errorStack: string | undefined;
  let errorName: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack;
    errorName = error.name;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else if (error && typeof error === "object" && "message" in error) {
    errorMessage = String((error as { message: unknown }).message);
  }

  // Get session information (prefer from requestInfo to avoid redundant fetch)
  let userId: string | undefined = requestInfo?.userId;
  let userEmail: string | undefined = requestInfo?.userEmail;
  const guestEmail: string | undefined = requestInfo?.guestEmail;
  let isAuthenticated = requestInfo?.isAuthenticated ?? false;

  // Only fetch session if not provided in requestInfo
  if (!userId && !isAuthenticated) {
    try {
      const session = await getSession();
      if (session?.user) {
        isAuthenticated = true;
        userId = session.user.id;
        userEmail = session.user.email || undefined;
      }
    } catch (sessionError) {
      console.warn("Failed to get session for error context:", sessionError);
    }
  }

  // Get browser and environment information
  const userAgent = typeof window !== "undefined" ? window.navigator?.userAgent : undefined;
  const browserInfo = typeof window !== "undefined" ? getBrowserInfo() : undefined;

  // Get page/route information
  const currentUrl = typeof window !== "undefined" ? window.location.href : undefined;
  const route = typeof window !== "undefined" ? window.location.pathname : undefined;
  const referrer = typeof window !== "undefined" ? document.referrer || undefined : undefined;

  // Extract API endpoint information
  const { apiEndpoint, httpMethod } = extractApiEndpoint(error, {
    url: requestInfo?.url,
    method: requestInfo?.method,
  });

  // Get console errors (from buffer)
  const consoleErrors = [...consoleErrorBuffer].slice(-5); // Last 5 errors

  // Get timezone
  const timezone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

  // Build error context
  const context: ErrorContext = {
    errorMessage,
    errorStack,
    errorName,
    apiEndpoint,
    httpMethod: httpMethod as "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | undefined,
    httpStatus: requestInfo?.status,
    requestUrl: requestInfo?.url,
    userId,
    userEmail,
    guestEmail, // ✅ NEW: Include guest email in context
    isAuthenticated,
    userAgent,
    browserInfo,
    currentUrl,
    route,
    referrer,
    consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
    timestamp,
    timezone,
  };

  return context;
}

/**
 * Clear console error buffer
 * Useful for testing or resetting error tracking
 */
export function clearConsoleErrorBuffer(): void {
  consoleErrorBuffer = [];
}

