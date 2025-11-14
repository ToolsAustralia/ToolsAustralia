/**
 * Mini draw React Query hooks
 *
 * This file contains all hooks for mini draw data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost, apiDelete } from "@/lib/queries";
import { MiniDrawType } from "@/types/mini-draw";

// Types
export interface MiniDrawEntry {
  _id: string;
  userId: string;
  miniDrawId: string;
  entryCount: number;
  totalCost: number;
  createdAt: string;
  user?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface MiniDrawFilters extends Record<string, unknown> {
  status?: "active" | "upcoming" | "completed" | "cancelled";
  category?: string;
  minValue?: number;
  maxValue?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface MiniDrawResponse {
  miniDraws: MiniDrawType[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    limit: number;
  };
}

export interface EntryResponse {
  success: boolean;
  data: {
    entry: MiniDrawEntry;
    paymentIntent?: {
      id: string;
      client_secret: string;
      status: string;
    };
  };
}

export interface EntryData {
  miniDrawId: string;
  entryCount: number;
  paymentMethodId?: string;
}

// Hooks
export const useMiniDraws = (filters: MiniDrawFilters = {}) => {
  return useQuery({
    queryKey: queryKeys.miniDraws.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();

      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });

      const response = await apiGet<MiniDrawResponse>(`/api/mini-draws?${params.toString()}`);
      return response;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: keepPreviousData,
  });
};

export const useInfiniteMiniDraws = (filters: MiniDrawFilters = {}) => {
  return useInfiniteQuery({
    queryKey: queryKeys.miniDraws.list(filters),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();

      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });

      params.append("page", String(pageParam));
      params.append("limit", "12");

      const response = await apiGet<MiniDrawResponse>(`/api/mini-draws?${params.toString()}`);
      return response;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasNextPage ? lastPage.pagination.currentPage + 1 : undefined;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useMiniDraw = (miniDrawId?: string) => {
  return useQuery({
    queryKey: queryKeys.miniDraws.detail(miniDrawId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MiniDrawType }>(`/api/mini-draws/${miniDrawId}`);
      return response.data;
    },
    enabled: !!miniDrawId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useMiniDrawEntries = (miniDrawId?: string) => {
  return useQuery({
    queryKey: queryKeys.miniDraws.entries(miniDrawId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MiniDrawEntry[] }>(
        `/api/mini-draws/${miniDrawId}/entries`
      );
      return response.data;
    },
    enabled: !!miniDrawId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Refetch every 30 seconds for live updates
  });
};

export interface MiniDrawActivityItem {
  id: string;
  type: string;
  user: string;
  message: string;
  timestamp: string;
  entries: number;
  date: string;
}

export const useMiniDrawActivity = (miniDrawId?: string) => {
  return useQuery({
    queryKey: queryKeys.miniDraws.activity(miniDrawId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MiniDrawActivityItem[] }>(
        `/api/mini-draws/${miniDrawId}/activity`
      );
      return response.data;
    },
    enabled: !!miniDrawId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Refetch every 30 seconds for live updates
  });
};

export const useMiniDrawResults = () => {
  return useQuery({
    queryKey: queryKeys.miniDraws.results,
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MiniDrawType[] }>("/api/mini-draws/results");
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
};

export const useUserMiniDrawEntries = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.miniDraws.userEntries(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MiniDrawEntry[] }>("/api/mini-draws/user-entries");
      return response.data;
    },
    enabled: !!userId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
};

// Mutations
export const useEnterMiniDraw = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ miniDrawId, entryCount, paymentMethodId }: EntryData) => {
      const response = await apiPost<EntryResponse>("/api/mini-draws/enter", {
        miniDrawId,
        entryCount,
        paymentMethodId,
      });
      return response;
    },
    onSuccess: (data, variables) => {
      // Invalidate mini draw entries
      queryClient.invalidateQueries({ queryKey: queryKeys.miniDraws.entries(variables.miniDrawId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.miniDraws.userEntries("current-user") });

      // Update mini draw total entries in cache
      queryClient.setQueryData(queryKeys.miniDraws.detail(variables.miniDrawId), (old: MiniDrawType | undefined) => {
        if (old) {
          return {
            ...old,
            totalEntries: old.totalEntries + variables.entryCount,
          };
        }
        return old;
      });
    },
    onError: (error) => {
      console.error("Failed to enter mini draw:", error);
    },
  });
};

export const useCancelMiniDrawEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string) => {
      const response = await apiDelete<{ success: boolean; data: MiniDrawEntry }>(`/api/mini-draws/entries/${entryId}`);
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.miniDraws.entries(data.miniDrawId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.miniDraws.userEntries("current-user") });

      // Update mini draw total entries in cache
      queryClient.setQueryData(queryKeys.miniDraws.detail(data.miniDrawId), (old: MiniDrawType | undefined) => {
        if (old) {
          return {
            ...old,
            totalEntries: Math.max(0, old.totalEntries - data.entryCount),
          };
        }
        return old;
      });
    },
  });
};

// Utility hooks
export const useMiniDrawStats = (miniDrawId?: string) => {
  const { data: miniDraw } = useMiniDraw(miniDrawId);
  const { data: entries } = useMiniDrawEntries(miniDrawId);

  const totalEntries = entries?.reduce((sum, entry) => sum + entry.entryCount, 0) || 0;
  const uniqueParticipants = entries?.length || 0;
  const averageEntriesPerParticipant = uniqueParticipants > 0 ? totalEntries / uniqueParticipants : 0;

  return {
    totalEntries,
    uniqueParticipants,
    averageEntriesPerParticipant,
    totalPrizeValue: miniDraw?.prize.value || 0,
    status: miniDraw?.status ?? "active",
    entriesRemaining:
      miniDraw?.entriesRemaining ??
      Math.max((miniDraw?.minimumEntries || 0) - (miniDraw?.totalEntries || 0), 0),
  };
};

export const useUserMiniDrawStats = (userId?: string) => {
  const { data: userEntries } = useUserMiniDrawEntries(userId);

  const totalEntries = userEntries?.reduce((sum, entry) => sum + entry.entryCount, 0) || 0;
  const totalSpent = userEntries?.reduce((sum, entry) => sum + entry.totalCost, 0) || 0;
  const activeDraws =
    userEntries?.filter(() => {
      // This would need to be calculated based on mini draw end dates
      return true; // Simplified for now
    }).length || 0;

  return {
    totalEntries,
    totalSpent,
    activeDraws,
    totalDrawsEntered: userEntries?.length || 0,
  };
};

export const useMiniDrawPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchMiniDraw = (miniDrawId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.miniDraws.detail(miniDrawId),
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: MiniDrawType }>(`/api/mini-draws/${miniDrawId}`);
        return response.data;
      },
      staleTime: 1 * 60 * 1000,
    });
  };

  const prefetchMiniDrawEntries = (miniDrawId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.miniDraws.entries(miniDrawId),
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: MiniDrawEntry[] }>(
          `/api/mini-draws/${miniDrawId}/entries`
        );
        return response.data;
      },
      staleTime: 30 * 1000,
    });
  };

  return { prefetchMiniDraw, prefetchMiniDrawEntries };
};
