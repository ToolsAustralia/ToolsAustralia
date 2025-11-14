import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";

export interface ReferralProfile {
  code: string;
  successfulConversions: number;
  totalEntriesAwarded: number;
}

export const useReferralProfile = (userId?: string) => {
  const cacheKeyId = userId ?? "current-user";

  return useQuery({
    queryKey: queryKeys.referrals.profile(cacheKeyId),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: ReferralProfile }>("/api/referrals/code");
      return response.data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
};
