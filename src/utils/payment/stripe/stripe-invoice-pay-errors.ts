/**
 * Map Stripe invoice/pay errors to stable API codes for the pay-failed-invoice flow.
 */

export type PayFailedInvoiceFailureCode =
  | "invoice_not_payable"
  | "payment_intent_not_payable";

function isRecord(e: unknown): e is Record<string, unknown> {
  return typeof e === "object" && e !== null;
}

/**
 * When invoices.pay fails and we cannot obtain a client-confirmable PaymentIntent.
 */
export function classifyStripeInvoicePayInitFailure(error: unknown): {
  httpStatus: number;
  failureCode: PayFailedInvoiceFailureCode;
  error: string;
  details: string;
} | null {
  if (!isRecord(error)) return null;

  const message = typeof error.message === "string" ? error.message : "";
  const code = typeof error.code === "string" ? error.code : "";
  const lower = message.toLowerCase();

  if (
    lower.includes("no longer be paid") ||
    lower.includes("voiding, marking as uncollectible") ||
    lower.includes("paid out of band")
  ) {
    return {
      httpStatus: 400,
      failureCode: "invoice_not_payable",
      error: "Invoice cannot be paid",
      details: message || "This invoice can no longer be paid through checkout. Please contact support.",
    };
  }

  // Invoice in wrong state for collection
  if (code === "invoice_already_voided" || code === "invoice_not_editable") {
    return {
      httpStatus: 400,
      failureCode: "invoice_not_payable",
      error: "Invoice cannot be paid",
      details: message,
    };
  }

  return null;
}
