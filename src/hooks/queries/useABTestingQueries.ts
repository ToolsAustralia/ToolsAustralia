import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { VariantConfig } from "@/models/ab-testing/Variant";

// Types
export interface StoppingRules {
  minConversions?: number;
  confidenceThreshold?: number;
  maxDuration?: number;
  autoEndEnabled?: boolean;
}

export interface StatisticalResults {
  pValue?: number;
  confidence?: number;
  significant?: boolean;
  lift?: number;
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
  calculatedAt?: string;
}

export interface Experiment {
  _id: string;
  name: string;
  status: "draft" | "active" | "paused" | "ended";
  slugTargets: string[];
  startDate?: string;
  endDate?: string;
  stoppingRules?: StoppingRules;
  winnerVariantId?: string;
  endedReason?: "manual" | "date_reached" | "stopping_rule_met" | "auto_significant";
  statisticalResults?: StatisticalResults;
  archived?: boolean;
  createdBy: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Variant {
  _id: string;
  experimentId: string;
  name: string;
  trafficPercentage: number;
  config: VariantConfig;
  isControl: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentWithVariants {
  experiment: Experiment;
  variants: Variant[];
}

export interface ExperimentsResponse {
  success: boolean;
  data: Experiment[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ExperimentResponse {
  success: boolean;
  data: ExperimentWithVariants;
}

export interface CreateExperimentPayload {
  name: string;
  status?: "draft" | "active" | "paused" | "ended";
  slugTargets: string[];
  startDate?: string;
  endDate?: string;
  stoppingRules?: StoppingRules;
}

export interface UpdateExperimentPayload {
  name?: string;
  status?: "draft" | "active" | "paused" | "ended";
  slugTargets?: string[];
  startDate?: string;
  endDate?: string;
  stoppingRules?: StoppingRules;
}

export interface CreateVariantPayload {
  name: string;
  trafficPercentage: number;
  config: Variant["config"];
  isControl?: boolean;
}

export interface UpdateVariantPayload {
  name?: string;
  trafficPercentage?: number;
  config?: Variant["config"];
  isControl?: boolean;
}

/**
 * Hook to fetch list of experiments
 */
export function useExperiments(filters?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<ExperimentsResponse["data"]>({
    queryKey: ["ab-testing", "experiments", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.search) params.append("search", filters.search);
      if (filters?.page) params.append("page", filters.page.toString());
      if (filters?.limit) params.append("limit", filters.limit.toString());

      const response = await fetch(`/api/admin/ab-testing/experiments?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch experiments");

      const result: ExperimentsResponse = await response.json();
      if (!result.success) throw new Error("Failed to fetch experiments");

      return result.data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch single experiment with variants
 */
export function useExperiment(experimentId: string | null) {
  return useQuery<ExperimentWithVariants>({
    queryKey: ["ab-testing", "experiment", experimentId],
    queryFn: async () => {
      if (!experimentId) throw new Error("Experiment ID is required");

      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}`);
      if (!response.ok) throw new Error("Failed to fetch experiment");

      const result: ExperimentResponse = await response.json();
      if (!result.success) throw new Error("Failed to fetch experiment");

      return result.data;
    },
    enabled: !!experimentId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to create experiment
 */
export function useCreateExperiment() {
  const queryClient = useQueryClient();

  return useMutation<Experiment, Error, CreateExperimentPayload>({
    mutationFn: async (payload) => {
      const response = await fetch("/api/admin/ab-testing/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create experiment");
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Failed to create experiment");

      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiments"] });
    },
  });
}

/**
 * Hook to update experiment
 */
export function useUpdateExperiment() {
  const queryClient = useQueryClient();

  return useMutation<Experiment, Error, { experimentId: string; payload: UpdateExperimentPayload }>({
    mutationFn: async ({ experimentId, payload }) => {
      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update experiment");
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Failed to update experiment");

      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiments"] });
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiment", variables.experimentId] });
    },
  });
}

/**
 * Hook to activate experiment
 */
export function useActivateExperiment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (experimentId) => {
      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to activate experiment");
      }
    },
    onSuccess: (_, experimentId) => {
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiments"] });
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiment", experimentId] });
    },
  });
}

/**
 * Hook to pause experiment
 */
export function usePauseExperiment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (experimentId) => {
      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to pause experiment");
      }
    },
    onSuccess: (_, experimentId) => {
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiments"] });
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiment", experimentId] });
    },
  });
}

/**
 * Hook to end experiment
 */
export function useEndExperiment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (experimentId) => {
      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to end experiment");
      }
    },
    onSuccess: (_, experimentId) => {
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiments"] });
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiment", experimentId] });
    },
  });
}

/**
 * Hook to create variant
 */
export function useCreateVariant() {
  const queryClient = useQueryClient();

  return useMutation<Variant, Error, { experimentId: string; payload: CreateVariantPayload }>({
    mutationFn: async ({ experimentId, payload }) => {
      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create variant");
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Failed to create variant");

      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiment", variables.experimentId] });
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiments"] });
    },
  });
}

/**
 * Hook to update variant
 */
export function useUpdateVariant() {
  const queryClient = useQueryClient();

  return useMutation<
    Variant,
    Error,
    { experimentId: string; variantId: string; payload: UpdateVariantPayload }
  >({
    mutationFn: async ({ experimentId, variantId, payload }) => {
      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}/variants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, ...payload }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update variant");
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Failed to update variant");

      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiment", variables.experimentId] });
    },
  });
}

/**
 * Hook to delete variant
 */
export function useDeleteVariant() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { experimentId: string; variantId: string }>({
    mutationFn: async ({ experimentId, variantId }) => {
      const response = await fetch(
        `/api/admin/ab-testing/experiments/${experimentId}/variants?variantId=${variantId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete variant");
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiment", variables.experimentId] });
      queryClient.invalidateQueries({ queryKey: ["ab-testing", "experiments"] });
    },
  });
}

