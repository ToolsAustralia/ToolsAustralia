import { z } from "zod";

export const NormPendingActionStatusSchema = z.object({
  id: z.string(),
  registryKey: z.string(),
  status: z.enum(["pending", "approved", "denied", "expired"]),
  resolvedAt: z.string().optional(),
  resolutionOutcome: z.object({ ok: z.boolean(), errorCode: z.string().optional() }).optional(),
});
