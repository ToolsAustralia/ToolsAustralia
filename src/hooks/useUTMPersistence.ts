"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { extractUTMParams } from "@/utils/tracking/utm-helpers";
import { setStoredUTMParams } from "@/utils/tracking/utm-storage";

/**
 * Persists UTM parameters to sessionStorage when user lands on any page with UTM.
 * Enables attribution at signup even if user navigates before registering.
 * Used by PromoLinkTracker in root layout for site-wide capture.
 *
 * @see docs/UTM_ATTRIBUTION.md
 */
export function useUTMPersistence() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (!search) return;

    const params = extractUTMParams(search);
    if (params.utm_source || params.utm_medium || params.utm_campaign) {
      setStoredUTMParams(params);
    }
  }, [pathname, searchParams]);
}
