"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { VariantConfig } from "@/models/ab-testing/Variant";

interface VariantAssignmentResult {
  variantId: string | null;
  variantConfig: VariantConfig | null;
  anonymousId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface CachedAssignment {
  variantId: string | null;
  variantConfig: VariantConfig | null;
  anonymousId: string | null;
  timestamp: number;
  experimentId: string;
  slug: string;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = "ab_assignment_";

/**
 * Get cache key for assignment
 */
function getCacheKey(experimentId: string, slug: string): string {
  return `${CACHE_KEY_PREFIX}${experimentId}_${slug}`;
}

/**
 * Get cached assignment from sessionStorage
 */
function getCachedAssignment(experimentId: string, slug: string): CachedAssignment | null {
  if (typeof window === "undefined") return null;

  try {
    const cacheKey = getCacheKey(experimentId, slug);
    const cached = sessionStorage.getItem(cacheKey);
    if (!cached) return null;

    const parsed: CachedAssignment = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid
    if (now - parsed.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }

    // Verify cache is for same experiment and slug
    if (parsed.experimentId !== experimentId || parsed.slug !== slug) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Error reading cached assignment:", error);
    return null;
  }
}

/**
 * Cache assignment in sessionStorage
 */
function setCachedAssignment(experimentId: string, slug: string, data: Omit<CachedAssignment, "timestamp" | "experimentId" | "slug">): void {
  if (typeof window === "undefined") return;

  try {
    const cacheKey = getCacheKey(experimentId, slug);
    const cached: CachedAssignment = {
      ...data,
      timestamp: Date.now(),
      experimentId,
      slug,
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch (error) {
    console.error("Error caching assignment:", error);
    // Ignore quota exceeded errors
  }
}

/**
 * Hook to get variant assignment for current page
 * Handles preview mode (admin cookie override), request deduplication, and caching
 */
export function useVariantAssignment(experimentId: string | null): VariantAssignmentResult {
  const pathname = usePathname();
  const abortControllerRef = useRef<AbortController | null>(null);
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

    // Extract slug from pathname (e.g., /promotions/ford-f150 -> ford-f150)
    const slug = pathname.split("/").pop() || "";

    // Check cache first
    const cached = getCachedAssignment(experimentId, slug);
    if (cached) {
      setState({
        variantId: cached.variantId,
        variantConfig: cached.variantConfig,
        anonymousId: cached.anonymousId,
        isLoading: false,
        error: null,
      });
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Retry logic with exponential backoff
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Check if request was aborted before each attempt
          if (abortController.signal.aborted) {
            return;
          }

          // Exponential backoff: 0ms, 200ms, 400ms, 800ms
          if (attempt > 0) {
            const delay = Math.min(200 * Math.pow(2, attempt - 1), 2000);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          const response = await fetch("/api/ab-testing/assign", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              experimentId,
              slug,
            }),
            signal: abortController.signal,
          });

          // Check if request was aborted
          if (abortController.signal.aborted) {
            return;
          }

          if (!response.ok) {
            // Don't retry on 4xx errors (client errors)
            if (response.status >= 400 && response.status < 500) {
              throw new Error(`Failed to assign variant: ${response.status}`);
            }
            // Retry on 5xx errors (server errors)
            throw new Error(`Server error: ${response.status}`);
          }

          const data = await response.json();
          
          // Success - break out of retry loop
          lastError = null;
          
          // Cache the result
          setCachedAssignment(experimentId, slug, {
            variantId: data.variantId,
            variantConfig: data.variantConfig,
            anonymousId: data.anonymousId,
          });

          // Only update state if request wasn't aborted
          if (!abortController.signal.aborted) {
            setState({
              variantId: data.variantId,
              variantConfig: data.variantConfig,
              anonymousId: data.anonymousId,
              isLoading: false,
              error: null,
            });
          }
          
          return; // Success, exit function
        } catch (error) {
          lastError = error instanceof Error ? error : new Error("Unknown error");
          
          // Don't retry on abort errors
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          // Don't retry on client errors (4xx)
          if (error instanceof Error && error.message.includes("Failed to assign variant:")) {
            throw error;
          }

          // If this was the last attempt, throw the error
          if (attempt === maxRetries) {
            throw lastError;
          }

          // Log retry attempt (only in development)
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `[A/B Testing] Assignment request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`,
              error
            );
          }
        }
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      console.error("Error fetching variant assignment after retries:", error);
      
      // Only update state if request wasn't aborted
      if (!abortController.signal.aborted) {
        // Graceful fallback: Return null config (components will use defaults)
        setState({
          variantId: null,
          variantConfig: null,
          anonymousId: null,
          isLoading: false,
          error: null, // Don't show error to user, gracefully degrade
        });
      }
    } finally {
      // Clear abort controller if this was the active request
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }, [experimentId, pathname]);

  useEffect(() => {
    fetchAssignment();

    // Cleanup: abort any pending request on unmount or dependency change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [fetchAssignment]);

  return state;
}

