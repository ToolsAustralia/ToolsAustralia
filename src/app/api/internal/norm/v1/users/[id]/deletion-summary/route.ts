import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUsersDeletionSummarySchema } from "@/lib/internal-norm/schemas/users";
import { isValidUserObjectId } from "@/services/admin/UserAdminQueryService";
import { getUserDeletionSummary } from "@/utils/admin/get-user-deletion-summary";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.deletion-summary",
    requiredPermission: "users.view",
    responseSchema: NormUsersDeletionSummarySchema,
  },
  async (ctx) => {
    const id = ctx.param(1) ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing user id");
    if (!isValidUserObjectId(id)) return ctx.error(400, "bad_path", "Invalid user id");

    try {
      const summary = await getUserDeletionSummary(id);
      return ctx.ok(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load deletion summary";
      if (message === "User not found") return ctx.error(404, "not_found", message);
      return ctx.error(500, "handler_exception", message);
    }
  },
);
