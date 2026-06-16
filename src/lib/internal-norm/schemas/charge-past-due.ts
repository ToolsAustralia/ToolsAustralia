import { z } from "zod";

const ChargeRunStatusSchema = z.enum(["running", "completed", "failed", "aborted"]);

const InvoiceChargeStatusSchema = z.enum(["success", "failed", "skipped"]);

const SkippedBreakdownSchema = z.object({
  total: z.number().int().nonnegative(),
  recentlyAttempted: z.number().int().nonnegative(),
  noLongerPastDue: z.number().int().nonnegative(),
  alreadyPaid: z.number().int().nonnegative(),
  missingPaymentMethod: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
});

const ChargeRunTotalsSchema = z.object({
  eligibleCount: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: SkippedBreakdownSchema,
  revenueCents: z.number().int().nonnegative(),
});

const ChargeRunRowSchema = z.object({
  id: z.string(),
  startedAt: z.string().describe("ISO 8601 UTC"),
  finishedAt: z.string().nullable().describe("ISO 8601 UTC, null while still running"),
  durationMs: z.number().int().nonnegative().nullable(),
  adminId: z.string(),
  adminName: z.string(),
  status: ChargeRunStatusSchema,
  kind: z
    .enum(["charge", "recover"])
    .describe("charge = past-due bulk charge; recover = stranded-invoice recovery (void/finalize→pay)"),
  totals: ChargeRunTotalsSchema,
});

const InvoiceChargeRowSchema = z.object({
  invoiceId: z.string(),
  customerId: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  status: InvoiceChargeStatusSchema,
  amount: z.number().describe("Stripe currency unit (cents)"),
  attemptedAt: z.string().describe("ISO 8601 UTC"),
  errorCode: z.string().optional(),
  declineCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

const ManualRetryRowSchema = InvoiceChargeRowSchema.extend({
  adminId: z.string(),
  adminName: z.string(),
});

export const NormChargePastDueDeclineSummarySchema = z.object({
  totalFailed: z.number().int().nonnegative(),
  topCodes: z.array(
    z.object({
      code: z.string(),
      count: z.number().int().nonnegative(),
      pct: z.number().int().min(0).max(100).describe("Whole-number percent of totalFailed"),
    })
  ),
});

export const NormChargePastDueRunsListSchema = z.object({
  runs: z.array(ChargeRunRowSchema),
  total: z.number().int().nonnegative(),
});

export const NormChargePastDueRunDetailSchema = z.object({
  run: ChargeRunRowSchema,
  rows: z.array(InvoiceChargeRowSchema),
});

export const NormChargePastDueManualRetriesListSchema = z.object({
  rows: z.array(ManualRetryRowSchema),
  total: z.number().int().nonnegative(),
});
