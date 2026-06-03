import { z } from "zod";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

const PromoMultiplierLiteral = z.union(
  PROMO_MULTIPLIERS.map((m) => z.literal(m)) as unknown as [
    z.ZodLiteral<number>,
    z.ZodLiteral<number>,
    ...z.ZodLiteral<number>[],
  ]
);

export const NormUpsellMultipliersSchema = z.object({
  membership: PromoMultiplierLiteral,
  oneTime: PromoMultiplierLiteral,
  additional: PromoMultiplierLiteral,
  updatedAt: z.string().describe("ISO 8601 UTC"),
});
