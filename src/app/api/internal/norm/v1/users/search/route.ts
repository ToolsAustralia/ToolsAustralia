import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUsersSearchSchema } from "@/lib/internal-norm/schemas/users";
import { searchAdminUsers } from "@/services/admin/UserAdminQueryService";

const QuerySchema = z.object({
  q: z.string().max(100).default(""),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  majorDrawId: z.string().max(50).optional(),
  miniDrawId: z.string().max(50).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.search",
    requiredPermission: "users.view",
    responseSchema: NormUsersSearchSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    if (!parsed.data.q && !parsed.data.majorDrawId && !parsed.data.miniDrawId) {
      return ctx.error(400, "bad_query", "Search query or draw ID is required");
    }

    const result = await searchAdminUsers({
      q: parsed.data.q,
      page: parsed.data.page,
      limit: parsed.data.limit,
      majorDrawId: parsed.data.majorDrawId,
      miniDrawId: parsed.data.miniDrawId,
    });

    // PII-safe projection: firstName + opaque userId only — strip email/lastName/mobile.
    return ctx.ok({
      users: result.users.map((u) => ({
        userId: u.id,
        firstName: u.firstName || null,
        state: u.state ?? null,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
        lastLogin: u.lastLogin ? new Date(u.lastLogin).toISOString() : null,
        currentDrawEntries: u.currentDrawEntries ?? null,
      })),
      pagination: result.pagination,
      searchInfo: {
        query: parsed.data.q,
        resultsFound: result.pagination.totalCount,
        currentDraw: result.currentDraw,
      },
    });
  },
);
