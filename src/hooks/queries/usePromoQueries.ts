import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Types
export interface ActivePromo {
  id: string;
  type: "one-time-packages" | "mini-packages";
  multiplier: 2 | 3 | 5 | 10;
  startDate: string;
  endDate: string;
  duration: number;
  isActive: boolean;
  timeRemaining: number; // in milliseconds
  isExpired: boolean;
  createdAt?: string;
  createdBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface PromoHistory {
  id: string;
  type: "one-time-packages" | "mini-packages";
  multiplier: 2 | 3 | 5 | 10;
  startDate: string;
  endDate: string;
  duration: number;
  isActive: boolean;
  isExpired: boolean;
  timeRemaining: number;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface CreatePromoData {
  type: "one-time-packages" | "mini-packages";
  multiplier: string; // API expects string, will be converted to number
  startDate: string;
  endDate: string;
  duration: number;
  forceCreate?: boolean;
}

// API functions
const fetchActivePromos = async (): Promise<ActivePromo[]> => {
  const response = await fetch("/api/admin/promo/active", {
    method: "POST", // Using POST for public access
  });

  if (!response.ok) {
    throw new Error("Failed to fetch active promos");
  }

  const result = await response.json();
  return result.data || [];
};

const fetchAdminActivePromos = async (): Promise<ActivePromo[]> => {
  const response = await fetch("/api/admin/promo/active", {
    method: "GET", // Using GET for admin access
  });

  if (!response.ok) {
    throw new Error("Failed to fetch admin active promos");
  }

  const result = await response.json();
  return result.data || [];
};

const createPromo = async (
  data: CreatePromoData
): Promise<{
  success: boolean;
  data?: ActivePromo;
  conflict?: { existingPromo: ActivePromo; newPromoData: CreatePromoData };
}> => {
  const response = await fetch("/api/admin/promo/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  // Handle conflict response (409) - return the conflict data instead of throwing
  if (response.status === 409 && result.conflict) {
    return result;
  }

  if (!response.ok) {
    throw new Error(result.error || "Failed to create promo");
  }

  return result;
};

const endPromo = async (promoId: string): Promise<{ success: boolean; data?: ActivePromo }> => {
  const response = await fetch("/api/admin/promo/end", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ promoId }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to end promo");
  }

  return result;
};

const fetchPromoHistory = async (
  page: number = 1,
  limit: number = 10,
  type?: string
): Promise<{
  data: PromoHistory[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}> => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(type && { type }),
  });

  const response = await fetch(`/api/admin/promo/history?${params}`);

  if (!response.ok) {
    throw new Error("Failed to fetch promo history");
  }

  const result = await response.json();
  return result;
};

// React Query hooks
export const useActivePromos = () => {
  return useQuery({
    queryKey: ["promos", "active"],
    queryFn: fetchActivePromos,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refetch every 30 seconds for countdown accuracy
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
  });
};

export const useAdminActivePromos = () => {
  return useQuery({
    queryKey: ["promos", "admin", "active"],
    queryFn: fetchAdminActivePromos,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refetch every 30 seconds for countdown accuracy
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
  });
};

export const usePromoMultiplier = (packageType: "one-time" | "mini") => {
  const { data: promos } = useActivePromos();

  if (!promos || promos.length === 0) {
    return 1; // No active promo
  }

  // Find active promo for the package type
  const promoType = packageType === "one-time" ? "one-time-packages" : "mini-packages";
  const activePromo = promos.find((promo) => promo.type === promoType && promo.isActive && !promo.isExpired);

  return activePromo ? activePromo.multiplier : 1;
};

export const usePromoByType = (type: "one-time-packages" | "mini-packages") => {
  const { data: promos, ...rest } = useActivePromos();

  const promo = promos?.find((p) => p.type === type && p.isActive && !p.isExpired) || null;

  return {
    data: promo,
    ...rest,
  };
};

export const useCreatePromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPromo,
    onSuccess: () => {
      // Invalidate and refetch all promo-related queries
      queryClient.invalidateQueries({ queryKey: ["promos", "active"] });
      queryClient.invalidateQueries({ queryKey: ["promos", "admin", "active"] });
      queryClient.invalidateQueries({ queryKey: ["promos", "history"] });
    },
  });
};

export const useEndPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: endPromo,
    onSuccess: () => {
      // Invalidate and refetch all promo-related queries
      queryClient.invalidateQueries({ queryKey: ["promos", "active"] });
      queryClient.invalidateQueries({ queryKey: ["promos", "admin", "active"] });
      queryClient.invalidateQueries({ queryKey: ["promos", "history"] });
    },
  });
};

export const usePromoHistory = (page: number = 1, limit: number = 10, type?: string) => {
  return useQuery({
    queryKey: ["promos", "history", page, limit, type],
    queryFn: () => fetchPromoHistory(page, limit, type),
    staleTime: 60000, // 1 minute
  });
};

// Utility hook to get the highest priority promo for banner display
export const useHighestPriorityPromo = () => {
  const { data: promos } = useActivePromos();

  if (!promos || promos.length === 0) {
    return null;
  }

  // Sort by multiplier (highest first) and return the first active promo
  const sortedPromos = promos
    .filter((promo) => promo.isActive && !promo.isExpired)
    .sort((a, b) => b.multiplier - a.multiplier);

  return sortedPromos[0] || null;
};

// Utility hook to format time remaining
export const useFormattedTimeRemaining = (timeRemaining: number) => {
  const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

  return {
    days,
    hours,
    minutes,
    seconds,
    formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    shortFormatted: days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`,
  };
};
