import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormChargePastDueRunDetailSchema } from "@/lib/internal-norm/schemas/charge-past-due";
import { getChargeRunDetail } from "@/services/admin/chargePastDueHistory";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "charge-past-due.run.get",
    requiredPermission: "users.view",
    responseSchema: NormChargePastDueRunDetailSchema,
  },
  async (ctx) => {
    const runId = ctx.param(0) ?? "";
    if (!runId) return ctx.error(400, "bad_path", "Missing runId");

    const detail = await getChargeRunDetail(runId);
    if (!detail) return ctx.error(404, "not_found", "Run not found");

    return ctx.ok({
      run: {
        id: detail.run._id,
        startedAt: detail.run.startedAt.toISOString(),
        finishedAt: detail.run.finishedAt ? detail.run.finishedAt.toISOString() : null,
        durationMs: detail.run.durationMs,
        adminId: detail.run.adminId,
        adminName: detail.run.adminName,
        status: detail.run.status,
        totals: detail.run.totals,
      },
      rows: detail.rows.map((r) => ({
        invoiceId: r.invoiceId,
        customerId: r.customerId,
        userId: r.userId,
        userEmail: r.userEmail,
        status: r.status,
        amount: r.amount,
        attemptedAt: r.attemptedAt.toISOString(),
        errorCode: r.errorCode,
        declineCode: r.declineCode,
        errorMessage: r.errorMessage,
      })),
    });
  }
);
