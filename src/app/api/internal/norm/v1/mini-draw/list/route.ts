import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMiniDrawListSchema } from "@/lib/internal-norm/schemas/mini-draw";
import { listMiniDraws } from "@/services/admin/MiniDrawService";

const QuerySchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(["displayOrder", "createdAt", "name", "totalEntries", "minimumEntries"])
    .default("displayOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "mini-draw.list",
    requiredPermission: "miniDraws.view",
    responseSchema: NormMiniDrawListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const data = await listMiniDraws(parsed.data);
    return ctx.ok(data);
  },
);
