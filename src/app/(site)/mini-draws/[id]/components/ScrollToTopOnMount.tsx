"use client";

import { useEffect } from "react";

/**
 * Scrolls to top when the mini-draw detail page mounts or when navigating
 * to a different mini draw (e.g. from "You May Also Like").
 * Fixes the issue where navigating would land at the previous scroll position
 * instead of starting at the top of the new mini draw page.
 */
export default function ScrollToTopOnMount({ miniDrawId }: { miniDrawId: string }) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [miniDrawId]);

  return null;
}
