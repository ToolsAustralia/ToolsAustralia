"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost } from "@/lib/queries";

// Client-safe shape (no Mongoose Document inheritance).
export interface ClientAllowlistAction {
  _id: string;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  userId: string | null;
  customerEmail: string | null;
  action: "added" | "skipped" | "removed";
  reason: string;
  declineCode: string | null;
  failureCode: string | null;
  triggeringPaymentIntentId: string | null;
  triggeringChargeId: string | null;
  stripeListItemId: string | null;
  source: string;
  performedByUserId: string | null;
  createdAt: string;
}

type ActionFilter = "added" | "skipped" | "removed" | "all";

export function useAllowlistActions(action: ActionFilter = "added", limit = 50) {
  return useQuery({
    queryKey: queryKeys.admin.allowlist.actions(action, limit),
    queryFn: async () => {
      const data = await apiGet<{ success: true; actions: ClientAllowlistAction[] }>(
        `/api/admin/allowlist/actions?action=${action}&limit=${limit}`
      );
      return data.actions;
    },
    staleTime: 15_000,
  });
}

export type ApplyArgs = {
  rows: Array<{
    cardFingerprint: string;
    cardLast4: string;
    cardBrand: string;
    stripeCustomerId: string | null;
    customerEmail: string | null;
    declineCode: string | null;
    failureCode: string | null;
    triggeringPaymentIntentId: string | null;
    triggeringChargeId: string | null;
  }>;
  allowOverride: boolean;
};

export function useApplyAllowlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ApplyArgs) =>
      apiPost<{
        success: true;
        added: number;
        skipped: number;
        errors: Array<{ cardFingerprint: string; message: string }>;
      }>("/api/admin/allowlist/apply", args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "allowlist"] });
    },
  });
}

export function useReverseAllowlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { actionId: string }) =>
      apiPost<{ success: true; action: ClientAllowlistAction }>("/api/admin/allowlist/reverse", args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "allowlist"] });
    },
  });
}
