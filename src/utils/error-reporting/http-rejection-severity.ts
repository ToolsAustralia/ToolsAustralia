/**
 * Classifies a non-2xx HTTP response for ErrorReport capture.
 *
 * Policy (docs/error-reporting + the design spec):
 * - < 400 (incl. 3xx redirects): not an error → skip.
 * - 401 / 403 / 404 / 429: routine auth / permission / not-found / rate-limit gates → skip
 *   (high-volume noise; logging them buries the real signal and amplifies brute-force).
 * - other 4xx: capture as "medium" ONLY if it carries a business `code` (a deliberate, named
 *   rejection like EXISTING_SUBSCRIPTION); codeless 4xx is generic noise → skip.
 * - 5xx: capture as "high" (a genuine failure) regardless of code.
 * Reuses existing severity tiers — intentionally no "low" tier (see the design spec).
 */
import type { ErrorSeverity } from "./error-severity-classifier";

/** Routine gate statuses never worth an ErrorReport row. */
const NOISE_STATUSES = new Set<number>([401, 403, 404, 429]);

export interface HttpRejectionClassification {
  capture: boolean;
  severity: ErrorSeverity;
}

export function classifyHttpRejection(
  status: number,
  options?: { hasBusinessCode?: boolean }
): HttpRejectionClassification {
  if (!Number.isFinite(status) || status < 400) {
    return { capture: false, severity: "medium" };
  }
  if (status >= 500) {
    return { capture: true, severity: "high" };
  }
  // 4xx
  if (NOISE_STATUSES.has(status)) {
    return { capture: false, severity: "medium" };
  }
  return { capture: !!options?.hasBusinessCode, severity: "medium" };
}
