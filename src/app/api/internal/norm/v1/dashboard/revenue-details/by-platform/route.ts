import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPlatformRevenueBreakdownSchema, toNormRevenueUserRow } from "@/lib/internal-norm/schemas/dashboard";
import { resolveRevenueDetailsRange, type RevenueDetailsDateRange } from "@/services/admin/dashboardSlices";
import {
  getPlatformRevenueBreakdown,
  type AcquisitionCategory,
} from "@/services/admin/platformRevenueBreakdown";
import { type AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

const QuerySchema = z.object({
  platform: z.enum(["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "google", "direct", "other"]),
  category: z
    .enum(["membership-purchase", "one-time-purchase", "additional-one-time", "mini-draw", "upsell"])
    .optional(),
  dateRange: z.enum(["today", "yesterday", "all-time", "custom", "current-draw", "last-draw"]).default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  // NOT z.coerce.boolean(): Boolean("false") is true, so ?summaryOnly=false would wrongly
  // drop the buyer list. Match the admin route's === "true" semantics; absent → false.
  summaryOnly: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "dashboard.revenue-details.by-platform",
    requiredPermission: "overview.view",
    responseSchema: NormPlatformRevenueBreakdownSchema,
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

    const data = await getPlatformRevenueBreakdown({
      platform: parsed.data.platform as AttributedPlatformKey,
      startDate: rangeResult.value.startDate,
      endDate: rangeResult.value.endDate,
      category: parsed.data.category as AcquisitionCategory | undefined,
      page: parsed.data.page,
      limit: parsed.data.limit,
      summaryOnly: parsed.data.summaryOnly,
    });

    return ctx.ok({
      platform: data.platform,
      byCategory: data.byCategory,
      totalRevenue: data.totalRevenue,
      totalPurchases: data.totalPurchases,
      totalUsers: data.totalUsers,
      // PII-safe projection (firstName + opaque userId only) — shared with the sibling
      // revenue-details route via toNormRevenueUserRow so the PII boundary stays single-source.
      users: data.users.map(toNormRevenueUserRow),
      pagination: data.pagination,
    });
  },
);
