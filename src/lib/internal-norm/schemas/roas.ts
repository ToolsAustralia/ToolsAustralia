import { z } from "zod";
import { NormDateRangeSchema } from "./common";

export const NormRoasSummarySchema = z.object({
  dateRange: NormDateRangeSchema,
  spend: z.number(),
  revenue: z.number(),
  profit: z.number(),
  roas: z.number(),
  conversions: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  cpc: z.number(),
});

export const NormRoasBreakdownItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.enum(["campaign", "adset", "ad"]),
  spend: z.number(),
  revenue: z.number(),
  profit: z.number(),
  roas: z.number(),
  conversions: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  cpc: z.number(),
});

export const NormRoasBreakdownSchema = NormRoasSummarySchema.extend({
  level: z.enum(["campaign", "adset", "ad"]),
  breakdown: z.array(NormRoasBreakdownItemSchema),
});
