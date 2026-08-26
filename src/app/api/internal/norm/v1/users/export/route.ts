import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUsersExportAggregateSchema } from "@/lib/internal-norm/schemas/users";
import { aggregateUserExport } from "@/services/admin/UserAdminQueryService";

// Aggregate-only Norm projection. Unlike the admin CSV/Excel route, this
// endpoint returns counts grouped by state/package/subscription status — never
// per-user rows. The counts use the same `buildUserFilter` as the admin export
// so the totalCount equals the admin CSV row count.
const QuerySchema = z.object({
  search: z.string().max(200).optional(),
  subscriptionStatus: z.string().max(50).optional(),
  autoRenew: z.enum(["true", "false"]).optional(),
  membershipPackage: z.string().max(100).optional(),
  role: z.enum(["user", "admin"]).optional(),
  dateFrom: z.string().max(50).optional(),
  dateTo: z.string().max(50).optional(),
  inActiveMajorDraw: z.enum(["yes", "no"]).optional(),
  miniDrawPackage: z.enum(["yes", "no"]).optional(),
  inActiveMiniDraw: z.enum(["yes", "no"]).optional(),
  segment: z.enum(["top20MajorDraw"]).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.export",
    requiredPermission: "users.export",
    responseSchema: NormUsersExportAggregateSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const states = ctx.url.searchParams.getAll("state").map((s) => s.trim()).filter(Boolean);

    const result = await aggregateUserExport({
      search: parsed.data.search,
      subscriptionStatus: parsed.data.subscriptionStatus,
      autoRenew: parsed.data.autoRenew,
      membershipPackage: parsed.data.membershipPackage,
      role: parsed.data.role,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      states,
      inActiveMajorDraw: parsed.data.inActiveMajorDraw,
      miniDrawPackage: parsed.data.miniDrawPackage,
      inActiveMiniDraw: parsed.data.inActiveMiniDraw,
      segment: parsed.data.segment,
    });

    return ctx.ok(result);
  },
);
