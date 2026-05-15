"use client";

import { useQuery } from "@tanstack/react-query";

export interface PublicUpsellMultipliers {
  membership: number;
  oneTime: number;
  additional: number;
}

export const upsellMultipliersPublicQueryKey = ["upsell", "multipliers"] as const;

/**
 * Read-only, public-facing hook for the three upsell category multipliers.
 * No admin auth required — these numbers govern user-visible upsell offers and
 * are safe to expose to any client.
 */
export function useUpsellMultipliersPublic() {
  return useQuery<PublicUpsellMultipliers>({
    queryKey: upsellMultipliersPublicQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/upsell/multipliers");
      if (!res.ok) {
        throw new Error("Failed to load upsell multipliers");
      }
      return res.json();
    },
    staleTime: 60_000, // 1 minute — values change rarely
  });
}
