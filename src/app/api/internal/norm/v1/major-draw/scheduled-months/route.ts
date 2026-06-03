import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMajorDrawScheduledMonthsSchema } from "@/lib/internal-norm/schemas/major-draw";
import { getScheduledDrawMonths } from "@/services/admin/MajorDrawService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "major-draw.scheduled-months",
    requiredPermission: "majorDraw.view",
    responseSchema: NormMajorDrawScheduledMonthsSchema,
  },
  async (ctx) => {
    const data = await getScheduledDrawMonths();
    return ctx.ok(data);
  },
);
