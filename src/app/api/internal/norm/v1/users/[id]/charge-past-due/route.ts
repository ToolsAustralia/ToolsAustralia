import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUsersChargePastDuePreviewSchema } from "@/lib/internal-norm/schemas/users";
import {
  previewUserChargePastDue,
  isValidUserObjectId,
} from "@/services/admin/UserAdminQueryService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.charge-past-due.preview",
    requiredPermission: "users.view",
    responseSchema: NormUsersChargePastDuePreviewSchema,
  },
  async (ctx) => {
    // /api/internal/norm/v1/users/<id>/charge-past-due
    const parts = ctx.url.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 2] ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing user id");
    if (!isValidUserObjectId(id)) return ctx.error(400, "bad_path", "Invalid user id");

    const result = await previewUserChargePastDue({ userId: id });
    if (!result.ok) {
      const code =
        result.status === 404 ? "not_found" : result.status === 400 ? "bad_request" : "internal";
      return ctx.error(result.status, code, result.message);
    }
    return ctx.ok(result.preview);
  },
);
