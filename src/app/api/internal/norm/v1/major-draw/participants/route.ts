import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMajorDrawParticipantsSchema } from "@/lib/internal-norm/schemas/major-draw";
import { getMajorDrawParticipantsSafe } from "@/services/admin/MajorDrawService";

const QuerySchema = z.object({
  majorDrawId: z.string().min(1, "majorDrawId is required"),
  page: z.string().default("1").transform(Number).pipe(z.number().int().min(1)),
  limit: z.string().default("20").transform(Number).pipe(z.number().int().min(1).max(100)),
  search: z.string().optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "major-draw.participants",
    requiredPermission: "majorDraw.view",
    responseSchema: NormMajorDrawParticipantsSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const outcome = await getMajorDrawParticipantsSafe(parsed.data);
    if (!outcome.ok) {
      if (outcome.code === "bad_id") {
        return ctx.error(400, "bad_id", "Invalid majorDrawId");
      }
      return ctx.error(404, "not_found", "Major draw not found");
    }
    return ctx.ok(outcome.data);
  },
);
