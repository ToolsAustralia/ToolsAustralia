import { z } from "zod";
import type { PromoMultiplier } from "@/types/promo-multiplier";

/** Union of literals so Zod inference matches `PromoMultiplier` (scheduled calendar, PATCH bodies). */
export const zPromoMultiplier = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(10),
  z.literal(12),
  z.literal(15),
  z.literal(20),
]) satisfies z.ZodType<PromoMultiplier>;

export const zPromoMultiplierOrNull = z.union([zPromoMultiplier, z.null()]);

/** String form from admin create (legacy). */
export const zPromoMultiplierFromStringEnum = z
  .enum(["2", "3", "5", "10", "12", "15", "20"])
  .transform((val) => parseInt(val, 10) as PromoMultiplier);
