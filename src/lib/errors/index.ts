/**
 * Standardized Error Classes and Handling
 *
 * Provides custom error classes for better error handling and debugging.
 *
 * @module lib/errors
 */

import { logger, type LogContext } from "@/utils/logger";
import { NextResponse } from "next/server";

// ============================================================
// BASE ERROR CLASS
// ============================================================

export class AppError extends Error {
  constructor(message: string, public statusCode: number = 500, public code?: string, public details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================
// SPECIFIC ERROR CLASSES
// ============================================================

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Insufficient permissions") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = "Rate limit exceeded", retryAfter?: number) {
    super(message, 429, "RATE_LIMIT", { retryAfter });
  }
}

export class PaymentError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 402, "PAYMENT_ERROR", details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: unknown) {
    const detailsObj = details && typeof details === "object" ? details : {};
    super(`External service error (${service}): ${message}`, 502, "EXTERNAL_SERVICE_ERROR", {
      service,
      ...detailsObj,
    });
  }
}

// ============================================================
// ERROR HANDLER
// ============================================================

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
  timestamp: string;
}

/**
 * Handle errors in API routes and return standardized responses
 */
export function handleApiError(error: unknown): NextResponse<ErrorResponse> {
  // Log the error
  if (error instanceof AppError) {
    logger.error(`API Error: ${error.message}`, error, {
      statusCode: error.statusCode,
      code: error.code,
      details: error.details,
    });
  } else if (error instanceof Error) {
    logger.error("Unhandled API Error", error);
  } else {
    // For unknown error types, include in context only
    // Use type assertion to satisfy TypeScript's LogContext type
    const errorContext: LogContext = { error: error as unknown };
    logger.error("Unknown API Error", undefined, errorContext);
  }

  // Return appropriate response
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
        timestamp: new Date().toISOString(),
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: "INTERNAL_ERROR",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: "An unknown error occurred",
      code: "UNKNOWN_ERROR",
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}

/**
 * Wrap async route handlers with error handling
 */
export function withErrorHandling<T>(handler: (request: Request) => Promise<NextResponse<T>>) {
  return async (request: Request): Promise<NextResponse<T | ErrorResponse>> => {
    try {
      return await handler(request);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

// ============================================================
// ERROR TYPE GUARDS
// ============================================================

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isPaymentError(error: unknown): error is PaymentError {
  return error instanceof PaymentError;
}
