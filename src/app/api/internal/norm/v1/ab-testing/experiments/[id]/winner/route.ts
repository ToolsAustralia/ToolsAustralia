import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormExperimentWinnerSchema } from "@/lib/internal-norm/schemas/ab-testing";
import ExperimentAnalyticsService from "@/services/ab-testing/ExperimentAnalyticsService";
import { isValidExperimentId } from "@/services/ab-testing/ExperimentService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "ab-testing.experiment.winner.get",
    requiredPermission: "abTesting.view",
    responseSchema: NormExperimentWinnerSchema,
  },
  async (ctx) => {
    // /api/internal/norm/v1/ab-testing/experiments/<id>/winner
    const parts = ctx.url.pathname.split("/").filter(Boolean);
    const experimentId = parts[parts.length - 2] ?? "";
    if (!experimentId) return ctx.error(400, "bad_path", "Missing experiment id");
    if (!isValidExperimentId(experimentId)) {
      return ctx.error(400, "bad_path", "Invalid experiment id");
    }

    try {
      const info = await ExperimentAnalyticsService.getExperimentWinnerInfo(experimentId);
      return ctx.ok(info);
    } catch (err) {
      if (err instanceof Error && err.message === "experiment_not_found") {
        return ctx.error(404, "not_found", "Experiment not found");
      }
      throw err;
    }
  },
);
