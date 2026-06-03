import { z } from "zod";

export const NormSubmissionsUnviewedCountSchema = z.object({
  contact: z.number().int().nonnegative(),
  partner: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
