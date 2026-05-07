import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AlternatingPromoMultiplierListResponse,
  AlternatingPromoMultiplierResponse,
  CurrentAlternatingMultipliersResponse,
  CreateAlternatingPromoMultiplierPayload,
  UpdateAlternatingPromoMultiplierPayload,
  AlternatingPromoMultiplierType,
} from "@/types/admin";

/**
 * Fetch current alternating multipliers for all enabled types (public)
 * Used by frontend components to get current multipliers
 */
export function useCurrentAlternatingMultipliers() {
  return useQuery<CurrentAlternatingMultipliersResponse>({
    queryKey: ["alternating-multiplier", "current"],
    queryFn: async () => {
      const response = await fetch("/api/promo/alternating-multiplier/current", {
        cache: "no-store", // Prevent browser caching
      });
      if (!response.ok) {
        throw new Error("Failed to fetch current alternating multipliers");
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every 1 minute
    refetchIntervalInBackground: false, // Pause polling on hidden tabs; refetchOnWindowFocus catches up on tab focus
    refetchOnWindowFocus: true,
    refetchOnMount: true, // Ensure fresh data on mount
  });
}

/**
 * Fetch all alternating multiplier configurations (admin only)
 */
export function useAlternatingMultiplierConfigs() {
  return useQuery<AlternatingPromoMultiplierListResponse>({
    queryKey: ["alternating-multiplier", "list"],
    queryFn: async () => {
      const response = await fetch("/api/admin/promo/alternating-multiplier");
      if (!response.ok) {
        throw new Error("Failed to fetch alternating multiplier configurations");
      }
      return response.json();
    },
  });
}

/**
 * Fetch alternating multiplier configuration by type (admin only)
 */
export function useAlternatingMultiplierConfig(type: AlternatingPromoMultiplierType) {
  return useQuery<AlternatingPromoMultiplierResponse>({
    queryKey: ["alternating-multiplier", "type", type],
    queryFn: async () => {
      const response = await fetch(`/api/admin/promo/alternating-multiplier?type=${type}`);
      if (!response.ok) {
        if (response.status === 404) {
          return { success: true, data: null };
        }
        throw new Error("Failed to fetch alternating multiplier configuration");
      }
      const result = await response.json();
      // Return first config if found, or null
      return {
        success: true,
        data: result.data && result.data.length > 0 ? result.data[0] : null,
      };
    },
    enabled: !!type, // Only fetch if type is provided
  });
}

/**
 * Create or update (upsert) alternating multiplier configuration
 */
export function useCreateAlternatingMultiplier() {
  const queryClient = useQueryClient();

  return useMutation<AlternatingPromoMultiplierResponse, Error, CreateAlternatingPromoMultiplierPayload>({
    mutationFn: async (data) => {
      const response = await fetch("/api/admin/promo/alternating-multiplier", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create/update alternating multiplier configuration");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["alternating-multiplier"] });
    },
  });
}

/**
 * Update existing alternating multiplier configuration
 */
export function useUpdateAlternatingMultiplier() {
  const queryClient = useQueryClient();

  return useMutation<
    AlternatingPromoMultiplierResponse,
    Error,
    { id: string; data: UpdateAlternatingPromoMultiplierPayload }
  >({
    mutationFn: async ({ id, data }) => {
      const response = await fetch(`/api/admin/promo/alternating-multiplier/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update alternating multiplier configuration");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["alternating-multiplier"] });
    },
  });
}

/**
 * Delete alternating multiplier configuration
 */
export function useDeleteAlternatingMultiplier() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message?: string }, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/admin/promo/alternating-multiplier/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete alternating multiplier configuration");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["alternating-multiplier"] });
    },
  });
}

