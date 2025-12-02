"use client";

import { useEffect } from "react";
import { usePixelTracking } from "@/hooks/usePixelTracking";

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

  useEffect(() => {
    // Track ViewContent event when user views the mini draw page
    trackViewContent({
      value: miniDraw.prize.value,
      currency: "AUD",
      productId: miniDraw._id,
      content_name: miniDraw.prize.name,
      content_category: "mini_draw",
      content_type: "prize_draw",
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`📘 Facebook Pixel: ViewContent tracked for mini draw ${miniDraw.name}`);
    }
  }, [miniDraw, trackViewContent]);

  // This component doesn't render anything
  return null;
}
