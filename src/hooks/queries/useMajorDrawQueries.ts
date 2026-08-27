/**
 * Major draw React Query hooks
 *
 * This file contains all hooks for major draw data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost, apiDelete } from "@/lib/queries";
import { usePurchaseInvalidation } from "@/hooks/usePurchaseInvalidation";
import { useEntryRewardToast } from "@/hooks/useEntryRewardToast";

// Types
export interface MajorDraw {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  // Status and timing fields
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  freezeEntriesAt?: string;
  drawDate?: string;
  activationDate?: string;
  configurationLocked: boolean;
  lockedAt?: string;
  // Deprecated fields (kept for backward compatibility)
  maxEntries?: number;
  entryPrice?: number;
  isDrawn?: boolean;
  drawMethod?: "random" | "weighted" | "lottery";
  totalEntries: number;
  totalParticipants?: number;
  winnerId?: string;
  winner?: {
    userId: string;
    entryNumber: number;
    selectedDate: string;
    notified: boolean;
    selectedBy?: string;
    selectionMethod?: "manual" | "government-app";
  };
  createdAt: string;
  updatedAt: string;
}

export interface MajorDrawEntry {
  _id: string;
  userId: string;
  majorDrawId: string;
  entryCount: number;
  totalCost: number;
  entryNumbers: number[];
  createdAt: string;
  user?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface UserMajorDrawStats {
  totalEntries: number;
  membershipEntries: number;
  oneTimeEntries: number;
  /** Membership Streak milestone free entries — own bucket (never in oneTime). */
  streakEntries?: number;
  /** Merchandise free entries — own bucket, never folded into oneTimeEntries. */
  shopEntries?: number;
  currentDrawEntries: number;
  totalDrawsEntered: number;
  entriesByPackage: Array<{
    packageName: string;
    packageId: string;
    entryCount: number;
    source: "membership" | "one-time-package" | "upsell";
  }>;
}

export interface EntryData {
  majorDrawId: string;
  entryCount: number;
  paymentMethodId?: string;
}

// Hooks
export const useMajorDraws = () => {
  return useQuery({
    queryKey: queryKeys.majorDraw.all,
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MajorDraw[] }>("/api/major-draw");
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - increased for better performance
    gcTime: 30 * 60 * 1000, // 30 minutes - increased for better caching
    refetchOnWindowFocus: false, // Disabled to prevent duplicate requests
    refetchOnMount: false, // Don't refetch if data is fresh
  });
};

export const useCurrentMajorDraw = () => {
  return useQuery({
    queryKey: queryKeys.majorDraw.current,
    queryFn: async () => {
      const response = await apiGet<{
        success: boolean;
        data: {
          majorDraw: MajorDraw | null;
          userStats: UserMajorDrawStats | null;
          totalEntries: number;
          daysRemaining: number;
          isActive: boolean;
        };
      }>("/api/major-draw");
      return {
        ...response.data.majorDraw,
        totalEntries: response.data.totalEntries,
      };
    },
    staleTime: 30 * 1000, // 30 seconds - reduced for more real-time updates
    gcTime: 10 * 60 * 1000, // 10 minutes - reduced for fresher data
    refetchInterval: (data) => {
      // Only refetch frequently if the draw is active and ending soon
      if (data && typeof data === "object" && "isActive" in data && "drawDate" in data) {
        const majorDraw = data as unknown as MajorDraw;
        if (majorDraw.isActive && majorDraw.drawDate) {
          const endTime = new Date(majorDraw.drawDate || "").getTime();
          const timeUntilEnd = endTime - Date.now();

          // If less than 10 minutes remaining, refetch every 10 seconds
          if (timeUntilEnd < 10 * 60 * 1000) {
            return 10 * 1000;
          }

          // If less than 1 hour remaining, refetch every 30 seconds
          if (timeUntilEnd < 60 * 60 * 1000) {
            return 30 * 1000;
          }

          // If less than 1 day remaining, refetch every 1 minute
          if (timeUntilEnd < 24 * 60 * 60 * 1000) {
            return 1 * 60 * 1000;
          }
        }
      }

      // Otherwise, refetch every 2 minutes for active draws
      return 2 * 60 * 1000;
    },
    refetchIntervalInBackground: false, // Pause polling on hidden tabs; refetchOnWindowFocus catches up on tab focus
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
};

/*
 * REMOVED 2026-07-30: `useMajorDrawStats()` and its `MajorDrawStats` interface.
 *
 * The hook fetched `/api/major-draw/stats`, a route that does not exist, and
 * nothing consumed it — it was only re-exported from `hooks/queries/index.ts`.
 * Its interface declared `totalRevenue`, `topParticipants` and
 * `dailyEntries[].revenue`, which made per-draw revenue LOOK implemented during
 * the admin draws audit when no such aggregation existed anywhere.
 *
 * Real per-draw revenue now lives in `src/services/admin/drawRevenue.ts` and is
 * served by `/api/admin/major-draw/history` (see docs/draws/architecture.md).
 *
 * Not to be confused with `useUserMajorDrawStats` below — one word apart, live,
 * and consumed by /my-account, /rewards and the header entry badge.
 */

/**
 * The current user's stats for the active draw.
 *
 * Kept on its OWN user-scoped key `majorDraw.userStats(userId)` — NOT folded into
 * `majorDraw.current` — because this key is the write-target for an extensive
 * optimistic-update + rollback ecosystem (redeemables, upsell, membership, mini/major
 * entry, purchase-invalidation, success toasts). Those flows `setQueryData` this key to
 * show an instant "+N entries" bump before the server confirms; a `select` over
 * `majorDraw.current` would read a different cache entry and silently drop that feedback.
 *
 * Churn reduction (Tier-2): dropped the redundant 1-minute `refetchInterval` and raised
 * `staleTime` 0 → 30s. The user's own entry count only changes via THEIR mutations, which
 * already optimistically write + invalidate this key, so a background poll added nothing.
 * The key is user-scoped, so a login is always a cold fetch (fresh stats); `refetchOnMount`
 * + `refetchOnWindowFocus` cover cross-device/admin grants.
 */
export const useUserMajorDrawStats = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.majorDraw.userStats(userId!),
    queryFn: async () => {
      const response = await apiGet<{
        success: boolean;
        data: {
          majorDraw: MajorDraw | null;
          userStats: UserMajorDrawStats | null;
          totalEntries: number;
          daysRemaining: number;
          isActive: boolean;
        };
      }>("/api/major-draw");
      return response.data.userStats;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // was 0 — user-driven changes are already applied optimistically
    gcTime: 5 * 60 * 1000, // 5 minutes - reduced for fresher data
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnMount: true, // Fresh stats on first mount after login (user-scoped key = cold fetch)
  });
};

