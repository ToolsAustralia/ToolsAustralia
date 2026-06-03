import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAffiliateListSchema } from "@/lib/internal-norm/schemas/affiliate";
import {
  listAffiliates,
  resolveAffiliateListSortKey,
} from "@/services/affiliate/AffiliateAdminListService";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "affiliate.list",
    requiredPermission: "affiliates.view",
    responseSchema: NormAffiliateListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(ctx.url.searchParams.entries()),
    );
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const result = await listAffiliates({
      page: parsed.data.page,
      limit: parsed.data.limit,
      search: parsed.data.search ?? "",
      sort: resolveAffiliateListSortKey(parsed.data.sort ?? "createdAt"),
      order: parsed.data.order,
    });

    return ctx.ok({
      affiliates: result.affiliates.map((a) => ({
        id: a.id,
        name: a.name,
        username: a.username,
        affiliateCode: a.affiliateCode,
        affiliateLink: a.affiliateLink,
        isActive: a.isActive,
        totalSignups: a.totalSignups,
        totalSales: a.totalSales,
        totalCommissions: a.totalCommissions,
        unpaidCommissions: a.unpaidCommissions,
        unpaidAmount: a.unpaidAmount,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
        updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : String(a.updatedAt),
      })),
      pagination: result.pagination,
    });
  },
);
