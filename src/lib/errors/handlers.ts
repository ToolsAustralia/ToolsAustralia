/**
 * Error handling utilities for API routes
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { MetricsError, AggregationError, ValidationError } from "./index";

/**
 * Handle API errors and return appropriate HTTP responses
 */
export function handleApiError(error: unknown): NextResponse {
  // Zod validation errors
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input parameters",
          details: error.issues,
        },
      },
      { status: 400 }
    );
  }

  // Custom metrics errors
  if (error instanceof MetricsError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error instanceof ValidationError && error.details ? { details: error.details } : {}),
        },
      },
      { status: error.statusCode }
    );
  }

  // Generic errors
  if (error instanceof Error) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: process.env.NODE_ENV === "production" ? "An internal error occurred" : error.message,
        },
      },
      { status: 500 }
    );
  }

  // Unknown error type
  console.error("Unknown error type:", error);
  return NextResponse.json(
    {
      error: {
        code: "UNKNOWN_ERROR",
        message: "An unknown error occurred",
      },
    },
    { status: 500 }
  );
}

