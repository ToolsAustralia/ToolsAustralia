/**
 * Server-Side Automatic Error Logging Utility
 * 
 * Automatically logs critical errors to the database from server-side code (API routes).
 * This is especially important for payment-related errors that directly impact revenue.
 * 
 * Use Cases:
 * - Payment failures in API routes (card declined, insufficient funds, Stripe API errors)
 * - Critical system errors in server-side code
 * - Errors that users might not report but need tracking
 * 
 * This complements the client-side auto-logging by providing server-side error tracking.
 */

/**
 * Hash IP address for privacy protection
 * Uses SHA-256 to create a one-way hash
 */
function hashIPAddress(ip: string): string {
  return crypto.createHash("sha256").update(ip.trim().toLowerCase()).digest("hex");
}

import ErrorReport from "@/models/ErrorReport";
import { generateDeduplicationHashServer } from "./deduplication";
import { ErrorContext } from "@/types/error-reporting";
import crypto from "crypto";

/**
 * Automatically log an error to the database from server-side code
 * This bypasses user interaction and directly creates an error report
 * 
 * @param error - The error that occurred
 * @param request - The NextRequest object (for IP address and headers)
 * @param additionalContext - Additional context specific to this error
 * @param options - Options for automatic logging
 */
export async function autoLogErrorServer(
  error: unknown,
  request: { headers: Headers; url?: string },
  additionalContext?: {
    category?: "payment" | "stripe" | "system" | "api";
    severity?: "critical" | "high" | "medium";
    paymentIntentId?: string;
    customerId?: string;
    amount?: number;
    packageId?: string;
    packageName?: string;
    userId?: string;
    userEmail?: string;
    [key: string]: unknown;
  },
  options?: {
    skipRateLimit?: boolean; // Skip rate limiting for critical errors
    skipDeduplication?: boolean; // Skip deduplication for unique errors
  }
): Promise<void> {
  try {
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
      const errorObj = error as { message?: unknown; stack?: unknown; name?: unknown };
      errorMessage = String(errorObj.message || "Unknown error");
      if ("stack" in errorObj) errorStack = String(errorObj.stack);
      if ("name" in errorObj) errorName = String(errorObj.name);
    }

    // Get IP address and hash it for privacy
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const ipAddressHash = hashIPAddress(ipAddress);

    // Extract API endpoint from request URL
    let apiEndpoint: string | undefined;
    const httpMethod = "POST"; // Default to POST for API routes
    if (request.url) {
      try {
        const url = new URL(request.url);
        apiEndpoint = url.pathname;
      } catch {
        // Invalid URL, try to extract pathname manually
        const match = request.url.match(/\/api\/[^?#]+/);
        if (match) {
          apiEndpoint = match[0];
        }
      }
    }

    // Build error context
    const errorContext: ErrorContext = {
      errorMessage: additionalContext?.paymentIntentId
        ? `${errorMessage} [PaymentIntent: ${additionalContext.paymentIntentId}]`
        : errorMessage,
      errorStack,
      errorName: additionalContext?.category
        ? `${additionalContext.category.toUpperCase()}_ERROR`
        : errorName,
      apiEndpoint,
      httpMethod,
      requestUrl: request.url,
      userId: additionalContext?.userId,
      userEmail: additionalContext?.userEmail,
      isAuthenticated: !!additionalContext?.userId,
      userAgent: request.headers.get("user-agent") || undefined,
      timestamp: Date.now(), // Use number (Date.now()) not Date object
    };

    // Generate deduplication hash
    const deduplicationHash = generateDeduplicationHashServer(errorContext);

    // Build user notes with payment context if available
    let userNotes: string | undefined;
    if (additionalContext) {
      const notes: string[] = [];
      if (additionalContext.paymentIntentId) {
        notes.push(`PaymentIntent ID: ${additionalContext.paymentIntentId}`);
      }
      if (additionalContext.customerId) {
        notes.push(`Customer ID: ${additionalContext.customerId}`);
      }
      if (additionalContext.amount) {
        notes.push(`Amount: $${(additionalContext.amount / 100).toFixed(2)}`);
      }
      if (additionalContext.packageId) {
        notes.push(`Package ID: ${additionalContext.packageId}`);
      }
      if (additionalContext.packageName) {
        notes.push(`Package: ${additionalContext.packageName}`);
      }
      if (notes.length > 0) {
        userNotes = `[Auto-logged from server] ${notes.join(", ")}`;
      }
    }

    // Check for existing report if deduplication is enabled
    if (!options?.skipDeduplication) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const existingReport = await ErrorReport.findOne({
        deduplicationHash,
        createdAt: { $gte: oneHourAgo },
      }).lean();

      if (existingReport) {
        // Duplicate report - skip logging
        return;
      }
    }

    // Create new error report
    const newReport = new ErrorReport({
      ...errorContext,
      userId: additionalContext?.userId ? (additionalContext.userId as string) : undefined,
      userEmail: additionalContext?.userEmail || undefined,
      isAuthenticated: !!additionalContext?.userId,
      userNotes,
      ipAddressHash,
      deduplicationHash,
      autoLogged: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await newReport.save();
  } catch (loggingError) {
    // Silently fail if error logging fails - don't disrupt user experience
    console.warn("Failed to auto-log error on server:", loggingError);
  }
}

/**
 * Auto-log payment-related errors from server-side
 * Convenience function specifically for payment errors
 */
export async function autoLogPaymentErrorServer(
  error: unknown,
  request: { headers: Headers; url?: string },
  paymentDetails: {
    paymentIntentId?: string;
    customerId?: string;
    amount?: number;
    packageId?: string;
    packageName?: string;
    userId?: string;
    userEmail?: string;
    errorCode?: string;
    declineCode?: string;
    errorMessage?: string;
  }
): Promise<void> {
  // Build user-friendly error message
  let errorMessage = "Payment failed";
  if (paymentDetails.errorMessage) {
    errorMessage = paymentDetails.errorMessage;
  } else if (paymentDetails.errorCode) {
    // Map common Stripe error codes to user-friendly messages
    const errorCodeMessages: Record<string, string> = {
      card_declined: "Your card was declined",
      insufficient_funds: "Insufficient funds",
      expired_card: "Your card has expired",
      incorrect_cvc: "Your card's security code is incorrect",
      processing_error: "An error occurred while processing your card",
      generic_decline: "Your card was declined",
    };

    const declineCodeMessages: Record<string, string> = {
      insufficient_funds: "Insufficient funds in your account",
      lost_card: "Your card was reported as lost",
      stolen_card: "Your card was reported as stolen",
      pickup_card: "Your card was declined - please contact your bank",
      restricted_card: "Your card has restrictions that prevent this payment",
      security_violation: "Your card was declined due to security reasons",
      service_not_allowed: "Your card does not support this type of purchase",
      stop_payment_order: "A stop payment order has been placed on this card",
      testmode_decline: "Your card was declined (test mode)",
      withdrawal_count_limit_exceeded: "You have exceeded the withdrawal limit for your account",
    };

    errorMessage =
      declineCodeMessages[paymentDetails.declineCode || ""] ||
      errorCodeMessages[paymentDetails.errorCode] ||
      `Payment failed: ${paymentDetails.errorCode}`;
  }

  // Create enhanced error with payment context
  const enhancedError = error instanceof Error ? error : new Error(errorMessage);
  if (error instanceof Error) {
    enhancedError.message = errorMessage;
    enhancedError.stack = error.stack;
  }

  await autoLogErrorServer(enhancedError, request, {
    category: "payment",
    severity: "critical",
    paymentIntentId: paymentDetails.paymentIntentId,
    customerId: paymentDetails.customerId,
    amount: paymentDetails.amount,
    packageId: paymentDetails.packageId,
    packageName: paymentDetails.packageName,
    userId: paymentDetails.userId,
    userEmail: paymentDetails.userEmail,
    errorCode: paymentDetails.errorCode,
    declineCode: paymentDetails.declineCode,
  });
}

