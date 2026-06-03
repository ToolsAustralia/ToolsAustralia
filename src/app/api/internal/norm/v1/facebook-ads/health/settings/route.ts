import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormFacebookAdsHealthSettingsSchema } from "@/lib/internal-norm/schemas/facebook-ads-health";
import { getOrInitSettings } from "@/services/facebook-ads-health/settingsService";

// Read the tunable verdict-engine thresholds. withNorm connects the DB before
// the handler runs, so getOrInitSettings can upsert/read directly. The PUT
// (mutating) counterpart is a roadmap `write_safe` entry and is not wired.
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "facebook-ads.health.settings",
    requiredPermission: "facebookAds.view",
    responseSchema: NormFacebookAdsHealthSettingsSchema,
  },
  async (ctx) => {
    const settings = await getOrInitSettings();
    return ctx.ok(settings);
  },
);
