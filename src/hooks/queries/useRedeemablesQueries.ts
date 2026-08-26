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
  /**
   * The one customer-facing expiry string, pre-formatted server-side in AEST
   * via formatExpiryLabelAEST — the single formatter every copy of a deadline
   * comes from. Never derive a display date from `expiresAt` client-side: that
   * renders in the viewer's own locale/timezone and can disagree with the
   * instant the server actually enforces at redemption.
   *
   * (Corrected 2026-08-26: this said "the same function the Klaviyo email
   * uses". No customer email prints a bonus-code deadline — a Klaviyo flow
   * email renders against its own trigger metric, so the discount templates
   * cannot read `expires_at_label` off the `Bonus Code Issued` event we emit.
   * The rule is unchanged; the thing it must not disagree with is the
   * redemption gate, not an email.)
   *
   * Optional here even though RedeemableWalletItem on the SERVICE side
   * (RedeemablesWalletService.ts) declares it required and always populates
   * it — deliberate defensive typing for a value crossing an HTTP boundary,
   * matching every other field on this client-side response type.
   */
  expiresAtLabel?: string;
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
    // Present only when the caller holds an issuance for this campaign — see
    // the visibility rule on activeCampaigns below.
    code?: string;
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
    // A code is present ONLY when the caller holds an issuance for this
    // campaign — never sent to a customer who has not qualified for it.
    code?: string;
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
    // A redemption BURNS a one-shot issuance server-side, so it is not idempotent: an
    // auto-retry of a request that actually succeeded comes back 409/400 and would roll the
    // granted entries straight back out of the UI. Never retry this one.
    retry: 0,
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
    onSuccess: (data, variables) => {
      if (!userId) return;
      const granted = data?.data?.entriesGranted;
      const optimisticAmount = variables.entriesAmount;

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

      // Fire-and-forget: React Query keeps the mutation `pending` until these callbacks
      // settle, so AWAITING the refetches (incl. the heavy my-account payload) would hold
      // the Claim button disabled and the success toast back for the exact round-trip the
      // optimistic update exists to hide.
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    },
    onError: (_error, _variables, context) => {
      if (!userId || !context) return;
      if (context.previousUserStats !== undefined) {
        queryClient.setQueryData(queryKeys.majorDraw.userStats(userId), context.previousUserStats);
      }
    },
    onSettled: () => {
      if (!userId) return;
      // Re-sync on BOTH outcomes. On failure the rolled-back snapshot can be stale in the
      // way that matters most — a 409 means the server already burned the issuance, so the
      // wallet must refetch or the item keeps rendering as claimable and the member taps on.
      void queryClient.invalidateQueries({ queryKey: ["redeemables", userId, "wallet"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.redeemables.status(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
    },
  });
};
