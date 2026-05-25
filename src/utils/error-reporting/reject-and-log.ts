import { NextResponse } from "next/server";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";

interface RejectContext {
  userId?: string;
  userEmail?: string;
  guestEmail?: string;
  packageId?: string;
  customerId?: string;
  /** Model-enum category; defaults to "payment" for the subscription-creation routes. */
  category?: "payment" | "network" | "api" | "system" | "recovery";
}

/**
 * Returns `NextResponse.json(body, { status })` AND fire-and-forget logs the rejection to
 * ErrorReport via ErrorLoggingService.logHttpRejection.
 *
 * Use ONLY at non-thrown early returns. `catch` blocks already auto-log thrown errors, so do
 * not wrap those. The capture policy (in classifyHttpRejection) skips <400, the routine gates
 * 401/403/404/429, and codeless 4xx — so this is safe even if such a body is ever passed; it
 * just won't create a row. NON-BLOCKING: never `await` this in a route path.
 */
export function rejectAndLog(
  request: { headers: Headers; url?: string; method?: string },
  status: number,
  body: { error?: string; code?: string; [key: string]: unknown },
  context?: RejectContext
): NextResponse {
  void ErrorLoggingService.logHttpRejection({
    status,
    request,
    code: typeof body.code === "string" ? body.code : undefined,
    message: typeof body.error === "string" ? body.error : undefined,
    category: context?.category ?? "payment",
    httpMethod: request.method,
    context: {
      userId: context?.userId,
      userEmail: context?.userEmail,
      guestEmail: context?.guestEmail,
      packageId: context?.packageId,
      customerId: context?.customerId,
    },
  }).catch(() => {
    /* fire-and-forget — never block or fail the response */
  });

  return NextResponse.json(body, { status });
}
