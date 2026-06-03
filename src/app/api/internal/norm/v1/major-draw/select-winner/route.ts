import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMajorDrawSelectWinnerPreviewSchema } from "@/lib/internal-norm/schemas/major-draw";
import { getMajorDrawSelectWinnerPreview } from "@/services/admin/MajorDrawService";

// Note: only the GET (read tier) is wired here; the POST trigger handler
// for actually selecting a winner is a `trigger_human_approve` tier and is
// intentionally NOT exported from this file (separate session/scope).

const QuerySchema = z.object({
  majorDrawId: z.string().min(1, "majorDrawId is required"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "major-draw.select-winner.preview",
    requiredPermission: "majorDraw.view",
    responseSchema: NormMajorDrawSelectWinnerPreviewSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const outcome = await getMajorDrawSelectWinnerPreview(parsed.data.majorDrawId);
    if (!outcome.ok) {
      if (outcome.code === "bad_id") {
        return ctx.error(400, "bad_id", "Invalid majorDrawId");
      }
      return ctx.error(404, "not_found", "Major draw not found");
    }
    return ctx.ok(outcome.data);
  },
);
