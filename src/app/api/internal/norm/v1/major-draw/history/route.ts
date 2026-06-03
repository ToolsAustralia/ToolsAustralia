import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMajorDrawHistorySchema } from "@/lib/internal-norm/schemas/major-draw";
import { getMajorDrawHistory } from "@/services/admin/MajorDrawService";

const QuerySchema = z.object({
  status: z.enum(["queued", "active", "frozen", "completed", "cancelled"]).optional(),
  hasWinner: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.string().default("1").transform(Number).pipe(z.number().int().min(1)),
  limit: z.string().default("20").transform(Number).pipe(z.number().int().min(1).max(100)),
  sortBy: z.enum(["drawDate", "createdAt", "name", "prize.value"]).default("drawDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "major-draw.history",
    requiredPermission: "majorDraw.view",
    responseSchema: NormMajorDrawHistorySchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const data = await getMajorDrawHistory(parsed.data);
    return ctx.ok(data);
  },
);
