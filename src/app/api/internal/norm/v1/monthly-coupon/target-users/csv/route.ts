import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMonthlyCouponTargetUsersCsvSchema } from "@/lib/internal-norm/schemas/monthly-coupon";
import { CsvImportService, TargetingService } from "@/services/redeemables";

const BodySchema = z.object({
  csvText: z.string().min(1),
});

export const POST = withNorm(
  {
    tier: "read",
    registryKey: "monthly-coupon.target-users.csv",
    requiredPermission: "promos.view",
    responseSchema: NormMonthlyCouponTargetUsersCsvSchema,
  },
  async (ctx) => {
    let body: unknown;
    try {
      body = await ctx.request.json();
    } catch {
      return ctx.error(400, "bad_body", "Body must be valid JSON");
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return ctx.error(400, "bad_body", "Invalid body", parsed.error.issues);
    }

    const csv = CsvImportService.parseUserIdentifiers(parsed.data.csvText);
    const userIds = await TargetingService.resolveTargetUserIds({
      targetingMode: "csv-users",
      csvUserIds: csv.userIds,
    });

    return ctx.ok({
      userIds,
      count: userIds.length,
      invalidRows: csv.invalidRows,
    });
  },
);