export const useUserMajorDrawEntries = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.majorDraw.entries(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MajorDrawEntry[] }>("/api/major-draw/user-entries");
      return response.data;
    },
    enabled: !!userId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
};

// Mutations
export const useEnterMajorDraw = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const invalidatePurchaseCaches = usePurchaseInvalidation();
  const showEntryReward = useEntryRewardToast();

  return useMutation({
    mutationFn: async ({ majorDrawId, entryCount, paymentMethodId }: EntryData) => {
      const response = await apiPost<{ success: boolean; data: MajorDrawEntry }>("/api/major-draw/enter", {
        majorDrawId,
        entryCount,
        paymentMethodId,
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.current });
      queryClient.invalidateQueries({ queryKey: ["major-draw-stats"] });
      if (userId) {
        invalidatePurchaseCaches(userId);
        queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.entries(userId) });
      }

      queryClient.setQueryData(queryKeys.majorDraw.current, (old: MajorDraw | null) => {
        if (old) {
          return {
            ...old,
            totalEntries: old.totalEntries + data.entryCount,
            totalParticipants: (old.totalParticipants || 0) + 1, // Assuming new participant
          };
        }
        return old;
      });

      if (data.entryCount > 0) {
        showEntryReward({
          entries: data.entryCount,
          drawType: "major",
          source: "useEnterMajorDraw",
        });
      }
    },
    onError: (error) => {
      console.error("Failed to enter major draw:", error);
    },
  });
};

export const useCancelMajorDrawEntry = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async (entryId: string) => {
      const response = await apiDelete<{ success: boolean; data: MajorDrawEntry }>(
        `/api/major-draw/entries/${entryId}`
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.current });
      queryClient.invalidateQueries({ queryKey: ["major-draw-stats"] });
      if (userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.entries(userId) });
      }

      // Update current major draw total entries in cache
      queryClient.setQueryData(queryKeys.majorDraw.current, (old: MajorDraw | null) => {
        if (old) {
          return {
            ...old,
            totalEntries: Math.max(0, old.totalEntries - data.entryCount),
            totalParticipants: Math.max(0, (old.totalParticipants || 0) - 1), // Assuming participant removal
          };
        }
        return old;
      });
    },
  });
};

