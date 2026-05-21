import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";

const HealthResponseSchema = z.object({
  ok: z.literal(true),
  serverTime: z.string(),
  version: z.literal(1),
});

export const GET = withNorm(
  { tier: "read", registryKey: "health", requiredPermission: "overview.view", responseSchema: HealthResponseSchema },
  async (ctx) => ctx.ok({ ok: true as const, serverTime: new Date().toISOString(), version: 1 as const })
);
