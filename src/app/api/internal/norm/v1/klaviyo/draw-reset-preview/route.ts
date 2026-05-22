import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormKlaviyoDrawResetPreviewSchema } from "@/lib/internal-norm/schemas/klaviyo";
import { getKlaviyoDrawResetPreview } from "@/services/klaviyo/klaviyoDrawResetService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "klaviyo.draw-reset.preview",
    requiredPermission: "overview.view",
    responseSchema: NormKlaviyoDrawResetPreviewSchema,
  },
  async (ctx) => {
    const preview = await getKlaviyoDrawResetPreview();
    return ctx.ok({
      targetDraw: {
        id: preview.targetDraw.id,
        name: preview.targetDraw.name,
        status: preview.targetDraw.status,
        activationDate: preview.targetDraw.activationDate.toISOString(),
      },
      cutoffDate: preview.cutoffDate.toISOString(),
      totalUsers: preview.totalUsers,
      totalParticipants: preview.totalParticipants,
      skippedUsers: preview.skippedUsers,
      reductionPercentage: preview.reductionPercentage,
      sampleUsers: preview.sampleUsers,
    });
  }
);
