"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isToolsetLandingSlug } from "@/config/promo-landing-slugs";
import { isValidPromoSlug } from "@/utils/promo-analytics/validate-promo-slug";

const PROMO_ATTRIBUTION_STORAGE_KEY = "tools-aus:promo-attribution";

interface PromoAttribution {
  pageType: "evergreen" | "toolset";
  slug: string;
  visitedAt: string;
}

function getPageTypeAndSlugFromPathname(pathname: string): { pageType: "evergreen" | "toolset"; slug: string } | null {
  const match = pathname.match(/^\/promotions\/([^/?#]+)/);
  if (!match || !match[1]) return null;
  const slug = match[1].toLowerCase().trim();
  if (!isValidPromoSlug(slug)) return null;
  const pageType = isToolsetLandingSlug(slug) ? "toolset" : "evergreen";
  return { pageType, slug };
}

/**
 * Track promotion page visits and store attribution for checkout.
 * Used by PromotionsLayoutShell on /promotions/* pages.
 *
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
export function usePromoPageTracking() {
  const pathname = usePathname();
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !pathname?.startsWith("/promotions/")) return;

    const parsed = getPageTypeAndSlugFromPathname(pathname);
    if (!parsed) return;

    const { pageType, slug } = parsed;
    const dedupeKey = `${pageType}:${slug}`;
    if (lastTrackedRef.current === dedupeKey) return;
    lastTrackedRef.current = dedupeKey;

    const attribution: PromoAttribution = {
      pageType,
      slug,
      visitedAt: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(PROMO_ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
    } catch {
      // Ignore storage errors
    }

    const utmParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const payload = {
      pageType,
      slug,
      ...(utmParams?.get("utm_source") && { utmSource: utmParams.get("utm_source") }),
      ...(utmParams?.get("utm_medium") && { utmMedium: utmParams.get("utm_medium") }),
      ...(utmParams?.get("utm_campaign") && { utmCampaign: utmParams.get("utm_campaign") }),
      ...(utmParams?.get("campaign_id") && !utmParams?.get("utm_campaign") && { utmCampaign: `fb_${utmParams.get("campaign_id")}` }),
    };

    fetch("/api/tracking/promo-page-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget, ignore errors
    });
  }, [pathname]);
}

/**
 * Get stored promo attribution from session (for checkout).
 */
export function getStoredPromoAttribution(): PromoAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PROMO_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PromoAttribution;
    if (parsed?.pageType && parsed?.slug) return parsed;
    return null;
  } catch {
    return null;
  }
}
