/**
 * Monthly Comparison Validation Schemas
 * 
 * Zod schemas for validating monthly comparison API requests.
 */

import { z } from "zod";

export const monthlyComparisonQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, {
    message: "Month must be in YYYY-MM format",
  }).refine((val) => {
    // Validate month is valid (01-12)
    const [, month] = val.split("-");
    const monthNum = parseInt(month, 10);
    return monthNum >= 1 && monthNum <= 12;
  }, {
    message: "Month must be between 01 and 12",
  }),
});

export type MonthlyComparisonQueryInput = z.infer<typeof monthlyComparisonQuerySchema>;

