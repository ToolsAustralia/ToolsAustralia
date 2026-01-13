"use client";

import { useCallback } from "react";

/**
 * Hook to track experiment events
 */
export function useExperimentTracking() {
  const trackEvent = useCallback(
    async (
      experimentId: string,
      variantId: string,
      eventType: "page_view" | "click" | "conversion" | "lead" | "purchase" | "other",
      metadata?: Record<string, unknown>
    ) => {
      try {
        await fetch("/api/ab-testing/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            experimentId,
            variantId,
            eventType,
            metadata,
          }),
        });
      } catch (error) {
        // Silently fail - tracking should not break user experience
        console.error("Error tracking experiment event:", error);
      }
    },
    []
  );

  return { trackEvent };
}

