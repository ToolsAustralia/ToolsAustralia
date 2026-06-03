import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormKlaviyoDrawResetProgressSchema } from "@/lib/internal-norm/schemas/klaviyo";
import { getKlaviyoDrawResetProgress } from "@/services/klaviyo/klaviyoDrawResetService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "klaviyo.draw-reset.progress",
    requiredPermission: "overview.view",
    responseSchema: NormKlaviyoDrawResetProgressSchema,
  },
  async (ctx) => {
    const progress = getKlaviyoDrawResetProgress();
    return ctx.ok(progress);
  }
);
