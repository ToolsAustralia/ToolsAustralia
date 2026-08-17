import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormReceiptsListSchema } from "@/lib/internal-norm/schemas/receipts";
import {
  getReceipts,
  RECEIPTS_DEFAULT_LIMIT,
  RECEIPTS_MAX_LIMIT,
} from "@/services/admin/receipts";
import { RECEIPT_CATEGORIES, RECEIPT_REFUND_STATUSES } from "@/utils/admin/receipts";
import { resolveNormDateRange, type NormRangeKey } from "@/utils/admin/resolveNormDateRange";

const QuerySchema = z.object({
  range: z
    .enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"])
    .default("today"),
  start: z.string().optional(),
  end: z.string().optional(),
  category: z.enum(RECEIPT_CATEGORIES as [string, ...string[]]).optional(),
  status: z.enum(RECEIPT_REFUND_STATUSES as [string, ...string[]]).optional(),
  packageName: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(RECEIPTS_MAX_LIMIT).default(RECEIPTS_DEFAULT_LIMIT),
});

/**
 * GET /v1/receipts — the revenue ledger, mirroring `GET /api/admin/receipts`.
 *
 * Wraps the SAME `getReceipts` service the admin route calls, so the numbers cannot drift
 * between the two surfaces. The projection below is the only difference: it drops lastName,
 * email, the Stripe customer id and the dashboard URLs (see schemas/receipts.ts).
 */
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "receipts.list",
    requiredPermission: "receipts.view",
    responseSchema: NormReceiptsListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const { range, start, end, category, status, packageName, page, limit } = parsed.data;

    let startDate: Date;
    let endDate: Date;
    try {
      ({ startDate, endDate } = await resolveNormDateRange({ range: range as NormRangeKey, start, end }));
    } catch (error) {
      return ctx.error(400, "bad_query", error instanceof Error ? error.message : "Invalid date range");
    }

    const result = await getReceipts({
      startDate,
      endDate,
      category: category as (typeof RECEIPT_CATEGORIES)[number] | undefined,
      status: status as (typeof RECEIPT_REFUND_STATUSES)[number] | undefined,
      packageName,
      page,
      limit,
    });

    return ctx.ok({
      dateRange: { range, start: startDate.toISOString(), end: endDate.toISOString() },
      category: category ?? null,
      totals: result.totals,
      // PII boundary lives here: firstName + opaque userId, never lastName / email /
      // stripeCustomerId. `stripe.objectLabel` is the transaction id, not a person.
      rows: result.rows.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        category: row.category,
        packageName: row.packageName,
        amount: row.amount,
        refundStatus: row.refundStatus,
        refundedAmount: row.refundedAmount,
        netAmount: row.netAmount,
        refundedAt: row.refundedAt,
        userId: row.customer.userId,
        firstName: row.customer.firstName,
        stripeObjectId: row.stripe.objectLabel,
      })),
      pagination: result.pagination,
    });
  },
);
