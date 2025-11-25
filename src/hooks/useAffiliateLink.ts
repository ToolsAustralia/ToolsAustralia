"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const AFFILIATE_STORAGE_KEY = "affiliate_code";

/**
 * Hook to track affiliate links from URL parameters
 * Stores affiliate code in sessionStorage for use during registration
 * Works with Next.js App Router - automatically re-checks on route changes
 */
export function useAffiliateLink() {
  const [affiliateCode, setAffiliateCode] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check URL parameter (works with App Router)
    const urlCode = searchParams.get("aff");

    if (urlCode) {
      // Store in sessionStorage
      const normalizedCode = urlCode.trim().toUpperCase();
      window.sessionStorage.setItem(AFFILIATE_STORAGE_KEY, normalizedCode);
      setAffiliateCode(normalizedCode);
    } else {
      // Check sessionStorage for existing code
      const storedCode = window.sessionStorage.getItem(AFFILIATE_STORAGE_KEY);
      if (storedCode) {
        setAffiliateCode(storedCode);
      } else {
        // Clear state if no code found
        setAffiliateCode(null);
      }
    }
  }, [pathname, searchParams]); // Re-run on route changes

  const clearAffiliateCode = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(AFFILIATE_STORAGE_KEY);
    setAffiliateCode(null);
  };

  return {
    affiliateCode,
    hasAffiliateCode: !!affiliateCode,
    clearAffiliateCode,
  };
}
