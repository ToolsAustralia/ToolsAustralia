"use client";

import { useAffiliateLink } from "@/hooks/useAffiliateLink";

/**
 * Site-wide affiliate tracking component
 * Initializes affiliate code tracking on every page load
 * Captures affiliate code from URL and stores in sessionStorage
 * Silent component with no UI - just tracking logic
 */
export default function AffiliateTracker() {
  // Initialize affiliate link tracking - hook handles storage automatically
  // The useAffiliateLink hook automatically captures code from URL params
  // and stores it in sessionStorage, re-checking on route changes
  useAffiliateLink();

  // This component has no UI - it's purely for tracking
  return null;
}
