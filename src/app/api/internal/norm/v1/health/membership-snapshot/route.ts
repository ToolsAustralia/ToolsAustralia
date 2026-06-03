import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMembershipSnapshotHealthSchema } from "@/lib/internal-norm/schemas/health";
import { getMembershipSnapshotHealth } from "@/services/admin/dashboard-stats/snapshotHealth";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "health.membership-snapshot",
    requiredPermission: "overview.view",
    responseSchema: NormMembershipSnapshotHealthSchema,
  },
  async (ctx) => {
    const result = await getMembershipSnapshotHealth();
    return ctx.ok(result);
  },
);
