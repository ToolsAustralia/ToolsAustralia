"use client";

import { useEffect } from "react";
import { usePixelTracking } from "@/hooks/usePixelTracking";

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

  useEffect(() => {
    // Track ViewContent event when user views the product page
    trackViewContent({
      value: product.price,
      currency: "AUD",
      productId: product._id,
      content_name: product.name,
      content_category: product.brand,
      content_type: "product",
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`📘 Facebook Pixel: ViewContent tracked for product ${product.name}`);
    }
  }, [product, trackViewContent]);

  // This component doesn't render anything
  return null;
}
