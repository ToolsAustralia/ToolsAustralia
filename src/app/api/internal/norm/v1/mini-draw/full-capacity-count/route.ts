import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMiniDrawFullCapacityCountSchema } from "@/lib/internal-norm/schemas/mini-draw";
import { getMiniDrawFullCapacityCount } from "@/services/admin/MiniDrawService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "mini-draw.full-capacity-count",
    requiredPermission: "miniDraws.view",
    responseSchema: NormMiniDrawFullCapacityCountSchema,
  },
  async (ctx) => {
    const data = await getMiniDrawFullCapacityCount();
    return ctx.ok(data);
  },
);
