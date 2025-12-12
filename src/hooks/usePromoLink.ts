"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const PROMO_LINK_STORAGE_KEY = "tools-aus:promo-link";

const normalizeCode = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const trimmed = code.trim();
  return trimmed.length ? trimmed.toUpperCase() : null;
};

/**
 * Hook to track promo link codes from URL parameters
 * Stores promo code in sessionStorage for use during checkout
 * Works with Next.js App Router - automatically re-checks on route changes
 *
 * Supports both ?promo=CODE and ?bonus=CODE URL parameters
 */
export const usePromoLink = () => {
  const [promoCode, setPromoCodeState] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check URL parameters (works with App Router)
    // Support both ?promo=CODE and ?bonus=CODE for flexibility
    const urlCode = normalizeCode(searchParams.get("promo") || searchParams.get("bonus"));

    if (urlCode) {
      // Store in sessionStorage
      window.sessionStorage.setItem(PROMO_LINK_STORAGE_KEY, urlCode);
      setPromoCodeState(urlCode);
      console.log(`[PROMO LINK] Code found in URL, saved to sessionStorage:`, urlCode);
    } else {
      // Check sessionStorage for existing code
      const storedCode = normalizeCode(window.sessionStorage.getItem(PROMO_LINK_STORAGE_KEY));
      if (storedCode) {
        setPromoCodeState(storedCode);
        console.log(`[PROMO LINK] Code retrieved from sessionStorage:`, storedCode);
      } else {
        // Clear state if no code found
        setPromoCodeState(null);
      }
    }
  }, [pathname, searchParams]); // Re-run on route changes

  // Also check sessionStorage on mount (in case useEffect hasn't run yet)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (promoCode) return; // Already have a code, don't overwrite

    // Check sessionStorage one more time on mount
    const storedCode = normalizeCode(window.sessionStorage.getItem(PROMO_LINK_STORAGE_KEY));
    if (storedCode) {
      setPromoCodeState(storedCode);
    }
  }, []); // Run once on mount

  const setPromoCode = useCallback((code: string | null) => {
    if (typeof window === "undefined") return;

    const normalized = normalizeCode(code);
    if (normalized) {
      window.sessionStorage.setItem(PROMO_LINK_STORAGE_KEY, normalized);
      setPromoCodeState(normalized);
    } else {
      window.sessionStorage.removeItem(PROMO_LINK_STORAGE_KEY);
      setPromoCodeState(null);
    }
  }, []);

  const clearPromoCode = useCallback(() => {
    setPromoCode(null);
  }, [setPromoCode]);

  return {
    promoCode,
    hasPromoCode: !!promoCode,
    setPromoCode,
    clearPromoCode,
  };
};
