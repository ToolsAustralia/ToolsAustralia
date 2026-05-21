import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAffiliateDetailSchema } from "@/lib/internal-norm/schemas/affiliate";
import {
  getAffiliateDetail,
  isValidAffiliateId,
  resolveAffiliateDetailSortField,
  resolveAffiliateReferredSortKey,
} from "@/services/affiliate/AffiliateAdminListService";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(50).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().max(200).optional(),
  referredPage: z.coerce.number().int().min(1).default(1),
  referredPageSize: z.coerce.number().int().min(1).max(50).default(10),
  referredSort: z.string().max(50).optional(),
  referredOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "affiliate.get",
    requiredPermission: "affiliates.view",
    responseSchema: NormAffiliateDetailSchema,
  },
  async (ctx) => {
    const id = ctx.param(0) ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing affiliate id");
    if (!isValidAffiliateId(id)) {
      return ctx.error(400, "bad_path", "Invalid affiliate id");
    }

    const parsed = QuerySchema.safeParse(
      Object.fromEntries(ctx.url.searchParams.entries()),
    );
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const result = await getAffiliateDetail({
      id,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      sort: resolveAffiliateDetailSortField(parsed.data.sort ?? "earnedAt"),
      order: parsed.data.order,
      q: parsed.data.q ?? "",
      referredPage: parsed.data.referredPage,
      referredPageSize: parsed.data.referredPageSize,
      referredSort: resolveAffiliateReferredSortKey(parsed.data.referredSort ?? "referredAt"),
      referredOrder: parsed.data.referredOrder,
    });

    if (!result) return ctx.error(404, "not_found", "Affiliate not found");

    return ctx.ok({
      affiliate: {
        id: result.affiliate.id,
        name: result.affiliate.name,
        username: result.affiliate.username,
        affiliateCode: result.affiliate.affiliateCode,
        affiliateLink: result.affiliate.affiliateLink,
        isActive: result.affiliate.isActive,
        commissionRate: result.affiliate.commissionRate,
        totalSignups: result.affiliate.totalSignups,
        totalSales: result.affiliate.totalSales,
        totalCommissions: result.affiliate.totalCommissions,
        createdAt:
          result.affiliate.createdAt instanceof Date
            ? result.affiliate.createdAt.toISOString()
            : String(result.affiliate.createdAt),
        updatedAt:
          result.affiliate.updatedAt instanceof Date
            ? result.affiliate.updatedAt.toISOString()
            : String(result.affiliate.updatedAt),
      },
      referredUsers: result.referredUsers.map((u) => ({
        id: u.id,
        referredAt:
          u.referredAt instanceof Date ? u.referredAt.toISOString() : String(u.referredAt),
      })),
      referredUsersPagination: result.referredUsersPagination,
      commissions: result.commissions.map((c) => ({
        id: c.id,
        type: c.type,
        packageName: c.packageName,
        purchaseAmount: c.purchaseAmount,
        commissionAmount: c.commissionAmount,
        status: c.status,
        earnedAt: c.earnedAt instanceof Date ? c.earnedAt.toISOString() : String(c.earnedAt),
        paidAt: c.paidAt
          ? c.paidAt instanceof Date
            ? c.paidAt.toISOString()
            : String(c.paidAt)
          : null,
        referredUserId: c.referredUser ? c.referredUser.id : null,
      })),
      commissionsPagination: result.commissionsPagination,
      pendingCommissionsSummary: result.pendingCommissionsSummary,
      payouts: result.payouts.map((p) => ({
        // PII redaction: name + email of the processing admin are dropped from
        // the Norm projection; only the User._id correlation key is retained.
        id: p.id,
        totalAmount: p.totalAmount,
        commissionCount: p.commissionCount,
        paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
        processedByUserId: p.processedBy?.id || null,
        notes: p.notes ?? null,
      })),
    });
  },
);
