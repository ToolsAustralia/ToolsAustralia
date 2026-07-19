import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMilestoneRewardsListSchema } from "@/lib/internal-norm/schemas/milestone-rewards";
import { MilestoneService } from "@/services/milestones";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "milestone-rewards.list",
    requiredPermission: "promos.view",
    responseSchema: NormMilestoneRewardsListSchema,
  },
  async (ctx) => {
    const rows = await MilestoneService.listRewardsWithPerformance();
    return ctx.ok({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        displayLabel: row.displayLabel,
        milestoneType: row.milestoneType,
        threshold: row.threshold,
        entriesAmount: row.entriesAmount,
        code: row.code,
        isActive: row.isActive,
        neverExpires: row.neverExpires,
        startsAt: row.startsAt ? row.startsAt.toISOString() : null,
        endsAt: row.endsAt ? row.endsAt.toISOString() : null,
        isRecurring: row.isRecurring,
        recurrencePeriod: row.recurrencePeriod,
        autoGrant: row.autoGrant,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        performance: row.performance,
      })),
      count: rows.length,
    });
  },
);
