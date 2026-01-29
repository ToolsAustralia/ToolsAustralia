import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ScheduledPromo,
  CreateScheduledPromoPayload,
  UpdateScheduledPromoPayload,
  ScheduledPromoListResponse,
} from "@/types/admin";

export type ScheduledPromoFilters = {
  type?: "membership-packages" | "one-time-packages" | "mini-packages";
  isActive?: boolean;
  dateFrom?: string;
  dateTo?: string;
  includeDeleted?: boolean;
};

export type EffectiveMultipliersResponse = Record<
  "membership-packages" | "one-time-packages" | "mini-packages",
  { multiplier: number | null; source: string; promoId?: string }
>;

const fetchScheduledPromos = async (filters?: ScheduledPromoFilters): Promise<ScheduledPromo[]> => {
  const params = new URLSearchParams();
  if (filters?.type) params.append("type", filters.type);
  if (filters?.isActive !== undefined) params.append("isActive", String(filters.isActive));
  if (filters?.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.append("dateTo", filters.dateTo);
  if (filters?.includeDeleted) params.append("includeDeleted", "true");

  const response = await fetch(`/api/admin/promo/scheduled/list?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch scheduled promos");
  }

  const result: ScheduledPromoListResponse = await response.json();
  return result.data || [];
};

const createScheduledPromo = async (data: CreateScheduledPromoPayload): Promise<ScheduledPromo> => {
  const response = await fetch("/api/admin/promo/scheduled/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to create scheduled promo");
  }

  return result.data;
};

const updateScheduledPromo = async ({
  id,
  data,
}: {
  id: string;
  data: UpdateScheduledPromoPayload;
}): Promise<ScheduledPromo> => {
  const response = await fetch(`/api/admin/promo/scheduled/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to update scheduled promo");
  }

  return result.data;
};

const deleteScheduledPromo = async (id: string): Promise<void> => {
  const response = await fetch(`/api/admin/promo/scheduled/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to delete scheduled promo");
  }
};

const fetchEffectiveMultipliers = async (): Promise<EffectiveMultipliersResponse> => {
  const response = await fetch("/api/admin/promo/effective");

  if (!response.ok) {
    throw new Error("Failed to fetch effective multipliers");
  }

  const result = await response.json();
  return result.data || {};
};

export const useScheduledPromos = (filters?: ScheduledPromoFilters) => {
  return useQuery({
    queryKey: ["promos", "scheduled", filters],
    queryFn: () => fetchScheduledPromos(filters),
    staleTime: 30000, // 30 seconds
  });
};

export const useCreateScheduledPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createScheduledPromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promos", "scheduled"] });
      queryClient.invalidateQueries({ queryKey: ["promos", "admin", "active"] });
    },
  });
};

export const useUpdateScheduledPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateScheduledPromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promos", "scheduled"] });
      queryClient.invalidateQueries({ queryKey: ["promos", "admin", "active"] });
    },
  });
};

export const useDeleteScheduledPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteScheduledPromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promos", "scheduled"] });
      queryClient.invalidateQueries({ queryKey: ["promos", "admin", "active"] });
    },
  });
};

export const useEffectiveMultipliers = () => {
  return useQuery({
    queryKey: ["promos", "effective"],
    queryFn: fetchEffectiveMultipliers,
    staleTime: 10000, // 10 seconds
  });
};
