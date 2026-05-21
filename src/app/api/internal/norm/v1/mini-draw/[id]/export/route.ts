import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMiniDrawExportAggregateSchema } from "@/lib/internal-norm/schemas/mini-draw";
import { getMiniDrawExportAggregate } from "@/services/admin/MiniDrawService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "mini-draw.export",
    requiredPermission: "miniDraws.view",
    responseSchema: NormMiniDrawExportAggregateSchema,
  },
  async (ctx) => {
    // /api/internal/norm/v1/mini-draw/<id>/export
    const parts = ctx.url.pathname.split("/").filter(Boolean);
    // parts: ["api","internal","norm","v1","mini-draw","<id>","export"]
    const id = parts[parts.length - 2] ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing mini-draw id");

    const outcome = await getMiniDrawExportAggregate(id);
    if (!outcome.ok) {
      if (outcome.code === "bad_id") {
        return ctx.error(400, "bad_id", "Invalid mini-draw id");
      }
      return ctx.error(404, "not_found", "Mini draw not found");
    }
    return ctx.ok(outcome.data);
  },
);
