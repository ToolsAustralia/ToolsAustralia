/**
 * Centralized Error Logging Service
 * 
 * Provides a unified interface for logging errors across the application.
 * Handles error categorization, severity classification, context enrichment,
 * and user information extraction with clear separation of concerns.
 * 
 * Features:
 * - Automatic error categorization
 * - Automatic severity determination
 * - Context enrichment
 * - User information extraction (authenticated + guest)
 * - Support for both client-side and server-side logging
 * 
 * Best Practices:
 * - Fire-and-forget: Never blocks user flow
 * - Comprehensive context: Captures all relevant information
 * - Privacy-aware: Handles user data appropriately
 * - Scalable: Easy to extend with new error types
 */

import { detectCategoryAndSeverity } from "@/utils/error-reporting/error-severity-classifier";
import { autoLogError } from "@/utils/error-reporting/auto-log-error";
import { classifyHttpRejection } from "@/utils/error-reporting/http-rejection-severity";
// ✅ FIXED: Dynamic import for server-side utility to prevent client-side bundling
// autoLogErrorServer is only imported when needed (server-side)

export interface LoggingContext {
  // User information
  userId?: string;
  userEmail?: string;
  guestEmail?: string;
  
  // Request/API context
  endpoint?: string;
  requestMethod?: string;
  requestBody?: unknown;
  queryParams?: Record<string, string>;
  
  // Component/Page context
  component?: string;
  page?: string;
  action?: string;
  flow?: string;
  
  // Payment context
  paymentIntentId?: string;
  setupIntentId?: string;
  customerId?: string;
  amount?: number;
  packageId?: string;
  packageName?: string;
  
  // Additional context
  [key: string]: unknown;
}

export interface LoggingOptions {
  skipRateLimit?: boolean;
  skipDeduplication?: boolean;
  isServerSide?: boolean;
  request?: { headers: Headers; url?: string };
}

/**
 * Extract user information from context
 */
function extractUserInfo(context: LoggingContext): {
  userId?: string;
  userEmail?: string;
  guestEmail?: string;
  isAuthenticated: boolean;
} {
  const isAuthenticated = !!context.userId;
  
  // Prioritize authenticated user email over guest email
  const userEmail = context.userEmail || (isAuthenticated ? undefined : context.guestEmail);
  const guestEmail = !isAuthenticated ? context.guestEmail : undefined;
  
  return {
    userId: context.userId,
    userEmail,
    guestEmail,
    isAuthenticated,
  };
}

/**
 * Centralized Error Logging Service
 */
