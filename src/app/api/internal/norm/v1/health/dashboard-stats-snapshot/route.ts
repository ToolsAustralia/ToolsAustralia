import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormDashboardStatsSnapshotHealthSchema } from "@/lib/internal-norm/schemas/health";
import { getDashboardStatsSnapshotHealth } from "@/services/admin/dashboard-stats/snapshotHealth";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "health.dashboard-stats-snapshot",
    requiredPermission: "overview.view",
    responseSchema: NormDashboardStatsSnapshotHealthSchema,
  },
  async (ctx) => {
    const result = await getDashboardStatsSnapshotHealth();
    return ctx.ok(result);
  },
);
