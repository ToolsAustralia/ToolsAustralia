"use client";

import { useEffect } from "react";
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
 * Client component to track ViewContent event when user views a product detail page
 * This fires once when the component mounts (user views the product page)
 */
export default function ProductViewTracking({ product }: ProductViewTrackingProps) {
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
      productId: product._id,
      productName: product.name,
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`📘 Facebook Pixel: ViewContent tracked for product ${product.name}`);
    }
  }, [product, trackViewContent, isAuthenticated, pathname]);

  // This component doesn't render anything
  return null;
}
