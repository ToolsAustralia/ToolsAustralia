/**
 * Daily Metrics Validation Schemas
 * 
 * Zod schemas for validating daily metrics API requests.
 */

import { z } from "zod";

export const dailyMetricsQuerySchema = z.object({
  startDate: z
    .union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ])
    .transform((val) => {
      // Handle both ISO datetime strings and YYYY-MM-DD format
      if (typeof val === "string") {
        if (val.includes("T")) {
          return new Date(val);
        }
        // YYYY-MM-DD format - set to start of day UTC
        return new Date(val + "T00:00:00.000Z");
      }
      return val;
    }),
  endDate: z
    .union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ])
    .transform((val) => {
      if (typeof val === "string") {
        if (val.includes("T")) {
          return new Date(val);
        }
        // YYYY-MM-DD format - set to end of day UTC
        return new Date(val + "T23:59:59.999Z");
      }
      return val;
    }),
}).refine((data) => {
  // Ensure endDate is after startDate
  return data.endDate >= data.startDate;
}, {
  message: "endDate must be after or equal to startDate",
}).refine((data) => {
  // Limit date range to prevent excessive queries (max 2 years)
  const maxDays = 730;
  const diffTime = Math.abs(data.endDate.getTime() - data.startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= maxDays;
}, {
  message: "Date range cannot exceed 2 years",
});

export type DailyMetricsQueryInput = z.infer<typeof dailyMetricsQuerySchema>;

