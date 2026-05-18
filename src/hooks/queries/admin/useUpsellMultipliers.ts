"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/queries";

export const upsellMultipliersQueryKey = ["admin", "upsell-multipliers"] as const;

export interface UpsellMultipliers {
  membership: number;
  oneTime: number;
  additional: number;
  updatedAt: string;
}

export function useUpsellMultipliersQuery() {
  return useQuery<UpsellMultipliers>({
    queryKey: upsellMultipliersQueryKey,
    queryFn: () => apiGet<UpsellMultipliers>("/api/admin/upsell-multipliers"),
    staleTime: 60_000,
  });
}

export function useUpsellMultipliersMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<UpsellMultipliers, "membership" | "oneTime" | "additional">) =>
      apiPut<{ ok: boolean }>("/api/admin/upsell-multipliers", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: upsellMultipliersQueryKey }),
  });
}
