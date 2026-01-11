import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  PromoBannerText,
  PromoBannerTextListResponse,
  PromoBannerTextResponse,
  CreatePromoBannerTextPayload,
  UpdatePromoBannerTextPayload,
} from "@/types/admin";

/**
 * Fetch currently active banner text (public, no auth required)
 */
export function useActivePromoBannerText() {
  return useQuery<PromoBannerTextResponse>({
    queryKey: ["promo-banner-text", "active"],
    queryFn: async () => {
      const response = await fetch("/api/admin/promo/banner-text/active", {
        cache: "no-store", // Prevent browser caching
      });
      if (!response.ok) {
        throw new Error("Failed to fetch active banner text");
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every 1 minute
    refetchIntervalInBackground: true, // Allow refetch in background for production reliability
    refetchOnWindowFocus: true,
    refetchOnMount: true, // Ensure fresh data on mount
  });
}

/**
 * Fetch all scheduled texts (admin only)
 */
export function usePromoBannerTexts() {
  return useQuery<PromoBannerTextListResponse>({
    queryKey: ["promo-banner-text", "list"],
    queryFn: async () => {
      const response = await fetch("/api/admin/promo/banner-text");
      if (!response.ok) {
        throw new Error("Failed to fetch banner texts");
      }
      return response.json();
    },
  });
}

/**
 * Create a new scheduled text
 */
export function useCreatePromoBannerText() {
  const queryClient = useQueryClient();

  return useMutation<PromoBannerTextResponse, Error, CreatePromoBannerTextPayload>({
    mutationFn: async (data) => {
      const response = await fetch("/api/admin/promo/banner-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create banner text");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["promo-banner-text"] });
    },
  });
}

/**
 * Update a scheduled text
 */
export function useUpdatePromoBannerText() {
  const queryClient = useQueryClient();

  return useMutation<PromoBannerTextResponse, Error, { id: string; data: UpdatePromoBannerTextPayload }>({
    mutationFn: async ({ id, data }) => {
      const response = await fetch(`/api/admin/promo/banner-text/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update banner text");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["promo-banner-text"] });
    },
  });
}

/**
 * Delete a scheduled text
 */
export function useDeletePromoBannerText() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message?: string }, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/admin/promo/banner-text/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete banner text");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["promo-banner-text"] });
    },
  });
}

