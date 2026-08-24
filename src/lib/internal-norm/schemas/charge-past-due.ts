import { z } from "zod";

const ChargeRunStatusSchema = z.enum(["running", "completed", "failed", "aborted"]);

const InvoiceChargeStatusSchema = z.enum(["success", "failed", "skipped"]);

const SkippedBreakdownSchema = z.object({
  total: z.number().int().nonnegative(),
  // Held back by the proactive per-invoice attempt cap — the card was submitted to
  // Stripe less than BULK_ATTEMPT_SPACING_DAYS ago. Largest bucket in a healthy
  // automated run, by design.
  attemptSpacing: z.number().int().nonnegative(),
  // Card is inside a Stripe Adaptive Acceptance block window (reactive cooldown).
  excessiveRetryCooldown: z.number().int().nonnegative(),
  recentlyAttempted: z.number().int().nonnegative(),
  noLongerPastDue: z.number().int().nonnegative(),
  alreadyPaid: z.number().int().nonnegative(),
  missingPaymentMethod: z.number().int().nonnegative(),
  // Stranded member with no re-billable held draft yet (self-heals next cycle).
  noHeldDraft: z.number().int().nonnegative(),
  // No payable attempt right now, but Stripe still has a scheduled retry.
  awaitingRetry: z.number().int().nonnegative(),
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
  recovery: z
    .object({
      bulk: z.boolean().optional(),
      step: z.string().optional(),
      newInvoiceId: z.string().optional(),
    })
    .optional()
    .describe(
      "Recovery provenance. `step` = machinery audit row (void/finalize/create), not a card outcome. " +
        "`bulk` = the run's single summary row for a recovered member. When `bulk` is set WITH " +
        "`newInvoiceId`, a separate coded row exists on that new invoice and carries the real decline — " +
        "count that one, not this. When `bulk` is set WITHOUT `newInvoiceId`, the recovery re-billed a " +
        "freshly minted cycle that did not settle and THIS row is the only record of the decline " +
        "(errorCode `rebill_not_settled`). Do not count both halves as two declines."
    ),
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
