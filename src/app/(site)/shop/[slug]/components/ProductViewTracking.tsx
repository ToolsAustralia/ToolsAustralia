"use client";

import { useEffect, useRef } from "react";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { useUserContext } from "@/contexts/UserContext";
import { getUserType } from "@/utils/tracking/user-type-helpers";
import { extractPageMetadata } from "@/utils/tracking/page-metadata-helpers";
import { usePathname } from "next/navigation";

interface ProductViewTrackingProps {
  product: {
    _id: string;
    name: string;
    price: number;
    brand: string;
    category?: string;
  };
}

/**
 * Fire ViewContent once per product view, to Meta (browser + CAPI), TikTok and
 * Klaviyo.
 *
 * ONCE is the whole point. `isAuthenticated` is in the effect's dependency list
 * because the payload carries `user_type`, and it flips false -> true the moment
 * the session resolves. That re-ran the effect, so every signed-in member
 * produced TWO ViewContent events for one page view — one tagged guest, one
 * tagged member — each with its own event id, so deduplication could not collapse
 * them. The ref guard keys on the product id, matching the convention in
 * usePromoPageTracking.
 *
 * The cost is that `user_type` reflects session state at first commit, which for
 * a member can read as guest. That is strictly better than double-counting, and
 * the server mirror resolves real identity from the session anyway.
 */
export default function ProductViewTracking({ product }: ProductViewTrackingProps) {
  const { trackViewContent } = usePixelTracking();
  const { trackViewContent: trackKlaviyoViewContent } = useKlaviyoTracking();
  const { isAuthenticated } = useUserContext();
  const pathname = usePathname();

  // Survives the re-render that a resolving session causes.
  const trackedProductIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (trackedProductIdRef.current === product._id) return;
    trackedProductIdRef.current = product._id;

    // Extract page metadata and user type for enhanced tracking
    const pageMetadata = extractPageMetadata(
      pathname,
      typeof window !== "undefined" ? window.location.href : undefined
    );
    const userType = getUserType(isAuthenticated);

    // Track ViewContent event when user views the product page
    trackViewContent({
      value: product.price,
      currency: "AUD",
      productId: product._id,
      content_name: product.name,
      content_category: product.brand,
      brand: product.brand,
      page_type: pageMetadata.page_type,
      user_type: userType,
      platform: "tools-australia-website",
    });

    // Track Klaviyo view content event
    trackKlaviyoViewContent({
      value: product.price,
      currency: "AUD",
      product_id: product._id,
      product_name: product.name,
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`📘 Facebook Pixel: ViewContent tracked for product ${product.name}`);
    }
  }, [product, trackViewContent, trackKlaviyoViewContent, isAuthenticated, pathname]);

  // This component doesn't render anything
  return null;
}
