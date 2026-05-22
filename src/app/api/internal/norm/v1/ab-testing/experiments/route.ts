import { z } from "zod";
import mongoose from "mongoose";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormExperimentsListSchema } from "@/lib/internal-norm/schemas/ab-testing";
import ExperimentService from "@/services/ab-testing/ExperimentService";
import type { IExperiment } from "@/models/ab-testing/Experiment";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["draft", "active", "paused", "ended"]).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.string().max(50).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

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

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "ab-testing.experiments.list",
    requiredPermission: "abTesting.view",
    responseSchema: NormExperimentsListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(ctx.url.searchParams.entries()),
    );
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const result = await ExperimentService.listExperiments(parsed.data);
    const totalPages = result.limit > 0 ? Math.ceil(result.total / result.limit) : 0;

    return ctx.ok({
      experiments: result.experiments.map(projectExperiment),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages,
      },
    });
  },
);
