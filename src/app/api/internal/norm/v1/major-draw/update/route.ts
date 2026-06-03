import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMajorDrawUpdateGetSchema } from "@/lib/internal-norm/schemas/major-draw";
import { getMajorDrawForUpdate } from "@/services/admin/MajorDrawService";

// Note: only the GET (read tier) is wired here; the PUT trigger handler that
// actually updates a major draw is a `write_safe` tier and is intentionally
// NOT exported from this file (separate session/scope).

const QuerySchema = z.object({
  id: z.string().min(1, "id is required"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "major-draw.update.get",
    requiredPermission: "majorDraw.view",
    responseSchema: NormMajorDrawUpdateGetSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const data = await getMajorDrawForUpdate(parsed.data.id);
    if (!data) {
      return ctx.error(404, "not_found", "Major draw not found");
    }
    return ctx.ok(data);
  },
);
