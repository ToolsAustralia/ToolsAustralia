import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormManifestSchema } from "@/lib/internal-norm/schemas/manifest";
// Generated JSON is committed; import directly so manifest endpoint stays in lockstep with the build artifact.
import manifest from "@/generated/normToolsManifest.json";

export const GET = withNorm(
  { tier: "read", registryKey: "manifest", requiredPermission: "overview.view", responseSchema: NormManifestSchema },
  async (ctx) => ctx.ok(manifest)
);
