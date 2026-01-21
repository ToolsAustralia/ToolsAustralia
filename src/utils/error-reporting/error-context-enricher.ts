/**
 * Error Context Enricher Utility
 * 
 * Automatically enriches error context with additional information from various sources.
 * This provides more comprehensive error reporting for better debugging.
 * 
 * Enrichments:
 * - Stripe error details (code, decline_code, type)
 * - API response details (status, headers)
 * - Request details (method, body, query params)
 * - User journey context (page, action, flow)
 */

import { ErrorContext } from "@/types/error-reporting";

export interface EnrichmentContext {
  // Stripe-specific
  stripeError?: {
    code?: string;
    decline_code?: string;
    type?: string;
    message?: string;
  };
  
  // API-specific
  apiResponse?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  };
  
  // Request-specific
  requestDetails?: {
    method?: string;
    body?: unknown;
    queryParams?: Record<string, string>;
  };
  
  // User journey
  userJourney?: {
    page?: string;
    action?: string;
    flow?: string;
  };
  
  // Payment-specific
  paymentContext?: {
    paymentIntentId?: string;
    setupIntentId?: string;
    customerId?: string;
    amount?: number;
    packageId?: string;
    packageName?: string;
  };
}

/**
 * Extract Stripe error details from error object
 */
function extractStripeErrorDetails(error: unknown): EnrichmentContext["stripeError"] {
  if (!error || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;
  
  // Check for Stripe error structure
  if (err.code || err.decline_code || err.type) {
    return {
      code: typeof err.code === "string" ? err.code : undefined,
      decline_code: typeof err.decline_code === "string" ? err.decline_code : undefined,
      type: typeof err.type === "string" ? err.type : undefined,
      message: typeof err.message === "string" ? err.message : undefined,
    };
  }
  
  // Check nested error structure
  if (err.error && typeof err.error === "object") {
    const errorObj = err.error as Record<string, unknown>;
    if (errorObj.code || errorObj.decline_code || errorObj.type) {
      return {
        code: typeof errorObj.code === "string" ? errorObj.code : undefined,
        decline_code: typeof errorObj.decline_code === "string" ? errorObj.decline_code : undefined,
        type: typeof errorObj.type === "string" ? errorObj.type : undefined,
        message: typeof errorObj.message === "string" ? errorObj.message : undefined,
      };
    }
  }
  
  // Check response.data.error structure
  if (err.response && typeof err.response === "object") {
    const response = err.response as Record<string, unknown>;
    if (response.data && typeof response.data === "object") {
      const data = response.data as Record<string, unknown>;
      if (data.error && typeof data.error === "object") {
        const errorObj = data.error as Record<string, unknown>;
        if (errorObj.code || errorObj.decline_code || errorObj.type) {
          return {
            code: typeof errorObj.code === "string" ? errorObj.code : undefined,
            decline_code: typeof errorObj.decline_code === "string" ? errorObj.decline_code : undefined,
            type: typeof errorObj.type === "string" ? errorObj.type : undefined,
            message: typeof errorObj.message === "string" ? errorObj.message : undefined,
          };
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Extract API response details from error object
 */
function extractAPIResponseDetails(error: unknown): EnrichmentContext["apiResponse"] {
  if (!error || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;
  
  // Check for response object
  if (err.response && typeof err.response === "object") {
    const response = err.response as Record<string, unknown>;
    return {
      status: typeof response.status === "number" ? response.status : undefined,
      statusText: typeof response.statusText === "string" ? response.statusText : undefined,
      headers: typeof response.headers === "object" && response.headers !== null
        ? (response.headers as Record<string, string>)
        : undefined,
    };
  }
  
  // Check for status code in error directly
  if (err.status && typeof err.status === "number") {
    return {
      status: err.status,
      statusText: typeof err.statusText === "string" ? err.statusText : undefined,
    };
  }
  
  return undefined;
}

/**
 * Extract request details from context
 */
function extractRequestDetails(context?: {
  requestBody?: unknown;
  requestMethod?: string;
  queryParams?: Record<string, string>;
}): EnrichmentContext["requestDetails"] {
  if (!context) return undefined;

  return {
    method: context.requestMethod,
    body: context.requestBody,
    queryParams: context.queryParams,
  };
}

/**
 * Enrich error context with additional information
 * 
 * @param errorContext - Base error context
 * @param error - The error object
 * @param enrichmentContext - Additional context for enrichment
 * @returns Enriched error context
 */
export function enrichErrorContext(
  errorContext: ErrorContext,
  error: unknown,
  enrichmentContext?: {
    requestBody?: unknown;
    requestMethod?: string;
    queryParams?: Record<string, string>;
    page?: string;
    action?: string;
    flow?: string;
    paymentIntentId?: string;
    setupIntentId?: string;
    customerId?: string;
    amount?: number;
    packageId?: string;
    packageName?: string;
  }
): ErrorContext & { enrichment?: EnrichmentContext } {
  const enrichment: EnrichmentContext = {};

  // Extract Stripe error details
  const stripeError = extractStripeErrorDetails(error);
  if (stripeError) {
    enrichment.stripeError = stripeError;
  }

  // Extract API response details
  const apiResponse = extractAPIResponseDetails(error);
  if (apiResponse) {
    enrichment.apiResponse = apiResponse;
  }

  // Extract request details
  const requestDetails = extractRequestDetails({
    requestBody: enrichmentContext?.requestBody,
    requestMethod: enrichmentContext?.requestMethod,
    queryParams: enrichmentContext?.queryParams,
  });
  if (requestDetails) {
    enrichment.requestDetails = requestDetails;
  }

  // Add user journey context
  if (enrichmentContext?.page || enrichmentContext?.action || enrichmentContext?.flow) {
    enrichment.userJourney = {
      page: enrichmentContext.page,
      action: enrichmentContext.action,
      flow: enrichmentContext.flow,
    };
  }

  // Add payment context
  if (
    enrichmentContext?.paymentIntentId ||
    enrichmentContext?.setupIntentId ||
    enrichmentContext?.customerId ||
    enrichmentContext?.amount ||
    enrichmentContext?.packageId ||
    enrichmentContext?.packageName
  ) {
    enrichment.paymentContext = {
      paymentIntentId: enrichmentContext.paymentIntentId,
      setupIntentId: enrichmentContext.setupIntentId,
      customerId: enrichmentContext.customerId,
      amount: enrichmentContext.amount,
      packageId: enrichmentContext.packageId,
      packageName: enrichmentContext.packageName,
    };
  }

  // Enhance error message with Stripe details if available
  let enhancedErrorMessage = errorContext.errorMessage;
  if (stripeError?.code || stripeError?.decline_code) {
    const stripeDetails: string[] = [];
    if (stripeError.code) stripeDetails.push(`Code: ${stripeError.code}`);
    if (stripeError.decline_code) stripeDetails.push(`Decline: ${stripeError.decline_code}`);
    if (stripeDetails.length > 0) {
      enhancedErrorMessage = `${errorContext.errorMessage} [${stripeDetails.join(", ")}]`;
    }
  }

  // Enhance error message with API status if available
  if (apiResponse?.status) {
    enhancedErrorMessage = `${enhancedErrorMessage} [HTTP ${apiResponse.status}]`;
  }

  return {
    ...errorContext,
    errorMessage: enhancedErrorMessage,
    enrichment: Object.keys(enrichment).length > 0 ? enrichment : undefined,
  };
}
