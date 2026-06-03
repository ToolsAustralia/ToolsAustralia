import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormProjectedIncomeSchema } from "@/lib/internal-norm/schemas/dashboard";
import { getProjectedIncome } from "@/services/admin/dashboardSlices";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "dashboard.projected-income",
    requiredPermission: "overview.view",
    responseSchema: NormProjectedIncomeSchema,
  },
  async (ctx) => {
    const data = await getProjectedIncome();
    return ctx.ok(data);
  },
);
