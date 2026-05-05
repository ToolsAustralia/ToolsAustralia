import { useQuery } from "@tanstack/react-query";
import type { RunDetailRowDTO } from "./useChargePastDueRunDetail";
import type { IInvoiceChargeLog } from "@/models/InvoiceChargeLog";

export interface ManualRetriesFilter {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  status?: IInvoiceChargeLog["status"];
  limit?: number;
  offset?: number;
}

export interface ManualRetryRowDTO extends RunDetailRowDTO {
  adminId: string;
  adminName: string;
}

export interface ManualRetriesResponse {
  rows: ManualRetryRowDTO[];
  total: number;
}

function toQs(filter: ManualRetriesFilter): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  return p.toString();
}

export function useChargePastDueManualRetries(filter: ManualRetriesFilter) {
  return useQuery<ManualRetriesResponse>({
    queryKey: ["admin", "charge-past-due", "manual-retries", filter],
    queryFn: async () => {
      const qs = toQs(filter);
      const res = await fetch(`/api/admin/charge-past-due/manual-retries${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to load manual retries (${res.status})`);
      return res.json();
    },
  });
}
