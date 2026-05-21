import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUpsellMultipliersSchema } from "@/lib/internal-norm/schemas/upsell";
import { getUpsellMultiplierConfig } from "@/services/upsell/UpsellMultiplierResolver";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "upsell-multipliers.list",
    requiredPermission: "overview.view",
    responseSchema: NormUpsellMultipliersSchema,
  },
  async (ctx) => {
    const config = await getUpsellMultiplierConfig();
    return ctx.ok({
      membership: config.membership,
      oneTime: config.oneTime,
      additional: config.additional,
      updatedAt: config.updatedAt.toISOString(),
    });
  }
);
