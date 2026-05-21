import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";

export interface RedeemableWalletItem {
  issuanceId: string;
  campaignId?: string;
  rewardId?: string;
  monthKey: string;
  code?: string;
  campaignCode?: string;
  entriesAmount: number;
  status: "active" | "redeemed" | "expired" | "cancelled" | "revoked";
  issuedAt: string;
  redeemedAt?: string;
  expiresAt?: string;
  campaignName?: string;
  displayLabel?: string;
  purchaseRequirement: "none" | "membership" | "one-time" | "any";
  neverExpires?: boolean;
  source: "monthly-coupon" | "milestone";
  isRedeemableNow: boolean;
}

export interface RedeemablesWalletResponse {
  wallet: RedeemableWalletItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface RedeemablesStatusResponse {
  eligible: boolean;
  reason: string;
  activeCampaign: null | {
    id: string;
    monthKey: string;
    name: string;
    campaignMode: "global" | "unique" | "both";
    startsAt: string;
    endsAt?: string;
    neverExpires?: boolean;
  };
  activeCampaigns: Array<{
    id: string;
    monthKey: string;
    name: string;
    displayLabel?: string;
    campaignMode: "global" | "unique" | "both";
    code: string;
    purchaseRequirement: "none" | "membership" | "one-time" | "any";
    startsAt: string;
    endsAt?: string;
    neverExpires?: boolean;
  }>;
  latestIssuance: null | {
    id: string;
    status: "active" | "redeemed" | "expired" | "cancelled" | "revoked";
    expiresAt: string;
    redeemedAt?: string;
  };
}

export const useRedeemablesWallet = (
  userId?: string,
  options?: { page?: number; limit?: number; status?: "claimable" | "past" }
) => {
  const page = options?.page || 1;
  const limit = options?.limit || 10;
  const status = options?.status;
  return useQuery({
    queryKey: queryKeys.redeemables.wallet(userId || "anonymous", { page, limit, status }),
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) {
        params.set("status", status);
      }
      const response = await apiGet<{ success: boolean; data: RedeemablesWalletResponse }>(
        `/api/redeemables?${params.toString()}`
      );
      return response.data;
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const useRedeemablesStatus = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.redeemables.status(userId || "anonymous"),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: RedeemablesStatusResponse }>("/api/redeemables/status");
      return response.data;
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const useRedeemableRedemption = (userId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { issuanceId?: string; code?: string; entriesAmount?: number }) => {
      const { issuanceId, code } = payload;
      return apiPost<{ success: boolean; data?: { entriesGranted?: number }; error?: string }>(
        "/api/redeemables/redeem",
        { issuanceId, code }
      );
    },
    onMutate: async (payload) => {
      if (!userId) return;
      await queryClient.cancelQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
      const previousUserStats = queryClient.getQueryData(queryKeys.majorDraw.userStats(userId));

      if (payload.entriesAmount) {
        const added = payload.entriesAmount;
        queryClient.setQueryData(queryKeys.majorDraw.userStats(userId), (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const o = old as Record<string, unknown>;
          return {
            ...o,
            totalEntries: (Number(o.totalEntries) || 0) + added,
            currentDrawEntries: (Number(o.currentDrawEntries) || 0) + added,
            oneTimeEntries: (Number(o.oneTimeEntries) || 0) + added,
          };
        });
      }

      return { previousUserStats };
    },
    onSuccess: async (data, _variables, context) => {
      if (!userId) return;
      const granted = data?.data?.entriesGranted;
      const optimisticAmount = _variables.entriesAmount;

      // If the server returned a different count than what we optimistically applied, correct it
      if (granted !== undefined && optimisticAmount !== undefined && granted !== optimisticAmount) {
        const diff = granted - optimisticAmount;
        queryClient.setQueryData(queryKeys.majorDraw.userStats(userId), (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const o = old as Record<string, unknown>;
          return {
            ...o,
            totalEntries: Math.max(0, (Number(o.totalEntries) || 0) + diff),
            currentDrawEntries: Math.max(0, (Number(o.currentDrawEntries) || 0) + diff),
            oneTimeEntries: Math.max(0, (Number(o.oneTimeEntries) || 0) + diff),
          };
        });
      } else if (granted !== undefined && optimisticAmount === undefined) {
        // Code redemption path: no optimistic amount, apply granted count now
        queryClient.setQueryData(queryKeys.majorDraw.userStats(userId), (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const o = old as Record<string, unknown>;
          return {
            ...o,
            totalEntries: (Number(o.totalEntries) || 0) + granted,
            currentDrawEntries: (Number(o.currentDrawEntries) || 0) + granted,
            oneTimeEntries: (Number(o.oneTimeEntries) || 0) + granted,
          };
        });
      }

      void context;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["redeemables", userId, "wallet"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.redeemables.status(userId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) }),
      ]);
      // Refetch userStats in the background to sync with server truth
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
    },
    onError: (_error, _variables, context) => {
      if (!userId || !context) return;
      if (context.previousUserStats !== undefined) {
        queryClient.setQueryData(queryKeys.majorDraw.userStats(userId), context.previousUserStats);
      }
    },
  });
};
