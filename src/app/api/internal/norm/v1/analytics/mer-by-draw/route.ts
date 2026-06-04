import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMerByDrawSchema } from "@/lib/internal-norm/schemas/mer";
import { getMerByDraw } from "@/services/admin/mer/merByDrawService";

/**
 * GET /v1/analytics/mer-by-draw
 * Marketing Efficiency Ratio (New Revenue ÷ Ad Spend) per major draw, with a
 * per-platform breakdown. Self-contained (no params). Wraps the same service the
 * admin Overview MER card uses, so the numbers match by construction.
 */
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.mer-by-draw",
    requiredPermission: "overview.view",
    responseSchema: NormMerByDrawSchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const rows = await getMerByDraw();
    return ctx.ok({
      rows: rows.map((r) => ({
        drawName: r.drawName,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        inProgress: r.inProgress,
        newRevenue: r.newRevenue,
        adSpend: r.adSpend,
        mer: r.mer,
        platforms: r.platforms.map((p) => ({
          platform: p.platform,
          newRevenue: p.newRevenue,
          adSpend: p.adSpend,
          spendStatus: p.spendStatus,
          mer: p.mer,
        })),
      })),
    });
  }
);
