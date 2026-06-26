"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { extractAttributionParams } from "@/utils/tracking/utm-helpers";
import { setStoredUTMParams } from "@/utils/tracking/utm-storage";
import { writeAttributionCookie, writeLastTouchAttributionCookie } from "@/utils/tracking/attribution-cookie";

/**
 * Persists UTM and attribution parameters to sessionStorage when user lands on any page.
 * Includes utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_id, adset_id, ad_id.
 * Enables attribution at signup and purchase even if user navigates before converting.
 * Used by PromoLinkTracker in root layout for site-wide capture.
 *
 * @see docs/UTM_ATTRIBUTION.md
 * @see docs/PAYMENT_ATTRIBUTION.md
 */
export function useUTMPersistence() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (!search) return;

    const params = extractAttributionParams(search);
    const hasAny =
      params.utm_source ||
      params.utm_medium ||
      params.utm_campaign ||
      params.utm_content ||
      params.utm_term ||
      params.campaign_id ||
      params.adset_id ||
      params.ad_id;
    if (hasAny) {
      setStoredUTMParams(params);              // legacy session store (transitional)
      writeAttributionCookie(params);          // durable, login/OAuth-immune, FIRST-touch (paid)
      writeLastTouchAttributionCookie(params); // overwriting LAST-touch (owned channels: Klaviyo)
    }
  }, [pathname, searchParams]);
}
