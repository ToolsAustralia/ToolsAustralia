import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormChargePastDuePreviewSchema } from "@/lib/internal-norm/schemas/invoices";
import { previewChargePastDueInvoices } from "@/services/admin/previewChargePastDueInvoices";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "invoices.charge-past-due.preview",
    requiredPermission: "users.view",
    responseSchema: NormChargePastDuePreviewSchema,
  },
  async (ctx) => {
    const preview = await previewChargePastDueInvoices();
    return ctx.ok(preview);
  },
);