export class ErrorLoggingService {
  /**
   * Log payment-related errors
   */
  static async logPaymentError(
    error: unknown,
    context: LoggingContext,
    options?: LoggingOptions
  ): Promise<void> {
    const { severity } = detectCategoryAndSeverity(error, {
      endpoint: context.endpoint,
      component: context.component,
      isPaymentRelated: true,
    });

    const userInfo = extractUserInfo(context);

    if (options?.isServerSide && options.request) {
      // ✅ FIXED: Dynamic import to prevent client-side bundling of server-only code
      const { autoLogErrorServer } = await import("@/utils/error-reporting/auto-log-error-server");
      await autoLogErrorServer(
        error,
        options.request,
        {
          category: "payment", // ✅ Explicitly set category
          severity, // ✅ Pass severity
          userId: userInfo.userId,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
          paymentIntentId: context.paymentIntentId,
          setupIntentId: context.setupIntentId,
          customerId: context.customerId,
          amount: context.amount,
          packageId: context.packageId,
          packageName: context.packageName,
          errorCode: (error as { code?: string })?.code,
          declineCode: (error as { decline_code?: string })?.decline_code,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        {
          skipRateLimit: options.skipRateLimit,
          skipDeduplication: options.skipDeduplication,
        }
      );
    } else {
      await autoLogError(
        error,
        {
          category: "payment", // ✅ Explicitly set category
          severity, // ✅ Pass severity
          paymentIntentId: context.paymentIntentId,
          setupIntentId: context.setupIntentId,
          customerId: context.customerId,
          amount: context.amount,
          packageId: context.packageId,
          packageName: context.packageName,
          errorCode: (error as { code?: string })?.code,
          declineCode: (error as { decline_code?: string })?.decline_code,
          errorMessage: error instanceof Error ? error.message : String(error),
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options?.skipRateLimit,
          skipDeduplication: options?.skipDeduplication,
        }
      );
    }
  }

  /**
   * Log network-related errors
   */
  static async logNetworkError(
    error: unknown,
    context: LoggingContext,
    options?: LoggingOptions
  ): Promise<void> {
    const { severity } = detectCategoryAndSeverity(error, {
      endpoint: context.endpoint,
      component: context.component,
    });

    const userInfo = extractUserInfo(context);

    if (options?.isServerSide && options.request) {
      // ✅ FIXED: Dynamic import to prevent client-side bundling
      const { autoLogErrorServer } = await import("@/utils/error-reporting/auto-log-error-server");
      await autoLogErrorServer(
        error,
        options.request,
        {
          category: "network",
          severity,
          userId: userInfo.userId,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options.skipRateLimit,
          skipDeduplication: options.skipDeduplication,
        }
      );
    } else {
      await autoLogError(
        error,
        {
          category: "network",
          severity,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options?.skipRateLimit,
          skipDeduplication: options?.skipDeduplication,
        }
      );
    }
  }

  /**
   * Log API-related errors
   */
  static async logAPIError(
    error: unknown,
    context: LoggingContext,
    options?: LoggingOptions
  ): Promise<void> {
    const { severity } = detectCategoryAndSeverity(error, {
      endpoint: context.endpoint,
      component: context.component,
    });

    const userInfo = extractUserInfo(context);

    if (options?.isServerSide && options.request) {
      // ✅ FIXED: Dynamic import to prevent client-side bundling
      const { autoLogErrorServer } = await import("@/utils/error-reporting/auto-log-error-server");
      await autoLogErrorServer(
        error,
        options.request,
        {
          category: "api",
          severity,
          userId: userInfo.userId,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options.skipRateLimit,
          skipDeduplication: options.skipDeduplication,
        }
      );
    } else {
      await autoLogError(
        error,
        {
          category: "api",
          severity,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options?.skipRateLimit,
          skipDeduplication: options?.skipDeduplication,
        }
      );
    }
  }

  /**
   * Log system-related errors
   */
  static async logSystemError(
    error: unknown,
    context: LoggingContext,
    options?: LoggingOptions
  ): Promise<void> {
    const { severity } = detectCategoryAndSeverity(error, {
      endpoint: context.endpoint,
      component: context.component,
    });

    const userInfo = extractUserInfo(context);

    if (options?.isServerSide && options.request) {
      // ✅ FIXED: Dynamic import to prevent client-side bundling
      const { autoLogErrorServer } = await import("@/utils/error-reporting/auto-log-error-server");
      await autoLogErrorServer(
        error,
        options.request,
        {
          category: "system",
          severity,
          userId: userInfo.userId,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options.skipRateLimit,
          skipDeduplication: options.skipDeduplication,
        }
      );
    } else {
      await autoLogError(
        error,
        {
          category: "system",
          severity,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options?.skipRateLimit,
          skipDeduplication: options?.skipDeduplication,
        }
      );
    }
  }

  /**
   * Log recovery-related errors
   */
  static async logRecoveryError(
    error: unknown,
    context: LoggingContext,
    options?: LoggingOptions
  ): Promise<void> {
    const { severity } = detectCategoryAndSeverity(error, {
      endpoint: context.endpoint,
      component: context.component,
    });

    const userInfo = extractUserInfo(context);

    if (options?.isServerSide && options.request) {
      // ✅ FIXED: Dynamic import to prevent client-side bundling
      const { autoLogErrorServer } = await import("@/utils/error-reporting/auto-log-error-server");
      await autoLogErrorServer(
        error,
        options.request,
        {
          category: "recovery",
          severity,
          userId: userInfo.userId,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options.skipRateLimit,
          skipDeduplication: options.skipDeduplication,
        }
      );
    } else {
      await autoLogError(
        error,
        {
          category: "recovery",
          severity,
          userEmail: userInfo.userEmail,
          guestEmail: userInfo.guestEmail,
        },
        {
          skipRateLimit: options?.skipRateLimit,
          skipDeduplication: options?.skipDeduplication,
        }
      );
    }
  }

  /**
   * Auto-detect error category and log appropriately
   * This is the recommended method for most use cases
   */
  static async logError(
    error: unknown,
    context: LoggingContext,
    options?: LoggingOptions
  ): Promise<void> {
    const { category } = detectCategoryAndSeverity(error, {
      endpoint: context.endpoint,
      component: context.component,
      isPaymentRelated: !!context.paymentIntentId || !!context.setupIntentId,
    });

    switch (category) {
      case "payment":
        await this.logPaymentError(error, context, options);
        break;
      case "network":
        await this.logNetworkError(error, context, options);
        break;
      case "recovery":
        await this.logRecoveryError(error, context, options);
        break;
      case "system":
        await this.logSystemError(error, context, options);
        break;
      case "api":
      default:
        await this.logAPIError(error, context, options);
        break;
    }
  }

  /**
   * Log a NON-thrown HTTP rejection (an early `return NextResponse.json(body, { status })`).
   * Capture policy lives in classifyHttpRejection: 5xx → "high"; 4xx → "medium" only when it
   * carries a business `code`; <400 and 401/403/404/429 and codeless 4xx are skipped. Forces the
   * severity from the status (never calls detectCategoryAndSeverity, which escalates payment to
   * "critical"). Fire-and-forget; never throws.
   */
  static async logHttpRejection(params: {
    status: number;
    request: { headers: Headers; url?: string };
    code?: string;
    message?: string;
    category?: "payment" | "network" | "api" | "system" | "recovery";
    httpMethod?: string;
    context?: {
      userId?: string;
      userEmail?: string;
      guestEmail?: string;
      packageId?: string;
      customerId?: string;
    };
  }): Promise<void> {
    // 4xx is captured only when it carries a business code; 5xx always; gates/3xx never.
    const { capture, severity } = classifyHttpRejection(params.status, {
      hasBusinessCode: typeof params.code === "string" && params.code.length > 0,
    });
    if (!capture) return;

    // Dynamic import keeps the server-only util out of any client bundle (existing pattern).
    const { autoLogErrorServer } = await import("@/utils/error-reporting/auto-log-error-server");

    const codePart = params.code ? `[${params.code}] ` : "";
    const message = `${codePart}${params.message ?? `HTTP ${params.status}`}`;

    await autoLogErrorServer(
      new Error(message),
      params.request,
      {
        category: params.category ?? "api", // MUST be a model-enum category — never "stripe"
        severity, // "medium" (4xx) or "high" (5xx) — both valid enum values
        httpStatus: params.status,
        httpMethod: params.httpMethod ?? "POST",
        userId: params.context?.userId,
        userEmail: params.context?.userEmail,
        guestEmail: params.context?.guestEmail,
        packageId: params.context?.packageId,
        customerId: params.context?.customerId,
      }
    );
  }
}