// Utility hooks
export const useMajorDrawCountdown = () => {
  const { data: currentDraw } = useCurrentMajorDraw();

  const getTimeRemaining = () => {
    if (!currentDraw) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

    // Prefer freezeEntriesAt (entries close) and fall back to drawDate
    const targetDate = currentDraw.freezeEntriesAt || currentDraw.drawDate;
    if (!targetDate) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

    const now = Date.now();
    const endTime = new Date(targetDate).getTime();
    const total = Math.max(0, endTime - now);

    const days = Math.floor(total / (1000 * 60 * 60 * 24));
    const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((total % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, total };
  };

  const isActive = currentDraw?.isActive || false;
  const targetDate = currentDraw?.freezeEntriesAt || currentDraw?.drawDate;
  const isEnded = targetDate ? new Date(targetDate).getTime() <= Date.now() : false;
  const isDrawn = currentDraw?.isDrawn || false;
  const targetDateMs = targetDate ? new Date(targetDate).getTime() : null;

  return {
    currentDraw,
    timeRemaining: getTimeRemaining(),
    isActive,
    isEnded,
    isDrawn,
    canEnter: isActive && !isEnded && !isDrawn,
    targetDateMs,
  };
};

export const useMajorDrawProgress = () => {
  const { data: currentDraw } = useCurrentMajorDraw();
  const { data: userStats } = useUserMajorDrawStats("current-user");

  const getProgressPercentage = () => {
    if (!currentDraw || !currentDraw.maxEntries) return 0;
    return Math.min(100, (currentDraw.totalEntries / currentDraw.maxEntries) * 100);
  };

  const getUserProgressPercentage = () => {
    if (!currentDraw || !userStats) return 0;
    const maxUserEntries = 1000; // This should come from the draw configuration
    return Math.min(100, (userStats.currentDrawEntries / maxUserEntries) * 100);
  };

  return {
    totalProgress: getProgressPercentage(),
    userProgress: getUserProgressPercentage(),
    totalEntries: currentDraw?.totalEntries || 0,
    maxEntries: currentDraw?.maxEntries || 0,
    userEntries: userStats?.currentDrawEntries || 0,
    totalParticipants: currentDraw?.totalParticipants || 0,
  };
};

export const useCompletedMajorDraws = () => {
  return useQuery({
    queryKey: ["major-draw-completed"],
    queryFn: async () => {
      const response = await apiGet<{
        success: boolean;
        data: {
          draws: Array<{
            _id: string;
            name: string;
            description: string;
            prize: {
              name: string;
              description: string;
              value: number;
              images: string[];
              category: string;
              brand?: string;
              model?: string;
              specifications?: Record<string, unknown>;
            };
            drawDate: string;
            totalEntries: number;
            participantCount: number;
            winner?: {
              name: string;
              state: string;
              entryNumber: number;
              selectedDate: string;
              drawResultUrl?: string;
            };
          }>;
          total: number;
        };
      }>("/api/major-draw/completed");
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - completed draws don't change often
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Disabled to prevent unnecessary refetches
    refetchOnMount: false, // Don't refetch if data is fresh
  });
};

export const useNextDraw = () => {
  return useQuery({
    queryKey: ["major-draw-next"],
    queryFn: async () => {
      const response = await apiGet<{
        success: boolean;
        nextDraw: {
          name: string;
          _id: string;
          activationDate: string | null;
          prize?: {
            name?: string;
            images?: string[];
          };
        } | null;
      }>("/api/major-draw/next");
      return response.nextDraw;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - next draw doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

export const useMajorDrawPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchCurrentMajorDraw = () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.majorDraw.current,
      queryFn: async () => {
        const response = await apiGet<{
          success: boolean;
          data: {
            majorDraw: MajorDraw | null;
            userStats: UserMajorDrawStats | null;
            totalEntries: number;
            daysRemaining: number;
            isActive: boolean;
          };
        }>("/api/major-draw");
        return response.data.majorDraw;
      },
      staleTime: 1 * 60 * 1000,
    });
  };

  const prefetchUserStats = (userId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.majorDraw.userStats(userId),
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: UserMajorDrawStats }>("/api/major-draw/user-stats");
        return response.data;
      },
      staleTime: 2 * 60 * 1000,
    });
  };

  const prefetchCompletedMajorDraws = () => {
    queryClient.prefetchQuery({
      queryKey: ["major-draw-completed"],
      queryFn: async () => {
        const response = await apiGet<{
          success: boolean;
          data: {
            draws: Array<{
              _id: string;
              name: string;
              description: string;
              prize: {
                name: string;
                description: string;
                value: number;
                images: string[];
                category: string;
                brand?: string;
                model?: string;
                specifications?: Record<string, unknown>;
              };
              drawDate: string;
              totalEntries: number;
              participantCount: number;
              winner?: {
                name: string;
                state: string;
                entryNumber: number;
                selectedDate: string;
                drawResultUrl?: string;
              };
            }>;
            total: number;
          };
        }>("/api/major-draw/completed");
        return response.data;
      },
      staleTime: 10 * 60 * 1000,
    });
  };

  return { prefetchCurrentMajorDraw, prefetchUserStats, prefetchCompletedMajorDraws };
};
