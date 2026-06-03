import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMajorDrawCurrentAndLastSchema } from "@/lib/internal-norm/schemas/major-draw";
import { getCurrentAndLastDrawRanges } from "@/services/admin/MajorDrawService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "major-draw.current-and-last",
    requiredPermission: "majorDraw.view",
    responseSchema: NormMajorDrawCurrentAndLastSchema,
  },
  async (ctx) => {
    const data = await getCurrentAndLastDrawRanges();
    return ctx.ok(data);
  },
);
