import { parseAdminDashboardDateRange, type ParsedAdminDashboardDateRange } from "./dashboardDateRange";
import MajorDraw from "@/models/MajorDraw";

export type NormRangeKey =
  | "today"
  | "yesterday"
  | "current-draw"
  | "last-draw"
  | "all-time"
  | "custom";

export interface ResolveNormDateRangeInput {
  range: NormRangeKey;
  start?: string;
  end?: string;
}

export async function resolveNormDateRange(input: ResolveNormDateRangeInput): Promise<ParsedAdminDashboardDateRange> {
  let startParam: string | null = input.start ?? null;
  let endParam: string | null = input.end ?? null;

  if (input.range === "current-draw" || input.range === "last-draw") {
    // MajorDraw schema uses `activationDate` (start) and `drawDate` (end).
    // Status enum is "queued" | "active" | "frozen" | "completed" | "cancelled".
    const draw =
      input.range === "current-draw"
        ? await MajorDraw.findOne({ status: { $in: ["active", "frozen"] } }).sort({ activationDate: -1 })
        : await MajorDraw.findOne({ status: "completed" }).sort({ drawDate: -1 });
    if (!draw) throw new Error(`No ${input.range} found in MajorDraw collection`);
    startParam = (draw.activationDate as Date).toISOString();
    endParam = (draw.drawDate as Date).toISOString();
  }

  const parsed = parseAdminDashboardDateRange({
    dateRange: input.range,
    startDateParam: startParam,
    endDateParam: endParam,
  });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}
