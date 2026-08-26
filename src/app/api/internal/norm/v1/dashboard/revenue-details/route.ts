import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormRevenueDetailsSchema, toNormRevenueUserRow } from "@/lib/internal-norm/schemas/dashboard";
import {
  getRevenueDetails,
  resolveRevenueDetailsRange,
  type RevenueDetailsCategory,
  type RevenueDetailsDateRange,
} from "@/services/admin/dashboardSlices";

const QuerySchema = z.object({
  category: z.enum([
    "membership-purchase",
    "membership-renewal",
    "one-time-purchase",
    "additional-one-time",
    "mini-draw",
    "upsell",
    "shop",
  ]),
  dateRange: z
    .enum(["today", "yesterday", "all-time", "custom", "current-draw", "last-draw"])
    .default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "dashboard.revenue-details",
    requiredPermission: "overview.view",
    responseSchema: NormRevenueDetailsSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const rangeResult = resolveRevenueDetailsRange({
      dateRange: parsed.data.dateRange as RevenueDetailsDateRange,
      startDateParam: parsed.data.startDate ?? null,
      endDateParam: parsed.data.endDate ?? null,
    });
    if (!rangeResult.ok) return ctx.error(rangeResult.status, "bad_query", rangeResult.error);

    const data = await getRevenueDetails({
      category: parsed.data.category as RevenueDetailsCategory,
      startDate: rangeResult.value.startDate,
      endDate: rangeResult.value.endDate,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });

    return ctx.ok({
      category: data.category,
      totalRevenue: data.totalRevenue,
      totalPurchases: data.totalPurchases,
      totalUsers: data.totalUsers,
      // PII-safe projection (firstName + opaque userId only) — shared via toNormRevenueUserRow.
      users: data.users.map(toNormRevenueUserRow),
      pagination: data.pagination,
    });
  },
);
