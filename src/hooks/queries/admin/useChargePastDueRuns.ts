import { useQuery } from "@tanstack/react-query";
import type { ChargeJobRunStatus, IChargeJobRun } from "@/models/ChargeJobRun";

export interface RunsFilter {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  status?: ChargeJobRunStatus;
  limit?: number;
  offset?: number;
}

export interface ListedRunDTO {
  _id: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  adminId: string;
  adminName: string;
  status: ChargeJobRunStatus;
  totals: IChargeJobRun["totals"];
}

export interface RunsResponse {
  runs: ListedRunDTO[];
  total: number;
}

function toQs(filter: RunsFilter): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  return p.toString();
}

export function useChargePastDueRuns(filter: RunsFilter) {
  return useQuery<RunsResponse>({
    queryKey: ["admin", "charge-past-due", "runs", filter],
    queryFn: async () => {
      const qs = toQs(filter);
      const res = await fetch(`/api/admin/charge-past-due/runs${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to load runs (${res.status})`);
      return res.json();
    },
  });
}
