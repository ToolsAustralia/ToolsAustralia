// src/lib/internal-norm/schemas/common.ts
import { z } from "zod";

export const NormDateRangeSchema = z.object({
  range: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]),
  start: z.string().describe("ISO 8601 UTC"),
  end: z.string().describe("ISO 8601 UTC"),
});

export const NormErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export const NormOkEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data, requestId: z.string() });
