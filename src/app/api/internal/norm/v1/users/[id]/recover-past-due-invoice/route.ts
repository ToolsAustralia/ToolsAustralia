import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUsersRecoverPastDueInvoicePreviewSchema } from "@/lib/internal-norm/schemas/users";
import {
  previewUserRecoverPastDueInvoice,
  isValidUserObjectId,
} from "@/services/admin/UserAdminQueryService";

const QuerySchema = z.object({
  invoiceId: z.string().min(1).max(100),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.recover-past-due-invoice.preview",
    requiredPermission: "users.charge",
    responseSchema: NormUsersRecoverPastDueInvoicePreviewSchema,
  },
  async (ctx) => {
    // /api/internal/norm/v1/users/<id>/recover-past-due-invoice?invoiceId=in_...
    const parts = ctx.url.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 2] ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing user id");
    if (!isValidUserObjectId(id)) return ctx.error(400, "bad_path", "Invalid user id");

    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Missing or invalid invoiceId", parsed.error.issues);
    }

    const result = await previewUserRecoverPastDueInvoice({
      userId: id,
      originalInvoiceId: parsed.data.invoiceId,
    });
    return ctx.ok(result);
  },
);
