// src/utils/admin/receipts.ts
//
// Pure, client-safe half of the admin Receipts ledger: the category vocabulary, the
// classifier, the refund-marking rule, the row DTOs, and the CSV writer.
//
// It lives apart from `src/services/admin/receipts.ts` (which imports Mongoose models)
// because the Receipts tab is a client component. Importing the service from client code
// would drag `mongoose` — a `serverExternalPackage` — into the browser bundle. Everything
// here is dependency-free and testable without a database.

import type { RevenueDetailsCategory } from "@/services/admin/dashboardSlices";

/**
 * The dashboard's six revenue categories, extended with the shop.
 *
 * Deliberately an EXTENSION rather than a widening of `RevenueDetailsCategory` itself:
 * `getRevenueDetails` and `classifyRevenueBucket` switch exhaustively on that type, so
 * adding "shop-order" to it would drag the dashboard's revenue maths into this feature.
 *
 * (`import type` is erased at compile time, so naming the service's type here costs the
 * client bundle nothing.)
 */
export type ReceiptCategory = RevenueDetailsCategory | "shop-order";

export const RECEIPT_CATEGORIES: ReceiptCategory[] = [
  "membership-purchase",
  "membership-renewal",
  "one-time-purchase",
  "additional-one-time",
  "mini-draw",
  "upsell",
  "shop-order",
];

export const RECEIPT_CATEGORY_LABELS: Record<ReceiptCategory, string> = {
  "membership-purchase": "Membership purchase",
  "membership-renewal": "Membership renewal",
  "one-time-purchase": "One-time pack",
  "additional-one-time": "Additional pack",
  "mini-draw": "Mini draw",
  upsell: "Upsell",
  "shop-order": "Shop order",
};

export function isReceiptCategory(value: string): value is ReceiptCategory {
  return (RECEIPT_CATEGORIES as string[]).includes(value);
}

export type ReceiptRefundStatus = "none" | "refunded" | "partially-refunded";
export type ReceiptSource = "payment-event" | "order";

export const RECEIPT_REFUND_STATUS_LABELS: Record<ReceiptRefundStatus, string> = {
  none: "Paid",
  refunded: "Refunded",
  "partially-refunded": "Partially refunded",
};

export interface ReceiptRow {
  /** `PaymentEvent._id` (e.g. "BenefitsGranted-pi_x") or the Order's `_id`. Unique per row. */
  id: string;
  source: ReceiptSource;
  timestamp: string;
  category: ReceiptCategory;
  packageName: string;
  /** Gross, in dollars. */
  amount: number;
  refundStatus: ReceiptRefundStatus;
  /** Dollars returned to the customer — equals `amount` on a full refund, 0 when none. */
  refundedAmount: number;
  /** `amount - refundedAmount`, floored at 0. */
  netAmount: number;
  refundedAt: string | null;
  customer: {
    userId: string | null;
    firstName: string;
    lastName: string;
    email: string;
  };
  stripe: {
    /** As stored: `pi_…` for one-offs, `invoice_in_…` for subscription renewals. */
    objectId: string | null;
    /** The same id as Stripe knows it — the `invoice_` storage prefix stripped. */
    objectLabel: string | null;
    objectUrl: string | null;
    customerId: string | null;
    customerUrl: string | null;
  };
}

export interface ReceiptsTotals {
  gross: number;
  refunded: number;
  /** Gross minus refunds — the headline figure, labelled "net of refunds" in the UI. */
  net: number;
  count: number;
}

export interface ReceiptsData {
  rows: ReceiptRow[];
  totals: ReceiptsTotals;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  stripeMode: "live" | "test";
}

/** The minimum a `PaymentEvent` row has to expose for classification. */
export interface LeanReceiptEvent {
  packageType?: string | null;
  packageId?: string | null;
  billingReason?: string | null;
}

/**
 * Classify one BenefitsGranted row into a receipt category.
 *
 * Mirrors `classifyAcquisitionCategory` (src/services/admin/platformRevenueBreakdown.ts)
 * with ONE deliberate difference: a membership row whose `billingReason` is
 * "subscription_cycle" maps to "membership-renewal" here, where the acquisition classifier
 * returns null to drop it (the dashboard excludes renewals from *acquisition* revenue).
 * Everything else is identical — including `packageId.startsWith("additional-")` separating
 * an additional pack from a plain one-time pack — so the two totals stay reconcilable, and
 * that one difference IS the expected delta.
 *
 * ⚠️ Renewals are identified by `data.billingReason`, NOT by the `isRenewal` boolean on the
 * model. `platformRevenueBreakdown.ts` states the same basis; using `isRenewal` makes the
 * numbers disagree with the dashboard.
 *
 * Returns null only for a `packageType` outside the model's enum, which the query already
 * excludes (see `paymentEventCategoryClause` in the service).
 */
