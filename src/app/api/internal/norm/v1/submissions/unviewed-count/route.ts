import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormSubmissionsUnviewedCountSchema } from "@/lib/internal-norm/schemas/submissions";
import { getUnviewedSubmissionsCount } from "@/services/admin/submissionsCountService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "submissions.unviewed-count",
    requiredPermission: "overview.view",
    responseSchema: NormSubmissionsUnviewedCountSchema,
  },
  async (ctx) => {
    const data = await getUnviewedSubmissionsCount();
    return ctx.ok(data);
  }
);
