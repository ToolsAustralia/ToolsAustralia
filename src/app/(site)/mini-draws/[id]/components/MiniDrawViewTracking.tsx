"use client";

import { useEffect } from "react";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { useUserContext } from "@/contexts/UserContext";
import { getUserType } from "@/utils/tracking/user-type-helpers";
import { extractPageMetadata } from "@/utils/tracking/page-metadata-helpers";
import { usePathname } from "next/navigation";

interface MiniDrawViewTrackingProps {
  miniDraw: {
    _id: string;
    name: string;
    prize: {
      name: string;
      value: number;
    };
  };
}

/**
 * Client component to track ViewContent event when user views a mini draw detail page
 * This fires once when the component mounts (user views the mini draw page)
 */
export default function MiniDrawViewTracking({ miniDraw }: MiniDrawViewTrackingProps) {
  const { trackViewContent } = usePixelTracking();
  const { trackViewContent: trackKlaviyoViewContent } = useKlaviyoTracking();
  const { isAuthenticated } = useUserContext();
  const pathname = usePathname();

  useEffect(() => {
    // Extract page metadata and user type for enhanced tracking
    const pageMetadata = extractPageMetadata(
      pathname,
      typeof window !== "undefined" ? window.location.href : undefined
    );
    const userType = getUserType(isAuthenticated);

    // Track ViewContent event when user views the mini draw page
    trackViewContent({
      value: miniDraw.prize.value,
      currency: "AUD",
      productId: miniDraw._id,
      content_name: miniDraw.prize.name,
      content_category: "mini_draw",
      page_type: pageMetadata.page_type,
      user_type: userType,
      platform: "tools-australia-website",
    });

    // Track Klaviyo view content event
    trackKlaviyoViewContent({
      value: miniDraw.prize.value,
      currency: "AUD",
      product_id: miniDraw._id,
      product_name: miniDraw.prize.name,
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`📘 Facebook Pixel: ViewContent tracked for mini draw ${miniDraw.name}`);
    }
  }, [miniDraw, trackViewContent, trackKlaviyoViewContent, isAuthenticated, pathname]);

  // This component doesn't render anything
  return null;
}
