"use client";

import { useMemo } from "react";
import { getStoredUTMParams } from "@/utils/tracking/utm-storage";
import type { AttributionParams } from "@/types/tracking";

/**
 * Hook to get current session attribution params for API calls.
 * Reads from sessionStorage (populated by useUTMPersistence when user lands with UTM/attribution in URL).
 * Use when calling purchase APIs to pass attribution for PaymentEvent storage.
 *
 * @returns AttributionParams | null - null if no stored attribution or expired
 *
 * @example
 * const attribution = useAttribution();
 * await createSubscription({ ...data, attribution: attribution ?? undefined });
 *
 * @see docs/PAYMENT_ATTRIBUTION.md
 */
export function useAttribution(): AttributionParams | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    return getStoredUTMParams();
  }, []); // Re-read on mount; sessionStorage changes from navigation are reflected on next mount
}