export function classifyReceiptCategory(event: LeanReceiptEvent): ReceiptCategory | null {
  const packageType = event.packageType;
  if (packageType === "membership") {
    return event.billingReason === "subscription_cycle" ? "membership-renewal" : "membership-purchase";
  }
  if (packageType === "mini-draw") return "mini-draw";
  if (packageType === "upsell") return "upsell";
  if (packageType === "one-time") {
    return (event.packageId ?? "").startsWith("additional-") ? "additional-one-time" : "one-time-purchase";
  }
  return null;
}

/** One refund against a payment, as recorded on the `PaymentEvent` ledger. */
export interface ReceiptRefundRecord {
  /** "full" = RefundProcessed (the whole grant was reversed); "partial" = RefundPartial. */
  kind: "full" | "partial";
  /** ⚠️ CENTS — Stripe's unit. Only meaningful for "partial"; a full refund reverses the row. */
  amountCents: number;
  at: string | null;
}

/** paymentIntentId → its refund. Small by nature (198 refunds against 36.8k payments in prod). */
export type ReceiptRefundIndex = Map<string, ReceiptRefundRecord>;

export interface ReceiptRefundDerivation {
  refundStatus: ReceiptRefundStatus;
  refundedAmount: number;
  netAmount: number;
  refundedAt: string | null;
}

export const roundCurrency = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The refund-marking rule — the single definition used for BOTH the listed rows and the
 * filter totals, so the summary card can never disagree with the table beneath it.
 *
 * ⚠️ UNITS. `data.price` on a BenefitsGranted row is in DOLLARS; `data.refundAmount` on a
 * refund row is in CENTS (straight from Stripe). Never sum them without the /100.
 *
 * A full `RefundProcessed` reverses the entire grant, so the row nets to $0. That matches
 * the basis the dashboard uses when `fetchNetBenefitsGrantedWithMatch` drops refunded rows
 * outright — which is what lets the two totals reconcile. A `RefundPartial` (status
 * "partial-skipped": recorded, benefits deliberately NOT reversed) subtracts only its own
 * amount. Net is floored at 0 so an over-refund can never read as negative revenue.
 */
export function deriveReceiptRefund(
  amount: number,
  paymentIntentId: string | null | undefined,
  refunds: ReceiptRefundIndex
): ReceiptRefundDerivation {
  const refund = paymentIntentId ? refunds.get(paymentIntentId) : undefined;

  if (!refund) {
    return {
      refundStatus: "none",
      refundedAmount: 0,
      netAmount: roundCurrency(amount),
      refundedAt: null,
    };
  }

  if (refund.kind === "full") {
    return {
      refundStatus: "refunded",
      refundedAmount: roundCurrency(amount),
      netAmount: 0,
      refundedAt: refund.at,
    };
  }

  const refundedAmount = Math.min(roundCurrency(refund.amountCents / 100), roundCurrency(amount));
  return {
    refundStatus: "partially-refunded",
    refundedAmount,
    netAmount: roundCurrency(Math.max(amount - refundedAmount, 0)),
    refundedAt: refund.at,
  };
}

const CSV_HEADERS = [
  "Date",
  "First name",
  "Last name",
  "Email",
  "Category",
  "Package",
  "Amount (AUD)",
  "Refunded (AUD)",
  "Net (AUD)",
  "Status",
  "Stripe object",
  "Stripe customer",
];

const escapeCsvCell = (value: string): string => `"${String(value).replace(/"/g, '""')}"`;

/**
 * CSV for the current filter. UTF-8 BOM + CRLF so Excel on Windows opens it correctly —
 * the same convention as RevenueDetailModal's exporters.
 */
export function buildReceiptsCsv(rows: ReceiptRow[]): string {
  const BOM = "﻿";
  const body = rows.map((row) =>
    [
      row.timestamp ? row.timestamp.slice(0, 19).replace("T", " ") : "",
      row.customer.firstName,
      row.customer.lastName,
      row.customer.email,
      RECEIPT_CATEGORY_LABELS[row.category],
      row.packageName,
      row.amount.toFixed(2),
      row.refundedAmount.toFixed(2),
      row.netAmount.toFixed(2),
      RECEIPT_REFUND_STATUS_LABELS[row.refundStatus],
      row.stripe.objectLabel ?? "",
      row.stripe.customerId ?? "",
    ]
      .map(escapeCsvCell)
      .join(",")
  );
  return BOM + [CSV_HEADERS.join(","), ...body].join("\r\n");
}
