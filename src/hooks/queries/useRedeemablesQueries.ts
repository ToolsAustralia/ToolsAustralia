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
    mutationFn: async (payload: { issuanceId?: string; code?: string }) => {
      return apiPost<{ success: boolean; data?: { entriesGranted?: number }; error?: string }>(
        "/api/redeemables/redeem",
        payload
      );
    },
    onSuccess: async () => {
      if (!userId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["redeemables", userId, "wallet"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.redeemables.status(userId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) }),
      ]);
    },
  });
};
