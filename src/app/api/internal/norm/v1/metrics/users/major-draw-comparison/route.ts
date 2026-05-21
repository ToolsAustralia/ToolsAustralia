import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUserMajorDrawComparisonSchema } from "@/lib/internal-norm/schemas/metrics";
import { UserMajorDrawComparisonService } from "@/services/metrics/UserMajorDrawComparisonService";

const QuerySchema = z.object({
  currentDrawId: z.string().min(1),
  previousDrawId: z.string().min(1),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "metrics.users.major-draw-comparison",
    requiredPermission: "overview.view",
    responseSchema: NormUserMajorDrawComparisonSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    let result;
    try {
      result = await new UserMajorDrawComparisonService().getUserMajorDrawComparison(
        parsed.data.currentDrawId,
        parsed.data.previousDrawId
      );
    } catch (e) {
      const msg = (e as Error).message || "Comparison failed";
      if (msg.includes("not found")) {
        return ctx.error(404, "not_found", msg);
      }
      throw e;
    }

    return ctx.ok({
      currentDrawInfo: {
        id: result.currentDrawInfo.id,
        name: result.currentDrawInfo.name,
        drawDate: result.currentDrawInfo.drawDate.toISOString(),
        activationDate: result.currentDrawInfo.activationDate.toISOString(),
      },
      previousDrawInfo: {
        id: result.previousDrawInfo.id,
        name: result.previousDrawInfo.name,
        drawDate: result.previousDrawInfo.drawDate.toISOString(),
        activationDate: result.previousDrawInfo.activationDate.toISOString(),
      },
      currentDrawTotal: result.currentDrawTotal,
      previousDrawTotal: result.previousDrawTotal,
      comparison: result.comparison,
    });
  }
);
