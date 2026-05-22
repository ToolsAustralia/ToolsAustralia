import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoEffectiveSchema } from "@/lib/internal-norm/schemas/promo";
import { PromoMultiplierResolverService } from "@/services/admin/PromoMultiplierResolverService";

const resolver = new PromoMultiplierResolverService();

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.effective",
    requiredPermission: "promos.view",
    responseSchema: NormPromoEffectiveSchema,
  },
  async (ctx) => {
    const effective = await resolver.getEffectiveMultipliers();
    return ctx.ok(effective);
  },
);
