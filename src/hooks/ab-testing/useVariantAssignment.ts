"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { VariantConfig } from "@/models/ab-testing/Variant";

interface VariantAssignmentResult {
  variantId: string | null;
  variantConfig: VariantConfig | null;
  anonymousId: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to get variant assignment for current page
 * Handles preview mode (admin cookie override)
 */
export function useVariantAssignment(experimentId: string | null): VariantAssignmentResult {
  const pathname = usePathname();
  const [state, setState] = useState<VariantAssignmentResult>({
    variantId: null,
    variantConfig: null,
    anonymousId: null,
    isLoading: true,
    error: null,
  });

  const fetchAssignment = useCallback(async () => {
    if (!experimentId) {
      setState({
        variantId: null,
        variantConfig: null,
        anonymousId: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Extract slug from pathname (e.g., /promotions/ford-f150 -> ford-f150)
      const slug = pathname.split("/").pop() || "";

      const response = await fetch("/api/ab-testing/assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          experimentId,
          slug,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to assign variant");
      }

      const data = await response.json();

      setState({
        variantId: data.variantId,
        variantConfig: data.variantConfig,
        anonymousId: data.anonymousId,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error("Error fetching variant assignment:", error);
      setState({
        variantId: null,
        variantConfig: null,
        anonymousId: null,
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [experimentId, pathname]);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  return state;
}

