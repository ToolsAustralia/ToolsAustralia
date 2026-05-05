import { useQuery } from "@tanstack/react-query";
import type { ListedRunDTO } from "./useChargePastDueRuns";
import type { IInvoiceChargeLog } from "@/models/InvoiceChargeLog";

export interface RunDetailRowDTO {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  status: IInvoiceChargeLog["status"];
  amount: number;
  attemptedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunDetailResponse {
  run: ListedRunDTO;
  rows: RunDetailRowDTO[];
}

export function useChargePastDueRunDetail(runId: string | null) {
  return useQuery<RunDetailResponse>({
    queryKey: ["admin", "charge-past-due", "run", runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/charge-past-due/runs/${runId}`);
      if (!res.ok) throw new Error(`Failed to load run (${res.status})`);
      return res.json();
    },
  });
}
