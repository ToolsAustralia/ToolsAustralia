import mongoose from "mongoose";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormExperimentHistorySchema } from "@/lib/internal-norm/schemas/ab-testing";
import ExperimentService, {
  isValidExperimentId,
} from "@/services/ab-testing/ExperimentService";

function objectIdToString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "object" && value !== null && "_id" in value) {
    return objectIdToString((value as { _id: unknown })._id);
  }
  return String(value);
}

function dateToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "ab-testing.experiment-history",
    requiredPermission: "abTesting.view",
    responseSchema: NormExperimentHistorySchema,
  },
  async (ctx) => {
    const experimentId = ctx.param(1) ?? "";
    if (!experimentId) return ctx.error(400, "bad_path", "Missing experiment id");
    if (!isValidExperimentId(experimentId)) {
      return ctx.error(400, "bad_path", "Invalid experiment id");
    }

    const history = await ExperimentService.getExperimentHistory(experimentId);

    return ctx.ok({
      history: history.map((row) => ({
        id: objectIdToString(row._id) ?? "",
        experimentId: objectIdToString(row.experimentId) ?? "",
        action: row.action,
        changedByUserId: objectIdToString(row.changedBy),
        timestamp: dateToIso(row.timestamp),
      })),
    });
  },
);
