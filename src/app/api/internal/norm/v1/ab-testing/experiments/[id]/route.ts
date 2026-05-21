import mongoose from "mongoose";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormExperimentDetailSchema } from "@/lib/internal-norm/schemas/ab-testing";
import ExperimentService, {
  isValidExperimentId,
} from "@/services/ab-testing/ExperimentService";
import type { IExperiment } from "@/models/ab-testing/Experiment";
import type { IVariant } from "@/models/ab-testing/Variant";

function objectIdToString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  return String(value);
}

function dateToIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function projectExperiment(e: IExperiment) {
  return {
    id: objectIdToString(e._id) ?? "",
    name: e.name,
    status: e.status,
    slugTargets: e.slugTargets,
    startDate: dateToIso(e.startDate),
    endDate: dateToIso(e.endDate),
    archived: !!e.archived,
    winnerVariantId: objectIdToString(e.winnerVariantId),
    endedReason: e.endedReason ?? null,
    stoppingRules: e.stoppingRules ?? null,
    statisticalResults: e.statisticalResults
      ? {
          pValue: e.statisticalResults.pValue ?? null,
          confidence: e.statisticalResults.confidence ?? null,
          significant: e.statisticalResults.significant ?? null,
          lift: e.statisticalResults.lift ?? null,
          confidenceInterval: e.statisticalResults.confidenceInterval ?? null,
          calculatedAt: dateToIso(e.statisticalResults.calculatedAt),
        }
      : null,
    createdAt: dateToIso(e.createdAt) ?? "",
    updatedAt: dateToIso(e.updatedAt) ?? "",
  };
}

function projectVariant(v: IVariant) {
  return {
    id: objectIdToString(v._id) ?? "",
    name: v.name,
    trafficPercentage: v.trafficPercentage,
    isControl: v.isControl,
    createdAt: dateToIso(v.createdAt) ?? "",
    updatedAt: dateToIso(v.updatedAt) ?? "",
  };
}

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "ab-testing.experiment.get",
    requiredPermission: "abTesting.view",
    responseSchema: NormExperimentDetailSchema,
  },
  async (ctx) => {
    const id = ctx.param(0) ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing experiment id");
    if (!isValidExperimentId(id)) {
      return ctx.error(400, "bad_path", "Invalid experiment id");
    }

    const detail = await ExperimentService.getExperimentDetail(id);
    if (!detail) return ctx.error(404, "not_found", "Experiment not found");

    return ctx.ok({
      experiment: projectExperiment(detail.experiment),
      variants: detail.variants.map(projectVariant),
    });
  },
);
