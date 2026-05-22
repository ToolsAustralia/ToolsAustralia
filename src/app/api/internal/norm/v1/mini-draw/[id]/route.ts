import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMiniDrawGetSchema } from "@/lib/internal-norm/schemas/mini-draw";
import { getMiniDrawDetail } from "@/services/admin/MiniDrawService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "mini-draw.get",
    requiredPermission: "miniDraws.view",
    responseSchema: NormMiniDrawGetSchema,
  },
  async (ctx) => {
    const id = ctx.param(0) ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing mini-draw id");

    const outcome = await getMiniDrawDetail(id);
    if (!outcome.ok) {
      if (outcome.code === "bad_id") {
        return ctx.error(400, "bad_id", "Invalid mini-draw id");
      }
      return ctx.error(404, "not_found", "Mini draw not found");
    }
    return ctx.ok(outcome.data);
  },
);
