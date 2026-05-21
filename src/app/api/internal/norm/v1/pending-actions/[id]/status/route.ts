import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPendingActionStatusSchema } from "@/lib/internal-norm/schemas/pending-actions";
import NormPendingAction from "@/models/NormPendingAction";
import type { Document } from "mongoose";

interface NormPendingActionDoc extends Document {
  _id: string;
  registryKey: string;
  status: string;
  resolvedAt?: Date;
  resolutionOutcome?: { ok: boolean; errorCode?: string };
}

export const GET = withNorm(
  { tier: "read", registryKey: "pending-actions.status", requiredPermission: "overview.view", responseSchema: NormPendingActionStatusSchema },
  async (ctx) => {
    const id = ctx.url.pathname.split("/").slice(-2, -1)[0];
    const action = await NormPendingAction.findById(id).lean() as NormPendingActionDoc | null;
    if (!action) return ctx.error(404, "not_found", "Pending action not found");
    return ctx.ok({
      id: String(action._id),
      registryKey: action.registryKey,
      status: action.status,
      resolvedAt: action.resolvedAt?.toISOString(),
      resolutionOutcome: action.resolutionOutcome,
    });
  }
);
