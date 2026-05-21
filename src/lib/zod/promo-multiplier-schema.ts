import { z } from "zod";
import { PROMO_MULTIPLIERS, type PromoMultiplier } from "@/types/promo-multiplier";

/** Union of literals so Zod inference matches `PromoMultiplier` (scheduled calendar, PATCH bodies). */
export const zPromoMultiplier = z.union(
  PROMO_MULTIPLIERS.map((m) => z.literal(m)) as [
    z.ZodLiteral<PromoMultiplier>,
    z.ZodLiteral<PromoMultiplier>,
    ...z.ZodLiteral<PromoMultiplier>[],
  ]
) satisfies z.ZodType<PromoMultiplier>;

export const zPromoMultiplierOrNull = z.union([zPromoMultiplier, z.null()]);

/** String form from admin create (legacy). */
export const zPromoMultiplierFromStringEnum = z
  .enum(PROMO_MULTIPLIERS.map(String) as [string, string, ...string[]])
  .transform((val) => parseInt(val, 10) as PromoMultiplier);
