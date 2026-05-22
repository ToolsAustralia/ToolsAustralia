import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAllowlistStatsSchema } from "@/lib/internal-norm/schemas/allowlist";
import { getAllowlistService } from "@/services/allowlist";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "allowlist.stats",
    requiredPermission: "users.view",
    responseSchema: NormAllowlistStatsSchema,
  },
  async (ctx) => {
    const stats = await getAllowlistService().getStats();
    return ctx.ok(stats);
  }
);
