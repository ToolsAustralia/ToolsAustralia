import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormExperimentAnalyticsSchema } from "@/lib/internal-norm/schemas/ab-testing";
import ExperimentAnalyticsService from "@/services/ab-testing/ExperimentAnalyticsService";
import { isValidExperimentId } from "@/services/ab-testing/ExperimentService";

const QuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  variantId: z.string().max(50).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "ab-testing.experiment-analytics",
    requiredPermission: "abTesting.view",
    responseSchema: NormExperimentAnalyticsSchema,
  },
  async (ctx) => {
    const experimentId = ctx.param(1) ?? "";
    if (!experimentId) return ctx.error(400, "bad_path", "Missing experiment id");
    if (!isValidExperimentId(experimentId)) {
      return ctx.error(400, "bad_path", "Invalid experiment id");
    }

    const parsed = QuerySchema.safeParse(
      Object.fromEntries(ctx.url.searchParams.entries()),
    );
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const { startDate, endDate, variantId } = parsed.data;
    const dateRange =
      startDate && endDate
        ? { startDate: new Date(startDate), endDate: new Date(endDate) }
        : undefined;

    try {
      const summary = await ExperimentAnalyticsService.getExperimentAnalyticsSummary(
        experimentId,
        dateRange,
        variantId,
      );
      return ctx.ok(summary);
    } catch (err) {
      if (err instanceof Error && err.message === "experiment_not_found") {
        return ctx.error(404, "not_found", "Experiment not found");
      }
      throw err;
    }
  },
);
