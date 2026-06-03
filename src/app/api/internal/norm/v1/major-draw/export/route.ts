import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMajorDrawExportAggregateSchema } from "@/lib/internal-norm/schemas/major-draw";
import { getMajorDrawExportAggregate } from "@/services/admin/MajorDrawService";

const QuerySchema = z.object({
  majorDrawId: z.string().optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "major-draw.export",
    requiredPermission: "majorDraw.view",
    responseSchema: NormMajorDrawExportAggregateSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const outcome = await getMajorDrawExportAggregate(parsed.data);
    if (!outcome.ok) {
      if (outcome.code === "bad_id") {
        return ctx.error(400, "bad_id", "Invalid majorDrawId");
      }
      if (outcome.code === "cancelled") {
        return ctx.error(403, "cancelled", "Cannot export cancelled draw");
      }
      return ctx.error(404, "not_found", "Major draw not found");
    }
    return ctx.ok(outcome.data);
  },
);
